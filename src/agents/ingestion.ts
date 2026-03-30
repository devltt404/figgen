/**
 * Ingestion Agent — src/agents/ingestion.ts
 *
 * Role in the multi-agent system:
 *   First agent in the pipeline. Accepts a Figma URL, fetches the full
 *   design data via the Figma MCP server, and returns a structured
 *   FigmaContext that every downstream agent can consume.
 *
 * Input:  figmaUrl: string  — a valid Figma design or file URL
 * Output: FigmaContext      — node tree, design tokens, screenshot, assets
 *
 * IMPORTANT: This is a pure agent function. Zero imports from @mastra/core
 * or any orchestration framework. The Mastra wrapper lives in src/mastra/.
 */

import 'dotenv/config';
import { MCPClient } from '@mastra/mcp';
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
 * Supported formats:
 *   https://www.figma.com/file/{fileKey}/...?node-id={nodeId}
 *   https://www.figma.com/design/{fileKey}/...?node-id={nodeId}
 * node-id in the URL uses - as separator; converts to : for the API.
 */
function parseFigmaUrl(url: string): FigmaUrlParts {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid Figma URL: "${url}"`);
  }

  // Extract file key from path: /file/{key}/... or /design/{key}/...
  const match = parsed.pathname.match(/\/(file|design)\/([^/]+)/);
  if (!match) {
    throw new Error(
      `Could not extract file key from Figma URL. Expected path like /file/{key} or /design/{key}. Got: ${parsed.pathname}`
    );
  }
  const fileKey = match[2];

  // Extract node-id from query params
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
// MCP client factory
// ---------------------------------------------------------------------------

function createFigmaMCPClient(): MCPClient {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      'Missing FIGMA_ACCESS_TOKEN environment variable. ' +
        'Add it to your .env file and try again.'
    );
  }

  return new MCPClient({
    servers: {
      figma: {
        url: new URL('https://mcp.figma.com/mcp'),
        requestInit: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// MCP tool helpers
// ---------------------------------------------------------------------------

async function callFigmaTool(
  client: MCPClient,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const tools = await client.listTools();
  const tool = tools[`figma_${toolName}`] ?? tools[toolName];
  if (!tool) {
    const available = Object.keys(tools).join(', ');
    throw new Error(
      `Figma MCP tool "${toolName}" not found. Available tools: ${available}`
    );
  }

  // Mastra MCP tools expose execute(inputData, context)
  type ExecFn = (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<unknown>;
  const exec = (tool as { execute?: ExecFn }).execute;
  if (!exec) {
    throw new Error(`Figma MCP tool "${toolName}" has no execute method.`);
  }
  return exec.call(tool, args, {});
}

// ---------------------------------------------------------------------------
// Public agent function
// ---------------------------------------------------------------------------

/**
 * Ingestion Agent entry point.
 * Receives a Figma URL, fetches design data via MCP, returns FigmaContext.
 */
export async function runIngestion(figmaUrl: string): Promise<FigmaContext> {
  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);

  const figmaMCP = createFigmaMCPClient();

  // --- Fetch node tree ---
  let rawNodeData: unknown;
  try {
    rawNodeData = await callFigmaTool(figmaMCP, 'get_figma_data', {
      fileKey,
      nodeId,
    });
  } catch (err) {
    throw new Error(
      `Ingestion Agent — get_figma_data failed for node "${nodeId}" in file "${fileKey}": ${String(err)}`
    );
  }

  // --- Fetch frame screenshot ---
  let rawImageData: unknown;
  try {
    rawImageData = await callFigmaTool(figmaMCP, 'download_figma_images', {
      fileKey,
      nodeIds: [nodeId],
      format: 'png',
    });
  } catch (err) {
    throw new Error(
      `Ingestion Agent — download_figma_images failed for node "${nodeId}": ${String(err)}`
    );
  }

  // --- Parse node tree ---
  const nodeTree = parseFigmaResponse(rawNodeData);

  if (nodeTree.length === 0) {
    throw new Error(
      `Ingestion Agent — parseFigmaResponse returned an empty node tree for node "${nodeId}". ` +
        'Check that the node-id is correct and the frame exists.'
    );
  }

  // --- Extract design tokens ---
  const tokens = extractTokens(nodeTree);

  // --- Extract screenshot ---
  const screenshot = extractScreenshot(rawImageData, nodeId);

  // --- Extract assets from image data ---
  const assets = extractAssets(rawImageData, nodeId);

  // --- Build FigmaContext from the root frame ---
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
// Screenshot extraction
// ---------------------------------------------------------------------------

function stripBase64Prefix(s: string): string {
  return s.replace(/^data:image\/[^;]+;base64,/, '');
}

function extractScreenshot(rawImageData: unknown, nodeId: string): string {
  // Shape: direct base64 string (check before object narrowing)
  if (typeof rawImageData === 'string') {
    return stripBase64Prefix(rawImageData);
  }

  if (!rawImageData || typeof rawImageData !== 'object') return '';

  const data = rawImageData as Record<string, unknown>;

  // Shape: { images: { [nodeId]: "data:image/png;base64,..." | raw base64 } }
  if (data['images'] && typeof data['images'] === 'object') {
    const images = data['images'] as Record<string, unknown>;
    const url = images[nodeId] ?? images[nodeId.replace(':', '-')];
    if (typeof url === 'string') {
      return stripBase64Prefix(url);
    }
  }

  return '';
}

// ---------------------------------------------------------------------------
// Asset extraction
// ---------------------------------------------------------------------------

function extractAssets(rawImageData: unknown, _nodeId: string): Asset[] {
  if (!rawImageData || typeof rawImageData !== 'object') return [];

  const data = rawImageData as Record<string, unknown>;

  if (data['images'] && typeof data['images'] === 'object') {
    const images = data['images'] as Record<string, string>;
    return Object.entries(images).map(([id, url]) => ({
      nodeId: id,
      name: id,
      base64: typeof url === 'string'
        ? url.replace(/^data:image\/[^;]+;base64,/, '')
        : '',
      mimeType: 'image/png',
    }));
  }

  return [];
}
