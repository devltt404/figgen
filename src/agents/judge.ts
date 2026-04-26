/**
 * Judge Agent — src/agents/judge.ts
 *
 * Renamed from the Diff Agent. Two responsibilities:
 * 1. runJudge  — visual comparison of Figma screenshot vs rendered screenshot
 * 2. extractGuidelines — summarize session critiques into reusable design guidelines
 *
 * The Judge agent is the sole manager of long-term memory.
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import type { DiffReport } from "../types/index.js";
import { fetchFigmaScreenshot } from "../utils/figma.js";
import { readCache, writeCache } from "../utils/llm-cache.js";
import { createLLMClient, type LLMClient } from "../utils/llm-client.js";

function createClient(): LLMClient {
  return createLLMClient(process.env.REQUESTY_DIFF_MODEL);
}

// ---------------------------------------------------------------------------
// Visual comparison
// ---------------------------------------------------------------------------

const JUDGE_SYSTEM_PROMPT = `You are a design-fidelity reviewer producing instructions for a BLIND code agent.
You will be given two screenshots:
  1. The ORIGINAL Figma design (design)
  2. The RENDERED React component (implementation)

CRITICAL CONTEXT: The code agent that will fix these issues CANNOT see either image. It can only read your text descriptions. Your descriptions must be precise enough that someone with no visual reference can make the exact correction in code. Vague descriptions like "looks different" or "spacing is off" are USELESS.

Evaluate the implementation against the design systematically:

1. **Layout & Structure**: Are elements arranged in the same direction (row/column)? Same nesting? Same alignment (left, center, right)? Same order?
2. **Colors**: Do backgrounds, text colors, borders, and shadows match exactly?
3. **Typography**: Do font sizes, weights, families, and line heights match? Is text content identical?
4. **Spacing**: Do padding, margins, and gaps between elements match?
5. **Content**: Is all text content present and correct? Are images/icons present? Are there extra or missing elements?
6. **Visual Hierarchy**: Do element proportions, sizes, and emphasis match the design?
7. **Shapes & Icons**: Pay EXTRA attention to small decorative elements, icons, badges, avatars, dividers, and geometric shapes. These are frequently wrong. Check:
   - Is each shape the correct type? (circle vs rounded-rectangle vs pill vs square)
   - Are border-radius values correct? (fully rounded = rounded-full, slight rounding = specific px value)
   - Are small icons the right size, color, and position?
   - Are decorative elements like dots, lines, dividers, chevrons, arrows present and correct?
   - Are avatar/profile image containers the right shape (circle vs square) and size?

For each issue found, assign a severity:
- "critical": The layout is structurally wrong, major elements are missing, or colors are completely off
- "moderate": Noticeable spacing/sizing differences, wrong font weight, minor color mismatch
- "minor": Subtle spacing differences, slight alignment issues

Return a JSON object:
{
  "fidelityScore": <0.0-1.0>,
  "summary": "<one-sentence assessment>",
  "issues": [
    {
      "category": "<layout|color|typography|spacing|missing-element|extra-element|other>",
      "severity": "<critical|moderate|minor>",
      "description": "<specific, actionable fix instruction>"
    }
  ]
}

## How to write descriptions (IMPORTANT)

Each description must be a FIX INSTRUCTION, not an observation. The blind code agent needs to know:
1. WHAT element is wrong (identify it by its text content, position, or role — e.g. "the 'Sign Up' button", "the top navigation bar", "the second card in the grid")
2. WHAT is wrong with it (the specific property: color, size, position, spacing, etc.)
3. WHAT the design shows (the correct value)
4. WHAT the implementation shows (the current wrong value)

Examples of GOOD descriptions:
- "The 'Get Started' button background is #2563eb in the design but renders as #3b82f6 — change to bg-[#2563eb]"
- "The hero heading is ~40px in the design but renders at ~32px — increase to text-[40px]"
- "The card grid uses a 3-column layout in the design but renders as a single column — change to grid-cols-3"
- "The nav links are horizontally spaced with ~32px gaps in the design but render with ~16px gaps — increase gap to gap-[32px]"
- "The design shows a search icon to the left of the input field, but the implementation is missing it — add a search icon before the input"
- "The sidebar is on the left side in the design but renders on the right — move it to the left by reordering the flex children"
- "The profile avatar is a ~48px diameter CIRCLE in the design but renders as a ~64px SQUARE — change to w-[48px] h-[48px] rounded-full"
- "The status indicator is a small 8px filled circle (#22c55e) in the design but is missing in the implementation — add a w-[8px] h-[8px] rounded-full bg-[#22c55e] element"
- "The dropdown arrow is a downward-pointing chevron (▼) in the design but renders as a right-pointing arrow (▶) — rotate it 90 degrees or use a down-chevron SVG"
- "The tag/badge has a pill shape (fully rounded ends) in the design but renders with sharp corners — add rounded-full"
- "The divider line between sections is 1px solid #e5e7eb in the design but is missing — add a border-b border-[#e5e7eb] or an <hr>"

Examples of BAD descriptions (never write these):
- "Colors don't match" (which element? what colors?)
- "Spacing is off" (where? by how much? which direction?)
- "Layout looks different" (how specifically?)
- "Font seems wrong" (which text? what property? what values?)
- "Icon looks wrong" (what icon? what shape is it? what should it be?)
- "Shape is different" (what shape? where? what is it currently? what should it be?)

## Scoring guidance — be strict, not generous:
- 1.0: Pixel-perfect, no discernible differences at all
- 0.90-0.99: ONLY minor differences (1-2px spacing, slightly different font rendering). Reserve 0.90+ for truly close matches.
- 0.70-0.89: Several noticeable issues but overall structure is correct. Most first-pass generations land here.
- 0.50-0.69: Significant issues — wrong colors, missing sections, broken layout
- Below 0.50: Fundamentally different from the design

IMPORTANT scoring rules:
- If ANY critical issue exists, the score MUST be below 0.85.
- If 3+ moderate issues exist, the score MUST be below 0.90.
- Err on the side of being too strict rather than too lenient — false passes waste iteration budget.
- The score should reflect what a human designer would think, not just structural similarity.

Rules:
- Output ONLY valid JSON. No markdown fences, no explanation.
- If the images are identical, return fidelityScore: 1.0 and an empty issues array.`;

export async function runJudge(
  figmaUrl: string,
  renderedScreenshot: string,
  debugDir?: string,
  iter = 0,
): Promise<DiffReport> {
  const { client, model, provider } = createClient();
  console.log(`  [Judge] backend: ${provider} (${model})`);

  console.log("  [Judge] fetching Figma screenshot…");
  const figmaScreenshot = await fetchFigmaScreenshot(figmaUrl);
  console.log(
    `  [Judge] Figma screenshot received (${Math.round(figmaScreenshot.length / 1024)} KB)`,
  );

  const cacheUserKey = `figma:${figmaScreenshot}|rendered:${renderedScreenshot}`;
  const cached = await readCache(model, JUDGE_SYSTEM_PROMPT, cacheUserKey);
  let raw: string;
  if (cached) {
    console.log("  [Judge] cache hit — skipping LLM call");
    raw = cached;
  } else {
    console.log("  [Judge] calling LLM for visual comparison…");
    try {
      const response = await client.chat.completions.create({
        model,
        max_completion_tokens: 4096,
        temperature: 0,
        messages: [
          { role: "system", content: JUDGE_SYSTEM_PROMPT },
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
      throw new Error(`Judge Agent — ${provider} call failed: ${String(err)}`);
    }
    await writeCache(model, JUDGE_SYSTEM_PROMPT, cacheUserKey, raw);
  }

  if (!raw.trim()) {
    throw new Error("Judge Agent — LLM returned an empty response.");
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Judge Agent — no JSON object found in LLM response:\n${raw}`);
  }

  let report: DiffReport;
  try {
    report = JSON.parse(raw.slice(start, end + 1)) as DiffReport;
  } catch {
    throw new Error(`Judge Agent — failed to parse LLM response as JSON:\n${raw}`);
  }

  console.log(
    `  [Judge] fidelity: ${(report.fidelityScore * 100).toFixed(1)}% — ${report.issues.length} issue(s)`,
  );

  if (debugDir) {
    await fs.writeFile(
      path.join(debugDir, `judge-${iter}-prompt.txt`),
      `=== SYSTEM ===\n${JUDGE_SYSTEM_PROMPT}\n\n=== USER ===\nCompare these two screenshots and return the JSON diff report.\n[figma screenshot: base64 PNG]\n[rendered screenshot: base64 PNG]`,
      "utf-8",
    );
    await fs.writeFile(
      path.join(debugDir, `judge-${iter}-response.json`),
      JSON.stringify(report, null, 2),
      "utf-8",
    );
  }

  return report;
}

// ---------------------------------------------------------------------------
// Guideline extraction — called after a successful session
// ---------------------------------------------------------------------------

const GUIDELINES_SYSTEM_PROMPT = `You are a design-system quality analyst. You have just completed reviewing a Figma-to-code generation session. Below are the diff reports from each iteration.

Your task: extract 1–5 concise, generalizable design guidelines that the code generation agent should follow in future sessions. Each guideline should be:
- Actionable (tells the agent what to DO, not what went wrong)
- General (applies beyond this specific component)
- Concise (one sentence, imperative mood)

Do NOT include guidelines that are specific to this component's content.
Only include patterns that would help with OTHER components too.

Output a JSON array of strings. If no generalizable lessons exist, return [].`;

export async function extractGuidelines(
  sessionDiffs: DiffReport[],
  debugDir?: string,
  existingGuidelines?: string[],
): Promise<string[]> {
  if (sessionDiffs.length === 0) return [];

  const { client, model, provider } = createClient();
  console.log(`  [Judge] extracting guidelines from ${sessionDiffs.length} diff report(s)… (${provider})`);

  let userText = sessionDiffs
    .map(
      (d, i) =>
        `Iteration ${i}:\n  Fidelity: ${(d.fidelityScore * 100).toFixed(1)}%\n  Summary: ${d.summary}\n  Issues:\n${d.issues.map((iss) => `    - [${iss.category}]${iss.severity ? ` (${iss.severity})` : ""} ${iss.description}`).join("\n")}`,
    )
    .join("\n\n");

  if (existingGuidelines && existingGuidelines.length > 0) {
    userText += `\n\nEXISTING GUIDELINES (do NOT repeat or rephrase these — only add genuinely new insights):\n${existingGuidelines.map((g) => `- ${g}`).join("\n")}`;
  }

  const cached = await readCache(model, GUIDELINES_SYSTEM_PROMPT, userText);
  let raw: string;
  if (cached) {
    console.log("  [Judge] guidelines cache hit");
    raw = cached;
  } else {
    try {
      const response = await client.chat.completions.create({
        model,
        max_completion_tokens: 1024,
        temperature: 0,
        messages: [
          { role: "system", content: GUIDELINES_SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
      });
      raw = response.choices[0]?.message?.content ?? "";
    } catch (err) {
      const msg = `[Judge] guideline extraction failed: ${String(err)}`;
      console.warn(`  ${msg}`);
      throw new Error(msg);
    }
    await writeCache(model, GUIDELINES_SYSTEM_PROMPT, userText, raw);
  }

  if (debugDir) {
    await fs.writeFile(
      path.join(debugDir, "guidelines-extraction.json"),
      raw,
      "utf-8",
    );
  }

  const arrStart = raw.indexOf("[");
  const arrEnd = raw.lastIndexOf("]");
  if (arrStart === -1 || arrEnd === -1) return [];

  try {
    const parsed = JSON.parse(raw.slice(arrStart, arrEnd + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
