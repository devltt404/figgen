import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import type { GeneratedComponent } from "../types/index.js";
import { fetchFigmaDesignContext, parseFigmaUrl } from "../utils/figma.js";
import { readCache, writeCache } from "../utils/llm-cache.js";

const REQUESTY_BASE_URL = "https://router.requesty.ai/v1";
const REQUESTY_MODEL =
  process.env.REQUESTY_MODEL ?? "openai-responses/gpt-5.4-nano";

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

async function writeDebug(
  debugDir: string,
  filename: string,
  content: string,
): Promise<void> {
  await fs.writeFile(path.join(debugDir, filename), content, "utf-8");
}

const SYSTEM_PROMPT = `
You are an expert React + Tailwind CSS engineer who converts structured Figma design data into clean, production-ready React + Tailwind CSS components.

## Input

You receive YAML data exported from a Figma file via the figma-developer-mcp tool. Two main keys relevant for code generation:

- \`nodes\` — the component tree. Each node has a name, type, and refs to layout/fill/style tokens (e.g. layout_ABC, fill_XYZ, style_123).
- \`globalVars\` — the resolved token definitions. Cross-reference node refs here to get exact values (colors, spacing, font sizes, radii, shadows, etc).

## Output rules

- Produce a single \`.tsx\` file with one default-exported functional component. No explanation, no markdown fences, no comments about what you did.
- Use Tailwind classes exclusively. No inline styles, no CSS modules, no external libraries beyond React.
- Resolve every token ref via globalVars and apply as Tailwind arbitrary values:
    colors      → bg-[#2e6bde]  text-[#171a21]
    sizes       → text-[28px]   w-[400px]
    spacing     → p-[40px]      gap-[24px]    px-[12px] py-[6px]
    radius      → rounded-[16px]  rounded-[99px]
    shadows     → shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)]
- Use semantic HTML: nav, header, main, section, article, footer, button, a, h1-h6, p, ul, li where appropriate.
- For font family: use the exact font name from the token.
- The component must render at its natural/intrinsic size matching the design frame. Do NOT add min-h-screen or w-full to the root element.
- No interactivity or state unless explicitly visible in the design.
`;

export async function runCodegen(
  figmaUrl: string,
  debugDir?: string,
): Promise<GeneratedComponent> {
  const requestyKey = process.env.REQUESTY_API_KEY;
  if (!requestyKey) {
    throw new Error("No LLM configured. Set REQUESTY_API_KEY.");
  }

  const client = new OpenAI({
    baseURL: REQUESTY_BASE_URL,
    apiKey: requestyKey,
  });
  const model = REQUESTY_MODEL;

  const { componentName: componentNameHint } = parseFigmaUrl(figmaUrl);
  console.log(`  [Codegen] backend: Requesty (${model})`);

  console.log("  [Codegen] fetching design context…");
  const designContext = await fetchFigmaDesignContext(figmaUrl).catch(
    () => null,
  );

  if (!designContext) {
    throw new Error("[Codegen] no design data available — terminating process");
  }
  console.log("  [Codegen] design context fetched");
  if (debugDir)
    await writeDebug(debugDir, "design-context.txt", designContext.text);

  if (process.env.STOP_AFTER_FIGMA === "1") {
    console.log(
      `\n  [Debug] --stop-after-figma: design context saved to ${debugDir ?? "."}`,
    );
    process.exit(0);
  }

  const userText = [`FIGMA DATA:\n${designContext.text}`].join("\n");

  if (debugDir) await writeDebug(debugDir, "codegen-prompt.txt", `=== SYSTEM ===\n${SYSTEM_PROMPT}\n\n=== USER ===\n${userText}`);

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
      throw new Error(`Codegen Agent — Requesty call failed: ${String(err)}`);
    }
    await writeCache(model, SYSTEM_PROMPT, userText, rawTsx);
  }

  if (!rawTsx.trim()) {
    throw new Error(
      "Codegen Agent — LLM returned an empty response. Check your API key and try again.",
    );
  }

  const tsx = stripFences(rawTsx);
  const componentName = extractComponentName(tsx, componentNameHint);
  console.log(
    `  [Codegen] component: ${componentName} (${tsx.split("\n").length} lines)`,
  );

  if (debugDir) await writeDebug(debugDir, "codegen-response.tsx", tsx);

  return {
    tsx,
    componentName,
    dependencies: ["react"],
    tailwindConfigPatch: null,
  };
}
