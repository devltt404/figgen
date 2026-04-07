/**
 * Codegen Agent — src/agents/codegen.ts
 *
 * Role in the multi-agent system:
 *   Single agent in the pipeline. Accepts a Figma URL, fetches a screenshot
 *   via the Figma REST API, and prompts an LLM to generate a self-contained
 *   React TSX component using Tailwind utility classes.
 *
 * Input:  figmaUrl: string      — a valid Figma design/file/site/proto URL
 * Output: GeneratedComponent    — TSX source, component name, dependencies
 */

import "dotenv/config";
import OpenAI from "openai";
import type { GeneratedComponent } from "../types/index.js";

// Requesty — OpenAI-compatible router
const REQUESTY_BASE_URL = "https://router.requesty.ai/v1";
const REQUESTY_MODEL =
  process.env.REQUESTY_MODEL ?? "openai-responses/gpt-5.4-nano";

// Ollama — local OpenAI-compatible endpoint
const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";

// OpenRouter — cloud OpenAI-compatible endpoint (free tier available)
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "qwen/qwen3-coder:free";

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

interface FigmaUrlParts {
  fileKey: string;
  nodeId: string;
  componentName: string;
}

function parseFigmaUrl(url: string): FigmaUrlParts {
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

// ---------------------------------------------------------------------------
// Figma screenshot fetch
// ---------------------------------------------------------------------------

async function fetchScreenshot(
  fileKey: string,
  nodeId: string,
  token: string,
): Promise<string> {
  const res = await fetch(
    `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=1`,
    { headers: { "X-Figma-Token": token } },
  );
  if (!res.ok) return "";

  const data = (await res.json()) as Record<string, unknown>;
  const images = data["images"] as Record<string, string> | undefined;
  const imageUrl = images?.[nodeId] ?? images?.[nodeId.replace(":", "-")];
  if (!imageUrl) return "";

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) return "";
  const buffer = await imgRes.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
    .replace(/^(.)/, (c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "");
}

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:tsx|typescript|ts|jsx|js)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();
}

function extractComponentName(tsx: string, fallback: string): string {
  const patterns = [
    /export\s+(?:default\s+)?(?:function|class)\s+([A-Z][A-Za-z0-9_]*)/,
    /export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*[=:]/,
    /export\s+\{\s*([A-Z][A-Za-z0-9_]*)\s*\}/,
  ];
  for (const pattern of patterns) {
    const m = tsx.match(pattern);
    if (m && m[1]) return m[1];
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Figma-to-code agent.
Your task is to convert a Figma design into a single, self-contained React TSX component.

Rules:
- Output ONLY the raw TSX file content. No explanation, no markdown fences, no comments about what you did.
- Export the component as a named export. Derive the name from the component name hint provided.
- Use only Tailwind utility classes. No inline styles, no CSS modules.
- Prefer standard Tailwind scale values. Use arbitrary values like w-[123px] only when no standard value is within 4px.
- Use semantic HTML: nav, header, main, section, article, footer, button, a, h1-h6, p, ul, li where appropriate.
- Images: placeholder div with bg-gray-200 and aria-label of asset name.
- Icons/vectors: sized gray placeholder div.
- No interactivity or state unless explicitly visible in the design.
- No React import needed (React 17+ JSX transform).`;

// ---------------------------------------------------------------------------
// Public agent function
// ---------------------------------------------------------------------------

/**
 * Codegen Agent entry point.
 * Fetches a screenshot from the Figma URL, then calls the configured LLM
 * to generate a React TSX component from the visual reference.
 *
 * Model selection (checked in order):
 *   1. REQUESTY_API_KEY   → Requesty
 *   2. OPENROUTER_API_KEY → OpenRouter
 *   3. OLLAMA_MODEL       → local Ollama
 *   4. OPENAI_API_KEY     → OpenAI GPT-4o
 */
export async function runCodegen(
  figmaUrl: string,
): Promise<GeneratedComponent> {
  const requestyKey = process.env.REQUESTY_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const useOllama =
    !requestyKey &&
    !openrouterKey &&
    Boolean(process.env.OLLAMA_MODEL ?? process.env.OLLAMA_BASE_URL);
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!requestyKey && !openrouterKey && !useOllama && !openaiKey) {
    throw new Error(
      "No LLM configured. Set REQUESTY_API_KEY for Requesty, OPENROUTER_API_KEY for OpenRouter, " +
        "OLLAMA_MODEL for local Ollama, or OPENAI_API_KEY for OpenAI.",
    );
  }

  let client: OpenAI;
  let model: string;
  let backend: string;

  if (requestyKey) {
    client = new OpenAI({ baseURL: REQUESTY_BASE_URL, apiKey: requestyKey });
    model = REQUESTY_MODEL;
    backend = `Requesty (${model})`;
  } else if (openrouterKey) {
    client = new OpenAI({
      baseURL: OPENROUTER_BASE_URL,
      apiKey: openrouterKey,
    });
    model = OPENROUTER_MODEL;
    backend = `OpenRouter (${model})`;
  } else if (useOllama) {
    client = new OpenAI({ baseURL: OLLAMA_BASE_URL, apiKey: "ollama" });
    model = OLLAMA_MODEL;
    backend = `Ollama (${model})`;
  } else {
    client = new OpenAI({ apiKey: openaiKey! });
    model = "gpt-4o";
    backend = "OpenAI (gpt-4o)";
  }

  const modelSupportsVision = true;

  // Parse URL to get fileKey, nodeId, and a component name hint
  const {
    fileKey,
    nodeId,
    componentName: componentNameHint,
  } = parseFigmaUrl(figmaUrl);

  console.log(`  [Codegen] backend: ${backend}`);

  // Fetch screenshot if Figma token is available and model supports vision
  let screenshot = "";
  const figmaToken = process.env.FIGMA_ACCESS_TOKEN;
  if (figmaToken && modelSupportsVision) {
    console.log(`  [Codegen] fetching screenshot…`);
    try {
      screenshot = await fetchScreenshot(fileKey, nodeId, figmaToken);
      console.log(
        `  [Codegen] screenshot ${screenshot ? `received (${Math.round(screenshot.length / 1024)} KB)` : "empty"}`,
      );
    } catch (err) {
      console.warn(
        `  [Codegen] screenshot failed (continuing without it): ${String(err)}`,
      );
    }
  } else {
    console.log(
      `  [Codegen] vision: no (${!figmaToken ? "no FIGMA_ACCESS_TOKEN" : "model does not support vision"})`,
    );
  }

  console.log(`  [Codegen] calling LLM…`);

  const userText = `Generate a React TSX component named "${componentNameHint}" for this Figma design:
${figmaUrl}
${screenshot ? "\nUse the attached screenshot as your visual reference. Match layout, colors, typography, and spacing as closely as possible." : "\nNo screenshot available — infer the design from the URL context and generate a reasonable component."}`;

  let rawTsx: string;
  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            ...(screenshot && modelSupportsVision
              ? [
                  {
                    type: "image_url" as const,
                    image_url: {
                      url: `data:image/png;base64,${screenshot}`,
                      detail: "high" as const,
                    },
                  },
                ]
              : []),
          ],
        },
      ],
    });

    rawTsx = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    throw new Error(`Codegen Agent — ${backend} call failed: ${String(err)}`);
  }

  if (!rawTsx.trim()) {
    throw new Error(
      "Codegen Agent — LLM returned an empty response. " +
        "Check your API key / Ollama connection and try again.",
    );
  }

  const tsx = stripFences(rawTsx);
  const componentName = extractComponentName(tsx, componentNameHint);
  console.log(
    `  [Codegen] component: ${componentName} (${tsx.split("\n").length} lines)`,
  );

  return {
    tsx,
    componentName,
    dependencies: ["react"],
    tailwindConfigPatch: null,
  };
}
