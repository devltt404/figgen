/**
 * Diff Agent — src/agents/diff.ts
 *
 * Role in the multi-agent system:
 *   Fourth agent in the Phase 2 pipeline. Receives the original Figma URL and
 *   a rendered screenshot (from the Render Agent), fetches the original Figma
 *   design screenshot, then uses a vision LLM to compare the two images and
 *   return a structured DiffReport describing all visual discrepancies.
 *
 * Input:
 *   figmaUrl           — the original Figma design URL
 *   renderedScreenshot — base64 PNG of the rendered component (from Render Agent)
 *
 * Output: DiffReport — fidelity score (0–1) + list of categorised issues
 */

import "dotenv/config";
import OpenAI from "openai";
import type { DiffReport } from "../types/index.js";
import { fetchFigmaScreenshot } from "../utils/figma.js";
import { readCache, writeCache } from "../utils/llm-cache.js";

// ---------------------------------------------------------------------------
// LLM client (mirrors the selection logic in codegen.ts)
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
      client: new OpenAI({
        baseURL: "https://router.requesty.ai/v1",
        apiKey: requestyKey,
      }),
      model:
        process.env.REQUESTY_DIFF_MODEL ??
        process.env.REQUESTY_MODEL ??
        "openai/gpt-4o",
      backend: "Requesty",
    };
  }
  if (openrouterKey) {
    return {
      client: new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: openrouterKey,
      }),
      model:
        process.env.OPENROUTER_DIFF_MODEL ??
        process.env.OPENROUTER_MODEL ??
        "openai/gpt-4o",
      backend: "OpenRouter",
    };
  }
  if (useOllama) {
    const ollamaBase =
      process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
    return {
      client: new OpenAI({ baseURL: ollamaBase, apiKey: "ollama" }),
      model: process.env.OLLAMA_MODEL ?? "llava",
      backend: "Ollama",
    };
  }
  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      model: "gpt-4o",
      backend: "OpenAI",
    };
  }
  throw new Error(
    "No LLM configured. Set REQUESTY_API_KEY, OPENROUTER_API_KEY, OLLAMA_MODEL, or OPENAI_API_KEY.",
  );
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const DIFF_SYSTEM_PROMPT = `You are a design-fidelity reviewer.
You will be given two screenshots:
  1. The ORIGINAL Figma design (design)
  2. The RENDERED React component (implementation)

Your task is to compare them and return a JSON object with this exact shape:
{
  "fidelityScore": <number 0.0–1.0, where 1.0 = pixel-perfect match>,
  "summary": <one-sentence overall assessment>,
  "issues": [
    {
      "category": <"layout" | "color" | "typography" | "spacing" | "missing-element" | "extra-element" | "other">,
      "description": <concise description of the discrepancy>
    }
  ]
}

Rules:
- Output ONLY valid JSON. No markdown fences, no explanation.
- If the images are identical, return fidelityScore: 1.0 and an empty issues array.`;

// ---------------------------------------------------------------------------
// Public agent function
// ---------------------------------------------------------------------------

/**
 * Diff Agent entry point.
 * Fetches the original Figma screenshot, then asks a vision LLM to compare
 * it against the rendered component screenshot.
 *
 * @param figmaUrl           - the original Figma design URL
 * @param renderedScreenshot - base64 PNG of the rendered component
 * @returns DiffReport with fidelity score and list of issues
 */
export async function runDiff(
  figmaUrl: string,
  renderedScreenshot: string,
): Promise<DiffReport> {
  const { client, model, backend } = createClient();
  console.log(`  [Diff] backend: ${backend} (${model})`);

  // Fetch the original Figma design screenshot
  console.log("  [Diff] fetching Figma screenshot…");
  const figmaScreenshot = await fetchFigmaScreenshot(figmaUrl);
  console.log(
    `  [Diff] Figma screenshot received (${Math.round(figmaScreenshot.length / 1024)} KB)`,
  );

  // Use images as the cache key content so any change in either image busts the cache
  const cacheUserKey = `figma:${figmaScreenshot}|rendered:${renderedScreenshot}`;
  const cached = await readCache(model, DIFF_SYSTEM_PROMPT, cacheUserKey);
  let raw: string;
  if (cached) {
    console.log("  [Diff] cache hit — skipping LLM call");
    raw = cached;
  } else {
    console.log("  [Diff] calling LLM for visual comparison…");
    try {
      const response = await client.chat.completions.create({
        model,
        max_tokens: 2048,
        messages: [
          { role: "system", content: DIFF_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Compare these two screenshots and return the JSON diff report.",
              },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${figmaScreenshot}`, detail: "high" },
              },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${renderedScreenshot}`, detail: "high" },
              },
            ],
          },
        ],
      });
      raw = response.choices[0]?.message?.content ?? "";
    } catch (err) {
      throw new Error(`Diff Agent — ${backend} call failed: ${String(err)}`);
    }
    await writeCache(model, DIFF_SYSTEM_PROMPT, cacheUserKey, raw);
  }

  if (!raw.trim()) {
    throw new Error("Diff Agent — LLM returned an empty response.");
  }

  // Extract the outermost JSON object — robust to preamble/postamble/fences
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(
      `Diff Agent — no JSON object found in LLM response:\n${raw}`,
    );
  }

  let report: DiffReport;
  try {
    report = JSON.parse(raw.slice(start, end + 1)) as DiffReport;
  } catch {
    throw new Error(
      `Diff Agent — failed to parse LLM response as JSON:\n${raw}`,
    );
  }

  console.log(
    `  [Diff] fidelity: ${(report.fidelityScore * 100).toFixed(1)}% — ${report.issues.length} issue(s)`,
  );
  return report;
}
