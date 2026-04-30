// Figma REST API client.

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Vite sandbox serves these as /figma-assets/<hash>.png so the LLM can `<img src="...">` them directly.
const SANDBOX_ASSETS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../sandbox/public/figma-assets",
);
const ASSET_URL_PREFIX = "/figma-assets";

export interface FigmaUrlParts {
  fileKey: string;
  nodeId: string;
  componentName: string;
}

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
    .replace(/^(.)/, (c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "");
}

export function parseFigmaUrl(url: string): FigmaUrlParts {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid Figma URL: "${url}"`);
  }

  const match = parsed.pathname.match(
    /\/(file|design|proto|site|board)\/([^/?]+)(?:\/([^/?]+))?/,
  );
  if (!match) {
    throw new Error(
      `Could not extract file key from Figma URL: ${parsed.pathname}`,
    );
  }
  const fileKey = match[2];
  const rawFileName = match[3] ?? "Component";
  const componentName = toPascalCase(decodeURIComponent(rawFileName));

  const rawNodeId = parsed.searchParams.get("node-id");
  if (!rawNodeId) {
    throw new Error(
      `Figma URL is missing required ?node-id query parameter: "${url}"`,
    );
  }
  // Figma URLs use `1-2`, the API expects `1:2`.
  const nodeId = rawNodeId.replace(/-/g, ":");

  return { fileKey, nodeId, componentName };
}

export async function getFigmaNodeSize(
  figmaUrl: string,
): Promise<{ width: number; height: number } | null> {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) return null;

  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);

  try {
    const res = await fetch(
      `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
      { headers: { "X-Figma-Token": token } },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    const nodes = data["nodes"] as
      | Record<
          string,
          {
            document?: {
              absoluteBoundingBox?: { width: number; height: number };
            };
          }
        >
      | undefined;
    // The API sometimes echoes the node id back in URL form (`1-2`), so try both.
    const bbox =
      nodes?.[nodeId]?.document?.absoluteBoundingBox ??
      nodes?.[nodeId.replace(":", "-")]?.document?.absoluteBoundingBox;

    if (!bbox) return null;
    return {
      width: Math.round(bbox.width),
      height: Math.round(bbox.height),
    };
  } catch {
    return null;
  }
}

// Pruning — strip noise from the raw Figma node tree before sending to LLMs.
const STRIP_FIELDS = new Set([
  "exportSettings",
  "blendMode",
  "preserveRatio",
  "constraints",
  "layoutAlign",
  "layoutGrow",
  "layoutPositioning",
  "interactions",
  "transitionNodeID",
  "transitionDuration",
  "transitionEasing",
  "fillGeometry",
  "strokeGeometry",
  "relativeTransform",
  "size",
  "isFixed",
  "scrollBehavior",
  "componentPropertyReferences",
  "boundVariables",
  "explicitVariableModes",
  "fillOverrideTable",
  "annotations",
  "devStatus",
  "stackCounterAlignContent",
  "stackCounterAlignItems",
  "stackPrimaryAlignItems",
  "stackPrimarySizing",
  "stackCounterSizing",
  "stackJustify",
  "stackMode",
  "stackPadding",
]);

function pruneFill(
  fill: Record<string, unknown>,
): Record<string, unknown> | null {
  // IMAGE fills keep imageRef so it can be resolved to a real asset path; other fills strip it.
  if (fill["type"] === "IMAGE") {
    const out: Record<string, unknown> = { type: "IMAGE" };
    for (const [k, v] of Object.entries(fill)) {
      if (k === "type") continue;
      if (k === "gifRef") continue;
      if (v === null || v === undefined) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      out[k] = v;
    }
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fill)) {
    if (k === "imageRef" || k === "gifRef") continue;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

function pruneNode(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(pruneNode).filter((v) => v !== undefined);
  }
  if (node === null || typeof node !== "object") return node;

  const obj = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (STRIP_FIELDS.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    // Drop Figma defaults to reduce token noise.
    if (key === "visible" && value === true) continue;
    if (key === "clipsContent" && value === false) continue;

    if (key === "fills" || key === "strokes") {
      if (!Array.isArray(value)) continue;
      const pruned = value
        .map((f) =>
          typeof f === "object" && f !== null
            ? pruneFill(f as Record<string, unknown>)
            : f,
        )
        .filter((v) => v !== null && v !== undefined);
      if (pruned.length === 0) continue;
      out[key] = pruned;
      continue;
    }

    if (key === "absoluteBoundingBox" || key === "absoluteRenderBounds") {
      if (typeof value === "object" && value !== null) {
        const bbox = value as Record<string, number>;
        out[key] = {
          x: Math.round(bbox.x ?? 0),
          y: Math.round(bbox.y ?? 0),
          width: Math.round(bbox.width ?? 0),
          height: Math.round(bbox.height ?? 0),
        };
      }
      continue;
    }

    if (key === "children" && Array.isArray(value)) {
      const pruned = value.map(pruneNode).filter((v) => v !== undefined);
      if (pruned.length === 0) continue;
      out[key] = pruned;
      continue;
    }

    if (typeof value === "object") {
      out[key] = pruneNode(value);
      continue;
    }

    out[key] = value;
  }

  return out;
}

// imageRef asset pipeline — extract, fetch, resolve.
function collectImageRefs(node: unknown, target: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectImageRefs(item, target);
    return;
  }
  if (node === null || typeof node !== "object") return;

  const obj = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if ((key === "fills" || key === "strokes") && Array.isArray(value)) {
      for (const fill of value) {
        if (
          fill &&
          typeof fill === "object" &&
          (fill as Record<string, unknown>)["type"] === "IMAGE"
        ) {
          const ref = (fill as Record<string, unknown>)["imageRef"];
          if (typeof ref === "string" && ref.length > 0) target.add(ref);
        }
      }
      continue;
    }
    if (typeof value === "object") collectImageRefs(value, target);
  }
}

interface FigmaImagesResponse {
  err?: string | null;
  meta?: { images?: Record<string, string | null> };
  // Fallback: some responses put the map at the top level instead of under `meta`.
  images?: Record<string, string | null>;
}

async function fetchImageRefMap(
  fileKey: string,
  token: string,
): Promise<Record<string, string | null>> {
  const res = await fetch(`https://api.figma.com/v1/files/${fileKey}/images`, {
    headers: { "X-Figma-Token": token },
  });
  if (!res.ok) {
    throw new Error(
      `Figma /v1/files/${fileKey}/images failed: ${res.status} ${res.statusText}`,
    );
  }
  const data = (await res.json()) as FigmaImagesResponse;
  if (data.err)
    throw new Error(`Figma /v1/files/.../images error: ${data.err}`);
  return data.meta?.images ?? data.images ?? {};
}

async function downloadImageRef(
  cdnUrl: string,
  destPath: string,
): Promise<void> {
  const res = await fetch(cdnUrl);
  if (!res.ok) {
    throw new Error(`asset CDN fetch failed: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buf);
}

// Mutates the tree in-place. Unresolved hashes get `resolved: false` so the model can pick a fallback.
function resolveImageRefsInTree(
  node: unknown,
  refToPath: Record<string, string | null>,
): void {
  if (Array.isArray(node)) {
    for (const item of node) resolveImageRefsInTree(item, refToPath);
    return;
  }
  if (node === null || typeof node !== "object") return;

  const obj = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if ((key === "fills" || key === "strokes") && Array.isArray(value)) {
      for (const fill of value) {
        if (
          !fill ||
          typeof fill !== "object" ||
          (fill as Record<string, unknown>)["type"] !== "IMAGE"
        )
          continue;
        const f = fill as Record<string, unknown>;
        const ref = f["imageRef"];
        if (typeof ref !== "string") continue;
        const resolved = refToPath[ref];
        if (resolved) {
          f["imageRef"] = resolved;
        } else {
          f["resolved"] = false;
        }
      }
      continue;
    }
    if (typeof value === "object") resolveImageRefsInTree(value, refToPath);
  }
}

// REST API: node JSON metadata.

export interface FigmaDesignContext {
  json: unknown;
  jsonString: string;
}

export async function fetchFigmaNodeJson(
  figmaUrl: string,
): Promise<FigmaDesignContext> {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) throw new Error("FIGMA_ACCESS_TOKEN is not set");

  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
  console.log(`  [Figma] fileKey=${fileKey} nodeId=${nodeId}`);

  console.log("  [Figma] GET /v1/files/.../nodes ...");
  const res = await fetch(
    `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
    { headers: { "X-Figma-Token": token } },
  );
  if (!res.ok) {
    throw new Error(
      `Figma /v1/files/${fileKey}/nodes failed: ${res.status} ${res.statusText}`,
    );
  }

  const data = (await res.json()) as {
    nodes: Record<string, { document?: unknown } | undefined>;
  };
  // The API sometimes echoes the node id back in URL form (`1-2`), so try both.
  const docRaw =
    data.nodes?.[nodeId]?.document ??
    data.nodes?.[nodeId.replace(":", "-")]?.document;
  if (!docRaw) {
    throw new Error(
      `Figma response did not include node ${nodeId} (got keys: ${Object.keys(data.nodes ?? {}).join(", ")})`,
    );
  }

  const pruned = pruneNode(docRaw);

  // Best-effort: imageRef resolution failures are non-fatal — the model falls back to placeholders.
  const refs = new Set<string>();
  collectImageRefs(pruned, refs);
  if (refs.size > 0) {
    console.log(`  [Figma] resolving ${refs.size} imageRef asset(s)...`);
    try {
      const cdnMap = await fetchImageRefMap(fileKey, token);
      await fs.mkdir(SANDBOX_ASSETS_DIR, { recursive: true });
      const refToPath: Record<string, string | null> = {};
      let downloaded = 0;
      let unresolved = 0;
      await Promise.all(
        Array.from(refs).map(async (ref) => {
          const url = cdnMap[ref];
          if (!url) {
            refToPath[ref] = null;
            unresolved++;
            return;
          }
          const filename = `${ref}.png`;
          const destPath = path.join(SANDBOX_ASSETS_DIR, filename);
          try {
            await downloadImageRef(url, destPath);
            refToPath[ref] = `${ASSET_URL_PREFIX}/${filename}`;
            downloaded++;
          } catch (err) {
            console.warn(
              `  [Figma] imageRef ${ref.slice(0, 8)} failed: ${String(err)}`,
            );
            refToPath[ref] = null;
            unresolved++;
          }
        }),
      );
      console.log(
        `  [Figma] assets: ${downloaded} downloaded, ${unresolved} unresolved`,
      );
      resolveImageRefsInTree(pruned, refToPath);
    } catch (err) {
      console.warn(
        `  [Figma] imageRef resolution failed (proceeding with placeholders): ${String(err)}`,
      );
    }
  }

  const jsonString = JSON.stringify(pruned, null, 2);
  console.log(
    `  [Figma] node JSON pruned (${Math.round(jsonString.length / 1024)} KB)`,
  );

  return { json: pruned, jsonString };
}

// REST API: screenshot.

export async function fetchFigmaScreenshot(figmaUrl: string): Promise<string> {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) throw new Error("FIGMA_ACCESS_TOKEN is not set");

  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);

  console.log("  [Figma] GET /v1/images/... ...");
  const imgRes = await fetch(
    `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`,
    { headers: { "X-Figma-Token": token } },
  );
  if (!imgRes.ok) {
    throw new Error(
      `Figma /v1/images/${fileKey} failed: ${imgRes.status} ${imgRes.statusText}`,
    );
  }

  const imgData = (await imgRes.json()) as {
    err?: string | null;
    images: Record<string, string | null>;
  };
  if (imgData.err) throw new Error(`Figma /v1/images error: ${imgData.err}`);

  // The API sometimes echoes the node id back in URL form (`1-2`), so try both.
  const cdnUrl =
    imgData.images?.[nodeId] ?? imgData.images?.[nodeId.replace(":", "-")];
  if (!cdnUrl) {
    throw new Error(
      `Figma /v1/images returned no URL for node ${nodeId} (got: ${JSON.stringify(imgData.images)})`,
    );
  }

  const pngRes = await fetch(cdnUrl);
  if (!pngRes.ok) {
    throw new Error(
      `Figma image CDN fetch failed: ${pngRes.status} ${pngRes.statusText}`,
    );
  }
  const buf = Buffer.from(await pngRes.arrayBuffer());
  const b64 = buf.toString("base64");
  console.log(
    `  [Figma] screenshot fetched (${Math.round(buf.length / 1024)} KB)`,
  );
  return b64;
}
