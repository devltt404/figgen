/**
 * Ingestion Agent — src/agents/ingestion.ts
 *
 * Role in the multi-agent system:
 *   First agent in the pipeline. Accepts a Figma URL, fetches the full
 *   design data via the Figma REST API, and returns a structured
 *   FigmaContext that every downstream agent can consume.
 *
 * Input:  figmaUrl: string  — a valid Figma design/file/site/proto URL
 * Output: FigmaContext      — node tree, design tokens, screenshot, assets
 *
 * IMPORTANT: This is a pure agent function. Zero imports from @mastra/core
 * or any orchestration framework. The Mastra wrapper lives in src/mastra/.
 */

import 'dotenv/config';
import { parseFigmaResponse } from '../utils/figma-parser.js';
import { extractTokens } from '../utils/token-mapper.js';
import type { FigmaContext, Asset } from '../types/index.js';

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

interface FigmaUrlParts {
  fileKey: string;
  nodeId: string;
}

/**
 * Extract fileKey and nodeId from a Figma URL.
 * Supported formats (all converted from URL dashes to API colons in node-id):
 *   https://www.figma.com/file/{key}/...?node-id={id}
 *   https://www.figma.com/design/{key}/...?node-id={id}
 *   https://www.figma.com/proto/{key}/...?node-id={id}
 *   https://www.figma.com/site/{key}/...?node-id={id}   ← Community
 *   https://www.figma.com/board/{key}/...?node-id={id}  ← FigJam
 */
function parseFigmaUrl(url: string): FigmaUrlParts {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid Figma URL: "${url}"`);
  }

  const match = parsed.pathname.match(/\/(file|design|proto|site|board)\/([^/?]+)/);
  if (!match) {
    throw new Error(
      `Could not extract file key from Figma URL. ` +
        `Expected a path like /design/{key}, /file/{key}, or /site/{key}. Got: ${parsed.pathname}`
    );
  }
  const fileKey = match[2];

  const rawNodeId = parsed.searchParams.get('node-id');
  if (!rawNodeId) {
    throw new Error(
      `Figma URL is missing required ?node-id query parameter: "${url}"`
    );
  }

  // Convert URL format (dashes) to API format (colons)
  const nodeId = rawNodeId.replace(/-/g, ':');

  return { fileKey, nodeId };
}

// ---------------------------------------------------------------------------
// Figma REST API helpers
// ---------------------------------------------------------------------------

const FIGMA_API = 'https://api.figma.com/v1';

function figmaHeaders(token: string): Record<string, string> {
  return { 'X-Figma-Token': token };
}

async function figmaFetch(path: string, token: string): Promise<unknown> {
  const res = await fetch(`${FIGMA_API}${path}`, {
    headers: figmaHeaders(token),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Figma API ${path} → HTTP ${res.status}: ${body}`);
  }
  return res.json() as Promise<unknown>;
}

/**
 * Fetch the node tree for a specific node from the Figma files API.
 * Returns: { nodes: { [nodeId]: { document: {...} } } }
 */
async function fetchNodeData(fileKey: string, nodeId: string, token: string): Promise<unknown> {
  return figmaFetch(`/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`, token);
}

/**
 * Fetch a rendered PNG image URL for the given node, then download it
 * and return as a base64 string.
 */
async function fetchNodeScreenshot(fileKey: string, nodeId: string, token: string): Promise<string> {
  // Step 1 — ask Figma to render the node as PNG, returns { images: { [nodeId]: url } }
  const data = await figmaFetch(
    `/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=1`,
    token
  ) as Record<string, unknown>;

  const images = data['images'] as Record<string, string> | undefined;
  // Figma returns the nodeId with : separators in the response
  const imageUrl = images?.[nodeId] ?? images?.[nodeId.replace(':', '-')];

  if (!imageUrl) return '';

  // Step 2 — download the image and convert to base64
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) return '';
  const buffer = await imgRes.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

// ---------------------------------------------------------------------------
// Public agent function
// ---------------------------------------------------------------------------

/**
 * Ingestion Agent entry point.
 * Receives a Figma URL, fetches design data via the Figma REST API,
 * returns a complete FigmaContext for the Codegen Agent.
 */
export async function runIngestion(figmaUrl: string): Promise<FigmaContext> {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      'Missing FIGMA_ACCESS_TOKEN environment variable. ' +
        'Add it to your .env file and try again.'
    );
  }

  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
  console.log(`  [Ingestion] file: ${fileKey}  node: ${nodeId}`);

  // --- Fetch node tree ---
  console.log(`  [Ingestion] fetching node tree…`);
  let rawNodeData: unknown;
  try {
    rawNodeData = await fetchNodeData(fileKey, nodeId, token);
  } catch (err) {
    throw new Error(
      `Ingestion Agent — failed to fetch node "${nodeId}" from file "${fileKey}": ${String(err)}`
    );
  }
  console.log(`  [Ingestion] node tree received`);

  // --- Fetch frame screenshot ---
  console.log(`  [Ingestion] fetching screenshot…`);
  let screenshot = '';
  try {
    screenshot = await fetchNodeScreenshot(fileKey, nodeId, token);
    console.log(`  [Ingestion] screenshot ${screenshot ? 'received (' + Math.round(screenshot.length / 1024) + ' KB)' : 'empty'}`);
  } catch (err) {
    console.warn(`  [Ingestion] screenshot failed (continuing without it): ${String(err)}`);
  }

  // --- Parse node tree ---
  console.log(`  [Ingestion] parsing node tree…`);
  const nodeTree = parseFigmaResponse(rawNodeData);

  if (nodeTree.length === 0) {
    throw new Error(
      `Ingestion Agent — empty node tree for node "${nodeId}". ` +
        'Check that the node-id is correct and the frame exists in the file.'
    );
  }
  console.log(`  [Ingestion] parsed ${nodeTree.length} root node(s)`);

  // --- Extract design tokens ---
  const tokens = extractTokens(nodeTree);
  console.log(`  [Ingestion] extracted tokens: ${Object.values(tokens).reduce((n, g) => n + Object.keys(g).length, 0)} total`);

  // --- Assets: images embedded in the node tree ---
  const assets = extractAssets(rawNodeData);

  // --- Build FigmaContext from the root node ---
  const rootFrame = nodeTree[0];

  return {
    frameId: nodeId,
    frameName: rootFrame.name,
    frameWidth: rootFrame.width,
    frameHeight: rootFrame.height,
    screenshot,
    nodeTree,
    tokens,
    assets,
  };
}

// ---------------------------------------------------------------------------
// Asset extraction — picks up imageRef assets embedded in the node response
// ---------------------------------------------------------------------------

function extractAssets(rawNodeData: unknown): Asset[] {
  if (!rawNodeData || typeof rawNodeData !== 'object') return [];
  const obj = rawNodeData as Record<string, unknown>;

  // The /files/{key}/nodes response embeds image refs under `components`
  // or inside node fills. We do a best-effort walk for now.
  const assets: Asset[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n['type'] === 'RECTANGLE' || n['type'] === 'VECTOR') {
      const fills = n['fills'];
      if (Array.isArray(fills)) {
        for (const fill of fills) {
          const f = fill as Record<string, unknown>;
          if (f['type'] === 'IMAGE' && typeof f['imageRef'] === 'string') {
            assets.push({
              nodeId: String(n['id'] ?? ''),
              name: String(n['name'] ?? 'image'),
              base64: '',          // downloaded on-demand in Phase 2
              mimeType: 'image/png',
            });
          }
        }
      }
    }
    if (Array.isArray(n['children'])) {
      for (const child of n['children'] as unknown[]) walk(child);
    }
  }

  const nodes = obj['nodes'] as Record<string, unknown> | undefined;
  if (nodes) {
    for (const entry of Object.values(nodes)) {
      const e = entry as Record<string, unknown>;
      walk(e['document'] ?? entry);
    }
  }

  return assets;
}
