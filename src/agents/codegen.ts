/**
 * Codegen Agent — src/agents/codegen.ts
 *
 * Accepts a Figma URL, fetches the Figma node tree (exact colors, sizes, fonts,
 * spacing from the design file) and sends it to the LLM.
 *
 * Input:  figmaUrl: string   — a valid Figma design URL with ?node-id
 * Output: GeneratedComponent — TSX source, component name, dependencies
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import type { GeneratedComponent } from "../types/index.js";
import {
  parseFigmaUrl,
  fetchFigmaNodeTree,
} from "../utils/figma.js";
import { readCache, writeCache } from "../utils/llm-cache.js";

// ---------------------------------------------------------------------------
// LLM backend selection
// ---------------------------------------------------------------------------

const REQUESTY_BASE_URL = "https://router.requesty.ai/v1";
const REQUESTY_MODEL = process.env.REQUESTY_MODEL ?? "openai-responses/gpt-5.4-nano";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "qwen/qwen3-coder:free";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    if (m?.[1]) return m[1];
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Figma-to-code agent.
Convert the provided Figma design into a single, self-contained React TSX component.

You receive two inputs:
  1. A DESIGN SPEC JSON — the exact Figma node tree with precise values (hex colors, px sizes, font names, spacing, border radii, shadows). Use this as the source of truth for all values.
  2. A SCREENSHOT — the rendered design image. Use this for visual/spatial context and hierarchy.

Rules:
- Output ONLY the raw TSX file content. No explanation, no markdown fences, no comments about what you did.
- Export the component as a named export. Derive the name from the component name hint provided.
- Use only Tailwind utility classes. No inline styles, no CSS modules.
- USE EXACT VALUES from the design spec as Tailwind arbitrary values:
    colors      → bg-[#2e6bde]  text-[#171a21]
    sizes       → text-[28px]   w-[400px]
    spacing     → p-[40px]      gap-[24px]    px-[12px] py-[6px]
    radius      → rounded-[16px]  rounded-[99px]
    shadows     → shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)]
- For font weight: map Figma fontWeight numbers → font-thin(100) font-light(300) font-normal(400) font-medium(500) font-semibold(600) font-bold(700) font-extrabold(800) font-black(900).
- For font family:  Use the exact font name from Figma.
- Use semantic HTML: nav, header, main, section, article, footer, button, a, h1-h6, p, ul, li where appropriate.
- The component must render at its natural/intrinsic size matching the design frame. Do NOT add min-h-screen or w-full to the root element.
- Images: placeholder div with bg-gray-200 and aria-label of asset name.
- Icons/vectors: sized gray placeholder div.
- No interactivity or state unless explicitly visible in the design.
- No React import needed (React 17+ JSX transform).`;

// ---------------------------------------------------------------------------
// Public agent function
// ---------------------------------------------------------------------------

/**
 * Codegen Agent entry point.
 *
 * Model selection (checked in order):
 *   1. REQUESTY_API_KEY   → Requesty
 *   2. OPENROUTER_API_KEY → OpenRouter
 *   3. OLLAMA_MODEL       → local Ollama
 *   4. OPENAI_API_KEY     → OpenAI GPT-4o
 */
export async function runCodegen(figmaUrl: string): Promise<GeneratedComponent> {
  const requestyKey = process.env.REQUESTY_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const useOllama =
    !requestyKey &&
    !openrouterKey &&
    Boolean(process.env.OLLAMA_MODEL ?? process.env.OLLAMA_BASE_URL);
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!requestyKey && !openrouterKey && !useOllama && !openaiKey) {
    throw new Error(
      "No LLM configured. Set REQUESTY_API_KEY, OPENROUTER_API_KEY, OLLAMA_MODEL, or OPENAI_API_KEY.",
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
    client = new OpenAI({ baseURL: OPENROUTER_BASE_URL, apiKey: openrouterKey });
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

  const { componentName: componentNameHint } = parseFigmaUrl(figmaUrl);
  console.log(`  [Codegen] backend: ${backend}`);

  console.log("  [Codegen] fetching node tree…");
  const tree = await fetchFigmaNodeTree(figmaUrl).catch(() => null);

  if (!tree) {
    console.warn("  [Codegen] no design data available — generating from URL context only");
  } else {
    console.log("  [Codegen] node tree fetched");
    const debugDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../output/debug");
    await fs.mkdir(debugDir, { recursive: true });
    const treeFile = path.join(debugDir, "node-tree.json");
    await fs.writeFile(treeFile, JSON.stringify(tree, null, 2), "utf-8");
  }

  const userText = [
    `Generate a React TSX component named "${componentNameHint}" for this Figma design.`,
    `Figma URL: ${figmaUrl}`,
    tree
      ? `\nDESIGN SPEC (use these exact values):\n${JSON.stringify(tree, null, 2)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const debugDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../output/debug");
  await fs.mkdir(debugDir, { recursive: true });
  await fs.writeFile(path.join(debugDir, "prompt.txt"), userText, "utf-8");
  console.log(`  [Codegen] prompt saved → ${path.join(debugDir, "prompt.txt")}`);

  const cached = await readCache(model, SYSTEM_PROMPT, userText);
  let rawTsx: string;
  if (cached) {
    console.log("  [Codegen] cache hit — skipping LLM call");
    rawTsx = cached;
  } else {
    console.log("  [Codegen] calling LLM…");
    try {
      const response = await client.chat.completions.create({
        model,
        max_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
      });
      rawTsx = response.choices[0]?.message?.content ?? "";
    } catch (err) {
      throw new Error(`Codegen Agent — ${backend} call failed: ${String(err)}`);
    }
    await writeCache(model, SYSTEM_PROMPT, userText, rawTsx);
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
