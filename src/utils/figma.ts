/**
 * Shared Figma utilities — URL parsing and screenshot fetching.
 * Used by both the Codegen Agent and the Diff Agent.
 */

import "dotenv/config";

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

/**
 * Fetches the width and height of a Figma node from the files API.
 * Falls back to null if the token is missing or the request fails.
 */
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
    const nodes = data["nodes"] as Record<string, { document?: { absoluteBoundingBox?: { width: number; height: number } } }> | undefined;
    const bbox = nodes?.[nodeId]?.document?.absoluteBoundingBox
      ?? nodes?.[nodeId.replace(":", "-")]?.document?.absoluteBoundingBox;

    if (!bbox) return null;
    return { width: Math.round(bbox.width), height: Math.round(bbox.height) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Node tree fetch + slim
// ---------------------------------------------------------------------------

type FigmaNode = Record<string, unknown>;
interface FigmaColor { r: number; g: number; b: number; a: number }

function colorToHex(c: FigmaColor): string {
  const h = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

// Heavy / irrelevant fields that inflate token count without helping codegen
const STRIP = new Set([
  "absoluteRenderBounds", "reactions", "exportSettings", "constraints",
  "layoutGrids", "transitionNodeID", "transitionEasing", "transitionDuration",
  "scrollBehavior", "preserveRatio", "pluginData", "sharedPluginData",
  "componentPropertyDefinitions", "variantProperties", "componentProperties",
  "overriddenFields", "styles", "devStatus", "styleOverrideTable",
  "characterStyleOverrides", "lineTypes", "lineIndentations",
]);

function slimNode(node: FigmaNode): FigmaNode {
  const out: FigmaNode = {};
  for (const [k, v] of Object.entries(node)) {
    if (STRIP.has(k)) continue;
    if (k === "children" && Array.isArray(v)) {
      out[k] = v.map((c) => slimNode(c as FigmaNode));
    } else if (k === "fills" && Array.isArray(v)) {
      // Add a human-readable colorHex next to the raw color object
      out[k] = (v as Array<Record<string, unknown>>).map((fill) =>
        fill["color"]
          ? { ...fill, colorHex: colorToHex(fill["color"] as FigmaColor) }
          : fill,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Fetches the Figma node tree and returns a slimmed version suitable for LLM prompts.
 * Colors are augmented with a `colorHex` field for easy extraction.
 * Returns null if the token is missing or the request fails.
 */
export async function fetchFigmaNodeTree(figmaUrl: string): Promise<FigmaNode | null> {
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
      | Record<string, { document?: FigmaNode }>
      | undefined;
    const doc =
      nodes?.[nodeId]?.document ??
      nodes?.[nodeId.replace(":", "-")]?.document;
    if (!doc) return null;

    return slimNode(doc);
  } catch {
    return null;
  }
}

/**
 * Fetches a PNG screenshot of a Figma node and returns it as a base64 string.
 * Requires FIGMA_ACCESS_TOKEN in the environment.
 */
export async function fetchFigmaScreenshot(figmaUrl: string): Promise<string> {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) throw new Error("FIGMA_ACCESS_TOKEN is not set");

  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);

  const res = await fetch(
    `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`,
    { headers: { "X-Figma-Token": token } },
  );
  if (!res.ok) throw new Error(`Figma images API returned ${res.status}`);

  const data = (await res.json()) as Record<string, unknown>;
  const images = data["images"] as Record<string, string> | undefined;
  const imageUrl = images?.[nodeId] ?? images?.[nodeId.replace(":", "-")];
  if (!imageUrl) throw new Error("Figma images API returned no URL for node");

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to download Figma image: ${imgRes.status}`);
  const buffer = await imgRes.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}
