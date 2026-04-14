/**
 * Refinement Agent — src/agents/refinement.ts
 *
 * Receives the current TSX component and a DiffReport, then calls an LLM to
 * apply minimal surgical patches that fix each listed issue. Returns the updated
 * component ready for another render/diff cycle.
 *
 * Input:
 *   component — GeneratedComponent from the Codegen (or previous Refinement) Agent
 *   diff      — DiffReport from the Diff Agent describing what needs fixing
 *
 * Output: RefinementResult — patched TSX + short summary of changes made
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import type { GeneratedComponent, DiffReport, RefinementResult } from "../types/index.js";
import { readCache, writeCache } from "../utils/llm-cache.js";

// ---------------------------------------------------------------------------
// LLM client (same selection logic as codegen/diff)
// ---------------------------------------------------------------------------

function createClient(): { client: OpenAI; model: string; backend: string } {
  const requestyKey = process.env.REQUESTY_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const useOllama =
    !requestyKey &&
    !openrouterKey &&
    Boolean(process.env.OLLAMA_MODEL ?? process.env.OLLAMA_BASE_URL);
  const openaiKey = process.env.OPENAI_API_KEY;

  if (requestyKey) {
    return {
      client: new OpenAI({ baseURL: "https://router.requesty.ai/v1", apiKey: requestyKey }),
      model: process.env.REQUESTY_MODEL ?? "openai-responses/gpt-5.4-nano",
      backend: "Requesty",
    };
  }
  if (openrouterKey) {
    return {
      client: new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: openrouterKey }),
      model: process.env.OPENROUTER_MODEL ?? "qwen/qwen3-coder:free",
      backend: "OpenRouter",
    };
  }
  if (useOllama) {
    return {
      client: new OpenAI({
        baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
        apiKey: "ollama",
      }),
      model: process.env.OLLAMA_MODEL ?? "llama3.2",
      backend: "Ollama",
    };
  }
  if (openaiKey) {
    return { client: new OpenAI({ apiKey: openaiKey }), model: "gpt-4o", backend: "OpenAI" };
  }
  throw new Error(
    "No LLM configured. Set REQUESTY_API_KEY, OPENROUTER_API_KEY, OLLAMA_MODEL, or OPENAI_API_KEY.",
  );
}

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a React/Tailwind code refinement agent.
You receive a TSX component and a list of visual issues found by a design-fidelity reviewer.
Apply minimal, surgical fixes to resolve each issue.

Rules:
- Output ONLY the fixed TSX file content. No markdown fences, no explanation.
- Do NOT rewrite the whole component — make targeted changes only.
- Keep all existing Tailwind classes that are correct; only change what the issues describe.
- NEVER change colors, fonts, or content that are not explicitly mentioned in the issues list.
- No inline styles, no CSS modules — Tailwind only.
- Preserve the component's named export exactly.`;

function formatIssues(diff: DiffReport): string {
  return diff.issues
    .map(
      (issue, i) =>
        `${i + 1}. [${issue.category}] ${issue.description}`,
    )
    .join("\n\n");
}

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:tsx|typescript|ts|jsx|js)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Public agent function
// ---------------------------------------------------------------------------

export async function runRefinement(
  component: GeneratedComponent,
  diff: DiffReport,
  debugDir?: string,
  iter = 0,
): Promise<RefinementResult> {
  const { client, model, backend } = createClient();
  console.log(`  [Refinement] backend: ${backend} (${model})`);
  console.log(`  [Refinement] applying fixes for ${diff.issues.length} issue(s)…`);

  const userMessage = `Current fidelity score: ${(diff.fidelityScore * 100).toFixed(1)}%
Summary: ${diff.summary}

Issues to fix:
${formatIssues(diff)}

Current TSX:
\`\`\`tsx
${component.tsx}
\`\`\`

Return the fixed TSX.`;

  const cached = await readCache(model, SYSTEM_PROMPT, userMessage);
  let raw: string;
  if (cached) {
    console.log("  [Refinement] cache hit — skipping LLM call");
    raw = cached;
  } else {
    try {
      const response = await client.chat.completions.create({
        model,
        max_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      });
      raw = response.choices[0]?.message?.content ?? "";
    } catch (err) {
      throw new Error(`Refinement Agent — ${backend} call failed: ${String(err)}`);
    }
    await writeCache(model, SYSTEM_PROMPT, userMessage, raw);
  }

  if (!raw.trim()) {
    throw new Error("Refinement Agent — LLM returned an empty response.");
  }

  const tsx = stripFences(raw);
  console.log(`  [Refinement] patched component (${tsx.split("\n").length} lines)`);

  if (debugDir) {
    await fs.writeFile(path.join(debugDir, `refine-${iter}-prompt.txt`), `=== SYSTEM ===\n${SYSTEM_PROMPT}\n\n=== USER ===\n${userMessage}`, "utf-8");
    await fs.writeFile(path.join(debugDir, `refine-${iter}-response.tsx`), tsx, "utf-8");
  }

  return {
    tsx,
    componentName: component.componentName,
    dependencies: component.dependencies,
    tailwindConfigPatch: component.tailwindConfigPatch,
    patchSummary: `Fixed ${diff.issues.length} issue(s): ${diff.issues.map((i) => i.category).join(", ")}`,
  };
}
