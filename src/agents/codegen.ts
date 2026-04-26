/**
 * Codegen Agent — src/agents/codegen.ts
 *
 * Unified agent that handles both initial code generation and refinement.
 * - Generation mode: receives Figma data, produces React TSX
 * - Refinement mode: receives existing TSX + DiffReport, applies surgical fixes
 *
 * Both modes optionally incorporate long-term design guidelines from memory.
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import type { GeneratedComponent, DiffReport } from "../types/index.js";
import { fetchFigmaDesignContext, parseFigmaUrl } from "../utils/figma.js";
import { readCache, writeCache } from "../utils/llm-cache.js";
import { createLLMClient } from "../utils/llm-client.js";

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

// ---------------------------------------------------------------------------
// System prompt — covers both generation and refinement modes
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `
You are an expert React + Tailwind CSS engineer who converts structured Figma design data into clean, production-ready React + Tailwind CSS components.

## Generation mode

You receive YAML data exported from a Figma file via the figma-developer-mcp tool. Two main keys relevant for code generation:

- \`nodes\` — the component tree. Each node has a name, type, and refs to layout/fill/style tokens (e.g. layout_ABC, fill_XYZ, style_123).
- \`globalVars\` — the resolved token definitions. Cross-reference node refs here to get exact values (colors, spacing, font sizes, radii, shadows, etc).

## Refinement mode

When you receive existing TSX code along with a diff report of visual issues, apply minimal, surgical fixes to resolve each issue.
- You MUST address every issue listed in the diff report. Do not skip any.
- Do NOT rewrite the whole component — make targeted changes only.
- Do NOT fix things that are not mentioned in the issues. No "while I'm at it" changes.
- Keep all existing Tailwind classes that are correct; only change what the issues describe.
- If the diff says a color is wrong, change ONLY that color. If spacing is wrong, change ONLY that spacing value.
- NEVER change colors, fonts, or content that are not explicitly mentioned in the issues list.
- Preserve the component's named export exactly.
- Re-read each issue after applying your fix to confirm it is actually resolved.
- Focus on critical and moderate severity issues first.

## Output rules

- Produce a single \`.tsx\` file with one default-exported functional component. No explanation, no markdown fences, no comments about what you did.
- Use Tailwind classes exclusively. No inline styles, no CSS modules, no external libraries beyond React.
- Resolve every token ref via globalVars and apply as Tailwind arbitrary values:
    colors      → bg-[#2e6bde]  text-[#171a21]
    sizes       → text-[28px]   w-[400px]
    spacing     → p-[40px]      gap-[24px]    px-[12px] py-[6px]
    radius      → rounded-[16px]  rounded-[99px]
    shadows     → shadow-[0px_8px_24px_0px_rgba(0,0,0,0.08)]
- NEVER use approximate Tailwind utility classes when the design specifies exact values.
    WRONG: p-4 (16px) when the design says 18px → RIGHT: p-[18px]
    WRONG: text-lg when the design says 22px → RIGHT: text-[22px]
    WRONG: bg-blue-600 when the design says #2e6bde → RIGHT: bg-[#2e6bde]
    WRONG: rounded-lg when the design says 12px → RIGHT: rounded-[12px]
- Match flex directions and alignment exactly. If the design has a vertical stack, use flex-col. If items are center-aligned, use items-center. Pay attention to justify-content vs align-items.
- Pay attention to the root element's layout: flex vs block, row vs column, and whether the content is centered or edge-aligned.
- Use semantic HTML: nav, header, main, section, article, footer, button, a, h1-h6, p, ul, li where appropriate.
- For font family: use the exact font name from the token.
- The component must render at its natural/intrinsic size matching the design frame. Do NOT add min-h-screen or w-full to the root element.
- No interactivity or state unless explicitly visible in the design.

## Shapes and small elements (pay extra attention)

Small shapes, icons, and decorative elements are the most common source of errors. Follow these rules:
- Circles: use rounded-full (not rounded-lg or rounded-xl). If the design shows a circle, it MUST be rounded-full.
- Pills/capsules: use rounded-full for fully-rounded ends on badges, tags, and pill buttons.
- Exact border-radius: use the token value as rounded-[Npx], never approximate with rounded-sm/md/lg.
- Icons: render SVG inline or use a span with the correct dimensions. Match the exact icon shape — arrows, chevrons, dots, checkmarks, etc.
- Status dots/indicators: small colored circles should use exact dimensions (e.g. w-[8px] h-[8px] rounded-full).
- Dividers: render as border or <hr> with exact color and thickness from the token.
- Avatar containers: match the exact shape (circle vs rounded-square) and size from the design.
`;

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface CodegenOptions {
  existingComponent?: GeneratedComponent;
  diffReport?: DiffReport;
  guidelines?: string[];
  debugDir?: string;
  iter?: number;
}

function formatIssues(diff: DiffReport): string {
  const severityOrder: Record<string, number> = { critical: 0, moderate: 1, minor: 2 };
  const sorted = [...diff.issues].sort(
    (a, b) => (severityOrder[a.severity ?? "moderate"] ?? 1) - (severityOrder[b.severity ?? "moderate"] ?? 1),
  );
  return sorted
    .map((issue, i) => `${i + 1}. [${issue.category}]${issue.severity ? ` (${issue.severity})` : ""} ${issue.description}`)
    .join("\n\n");
}

function buildSystemPrompt(guidelines?: string[]): string {
  if (!guidelines || guidelines.length === 0) return SYSTEM_PROMPT;
  const bulletPoints = guidelines.map((g) => `- ${g}`).join("\n");
  return `${SYSTEM_PROMPT}
## Design Guidelines (from prior sessions — follow strictly)

${bulletPoints}
`;
}

export async function runCodegen(
  figmaUrl: string,
  options: CodegenOptions = {},
): Promise<GeneratedComponent> {
  const { existingComponent, diffReport, guidelines, debugDir, iter } = options;
  const isRefinement = !!(existingComponent && diffReport);

  const { client, model, provider } = createLLMClient();

  const { componentName: componentNameHint } = parseFigmaUrl(figmaUrl);
  const mode = isRefinement ? "refine" : "generate";
  console.log(`  [Codegen] mode: ${mode} | backend: ${provider} (${model})`);

  // Build system prompt with guidelines
  const systemPrompt = buildSystemPrompt(guidelines);

  // Build user message depending on mode
  let userText: string;

  if (isRefinement) {
    userText = `Current fidelity score: ${(diffReport.fidelityScore * 100).toFixed(1)}%
Summary: ${diffReport.summary}

The following issues were identified by a visual reviewer who compared the Figma design screenshot against your rendered component screenshot. You CANNOT see either image — you must trust these descriptions exactly and apply each fix as instructed.

Issues to fix (ordered by severity — fix all of them):
${formatIssues(diffReport)}

Current TSX:
\`\`\`tsx
${existingComponent.tsx}
\`\`\`

Apply every fix described above. Do not change anything else. Return the fixed TSX.`;
  } else {
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

    userText = `FIGMA DATA:\n${designContext.text}`;
  }

  // Debug artifacts
  const iterSuffix = iter != null ? `-${iter}` : "";
  const debugPrefix = isRefinement ? `refine${iterSuffix}` : "codegen";
  if (debugDir)
    await writeDebug(debugDir, `${debugPrefix}-prompt.txt`, `=== SYSTEM ===\n${systemPrompt}\n\n=== USER ===\n${userText}`);

  // LLM call (with cache)
  const cached = await readCache(model, systemPrompt, userText);
  let rawTsx: string;
  if (cached) {
    console.log(`  [Codegen] cache hit — skipping LLM call`);
    rawTsx = cached;
  } else {
    console.log("  [Codegen] calling LLM…");
    try {
      const response = await client.chat.completions.create({
        model,
        max_completion_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
      });
      rawTsx = response.choices[0]?.message?.content ?? "";
    } catch (err) {
      throw new Error(`Codegen Agent — ${provider} call failed: ${String(err)}`);
    }
    await writeCache(model, systemPrompt, userText, rawTsx);
  }

  if (!rawTsx.trim()) {
    throw new Error(
      "Codegen Agent — LLM returned an empty response. Check your API key and try again.",
    );
  }

  const tsx = stripFences(rawTsx);
  const componentName = extractComponentName(
    tsx,
    existingComponent?.componentName ?? componentNameHint,
  );
  console.log(
    `  [Codegen] component: ${componentName} (${tsx.split("\n").length} lines)`,
  );

  if (debugDir) await writeDebug(debugDir, `${debugPrefix}-response.tsx`, tsx);

  return {
    tsx,
    componentName,
    dependencies: existingComponent?.dependencies ?? ["react"],
    tailwindConfigPatch: existingComponent?.tailwindConfigPatch ?? null,
    ...(isRefinement && diffReport
      ? {
          patchSummary: `Fixed ${diffReport.issues.length} issue(s): ${diffReport.issues.map((i) => i.category).join(", ")}`,
        }
      : {}),
  };
}
