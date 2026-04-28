import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIGMA_CACHE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../output/figma-cache",
);

export async function clearFigmaCache(): Promise<number> {
  try {
    const entries = await fs.readdir(FIGMA_CACHE_DIR, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      const full = path.join(FIGMA_CACHE_DIR, entry.name);
      if (entry.isDirectory()) {
        await fs.rm(full, { recursive: true });
      } else {
        await fs.unlink(full);
      }
      count++;
    }
    return count;
  } catch {
    return 0;
  }
}

async function readFigmaCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(
      path.join(FIGMA_CACHE_DIR, `${key}.json`),
      "utf-8",
    );
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeFigmaCache(key: string, data: unknown): Promise<void> {
  await fs.mkdir(FIGMA_CACHE_DIR, { recursive: true });
  await fs.writeFile(
    path.join(FIGMA_CACHE_DIR, `${key}.json`),
    JSON.stringify(data, null, 2),
    "utf-8",
  );
}

function figmaCacheKey(
  prefix: string,
  fileKey: string,
  nodeId: string,
): string {
  return (
    prefix +
    "-" +
    crypto
      .createHash("sha256")
      .update(`${fileKey}:${nodeId}`)
      .digest("hex")
      .slice(0, 16)
  );
}

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
  const nodeId = rawNodeId.replace(/-/g, ":");

  return { fileKey, nodeId, componentName };
}

export async function getFigmaNodeSize(
  figmaUrl: string,
): Promise<{ width: number; height: number } | null> {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) return null;

  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
  const cacheKey = figmaCacheKey("size", fileKey, nodeId);
  const cached = await readFigmaCache<{ width: number; height: number }>(
    cacheKey,
  );
  if (cached) return cached;

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
    const bbox =
      nodes?.[nodeId]?.document?.absoluteBoundingBox ??
      nodes?.[nodeId.replace(":", "-")]?.document?.absoluteBoundingBox;

    if (!bbox) return null;
    const result = {
      width: Math.round(bbox.width),
      height: Math.round(bbox.height),
    };
    await writeFigmaCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pruning — strip noise from the raw Figma node tree before sending to LLMs
// ---------------------------------------------------------------------------

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

function pruneFill(fill: Record<string, unknown>): Record<string, unknown> | null {
  const type = fill["type"];
  if (type === "IMAGE") {
    return { type: "IMAGE", placeholder: true };
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
    if (key === "visible" && value === true) continue;
    if (key === "clipsContent" && value === false) continue;

    if (key === "fills" || key === "strokes") {
      if (!Array.isArray(value)) continue;
      const pruned = value
        .map((f) => (typeof f === "object" && f !== null ? pruneFill(f as Record<string, unknown>) : f))
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

// ---------------------------------------------------------------------------
// REST API: node JSON metadata
// ---------------------------------------------------------------------------

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

  const cacheKey = figmaCacheKey("nodejson", fileKey, nodeId);
  const cached = await readFigmaCache<FigmaDesignContext>(cacheKey);
  if (cached) {
    console.log("  [Figma] node JSON cache hit");
    return cached;
  }

  console.log("  [Figma] GET /v1/files/.../nodes …");
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
  const docRaw =
    data.nodes?.[nodeId]?.document ??
    data.nodes?.[nodeId.replace(":", "-")]?.document;
  if (!docRaw) {
    throw new Error(
      `Figma response did not include node ${nodeId} (got keys: ${Object.keys(data.nodes ?? {}).join(", ")})`,
    );
  }

  const pruned = pruneNode(docRaw);
  const jsonString = JSON.stringify(pruned, null, 2);
  console.log(
    `  [Figma] node JSON pruned (${Math.round(jsonString.length / 1024)} KB)`,
  );

  const result: FigmaDesignContext = { json: pruned, jsonString };
  await writeFigmaCache(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// REST API: screenshot
// ---------------------------------------------------------------------------

export async function fetchFigmaScreenshot(figmaUrl: string): Promise<string> {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) throw new Error("FIGMA_ACCESS_TOKEN is not set");

  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
  const cacheKey = figmaCacheKey("screenshot", fileKey, nodeId);
  const cached = await readFigmaCache<{ b64: string }>(cacheKey);
  if (cached) {
    console.log("  [Figma] screenshot cache hit");
    return cached.b64;
  }

  console.log("  [Figma] GET /v1/images/... …");
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

  // Also persist the PNG file for debugging convenience.
  const screenshotDir = path.join(FIGMA_CACHE_DIR, "screenshots");
  await fs.mkdir(screenshotDir, { recursive: true });
  await fs.writeFile(path.join(screenshotDir, `${cacheKey}.png`), buf);

  await writeFigmaCache(cacheKey, { b64 });
  console.log(`  [Figma] screenshot fetched (${Math.round(buf.length / 1024)} KB)`);
  return b64;
}
