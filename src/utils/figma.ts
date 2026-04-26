import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
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

export interface FigmaDesignContext {
  text: string;
  metadata: string;
}

async function createMcpClient(token: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "figma-developer-mcp", "--figma-api-key", token, "--stdio"],
  });
  const client = new Client({ name: "figgen", version: "1.0.0" }, { capabilities: {} });
  console.log("  [Figma] connecting to figma-developer-mcp…");
  await client.connect(transport, { timeout: 10_000 });
  console.log("  [Figma] connected");
  return client;
}

async function closeMcpClient(client: Client): Promise<void> {
  await Promise.race([client.close(), new Promise<void>((r) => setTimeout(r, 3_000))]);
}

export async function fetchFigmaDesignContext(
  figmaUrl: string,
): Promise<FigmaDesignContext | null> {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) {
    console.warn("  [Figma] FIGMA_ACCESS_TOKEN is not set");
    return null;
  }

  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
  console.log(`  [Figma] fileKey=${fileKey} nodeId=${nodeId}`);

  const designCacheKey = figmaCacheKey("design", fileKey, nodeId);
  const screenshotCacheKey = figmaCacheKey("screenshot", fileKey, nodeId);

  const cachedDesign = await readFigmaCache<FigmaDesignContext>(designCacheKey);
  const cachedScreenshot = await readFigmaCache<{ b64: string }>(screenshotCacheKey);
  if (cachedDesign && cachedScreenshot) {
    console.log("  [Figma] design + screenshot cache hit");
    return cachedDesign;
  }

  const screenshotDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../output/figma-cache/screenshots",
  );
  await fs.mkdir(screenshotDir, { recursive: true });
  const screenshotFileName = `${screenshotCacheKey}.png`;

  const client = await createMcpClient(token);
  try {
    const [dataResult, imageResult] = await Promise.all([
      cachedDesign
        ? Promise.resolve(null)
        : client.callTool({ name: "get_figma_data", arguments: { fileKey, nodes: { nodeId } } }),
      cachedScreenshot
        ? Promise.resolve(null)
        : client.callTool({
            name: "download_figma_images",
            arguments: {
              fileKey,
              nodes: [{ nodeId, fileName: screenshotFileName }],
              localPath: path.relative(process.cwd(), screenshotDir),
              pngScale: 2,
            },
          }),
    ]);

    if (dataResult) {
      if (dataResult.isError) {
        const msg = (dataResult.content as Array<{ text?: string }>)[0]?.text ?? "unknown error";
        throw new Error(`get_figma_data failed: ${msg}`);
      }
      console.log("  [Figma] get_figma_data done");
    }

    if (imageResult) {
      if (imageResult.isError) {
        const msg = (imageResult.content as Array<{ text?: string }>)[0]?.text ?? "unknown error";
        throw new Error(`download_figma_images failed: ${msg}`);
      }
      console.log("  [Figma] download_figma_images done");
      const buffer = await fs.readFile(path.join(screenshotDir, screenshotFileName));
      await writeFigmaCache(screenshotCacheKey, { b64: buffer.toString("base64") });
    }

    if (cachedDesign) return cachedDesign;

    type Item = { type: string; text?: string };
    const text = (dataResult!.content as Item[])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n\n");

    const result: FigmaDesignContext = { text, metadata: "" };
    await writeFigmaCache(designCacheKey, result);
    return result;
  } catch (err) {
    console.warn("  [Figma] fetchFigmaDesignContext failed:", err);
    return null;
  } finally {
    await closeMcpClient(client);
  }
}

export async function fetchFigmaScreenshot(figmaUrl: string): Promise<string> {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) throw new Error("FIGMA_ACCESS_TOKEN is not set");

  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
  const cacheKey = figmaCacheKey("screenshot", fileKey, nodeId);
  const cached = await readFigmaCache<{ b64: string }>(cacheKey);
  if (cached) return cached.b64;

  // fetchFigmaDesignContext was not called first — connect and download now
  const screenshotDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../output/figma-cache/screenshots",
  );
  await fs.mkdir(screenshotDir, { recursive: true });
  const fileName = `${cacheKey}.png`;

  const client = await createMcpClient(token);
  try {
    const toolResult = await client.callTool({
      name: "download_figma_images",
      arguments: {
        fileKey,
        nodes: [{ nodeId, fileName }],
        localPath: path.relative(process.cwd(), screenshotDir),
        pngScale: 2,
      },
    });
    if (toolResult.isError) {
      const msg = (toolResult.content as Array<{ text?: string }>)[0]?.text ?? "unknown error";
      throw new Error(`download_figma_images failed: ${msg}`);
    }
    console.log("  [Figma] download_figma_images done");
  } finally {
    await closeMcpClient(client);
  }

  const buffer = await fs.readFile(path.join(screenshotDir, fileName));
  const b64 = buffer.toString("base64");
  await writeFigmaCache(cacheKey, { b64 });
  return b64;
}
