/**
 * Codegen Agent — src/agents/codegen.ts
 *
 * Role in the multi-agent system:
 *   Second agent in the pipeline. Receives a FigmaContext from the
 *   Ingestion Agent and produces a single, self-contained React TSX
 *   component using Tailwind utility classes.
 *
 * Input:  FigmaContext       — node tree, tokens, screenshot from Figma
 * Output: GeneratedComponent — TSX source, component name, dependencies
 *
 * IMPORTANT: This is a pure agent function. Zero imports from @mastra/core
 * or any orchestration framework. The Mastra wrapper lives in src/mastra/.
 */

import 'dotenv/config';
import OpenAI from 'openai';
import type { FigmaContext, GeneratedComponent } from '../types/index.js';

// Ollama runs an OpenAI-compatible endpoint at localhost:11434.
// Set OLLAMA_BASE_URL if Ollama is on a different host/port.
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert any string to PascalCase for use as a React component name. */
function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
    .replace(/^(.)/, (c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}

/** Strip accidental markdown code fences from LLM output. */
function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:tsx|typescript|ts|jsx|js)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();
}

/** Extract the exported component name from TSX source. */
function extractComponentName(tsx: string, fallback: string): string {
  // Match: export function Foo, export const Foo, export { Foo }
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

const SYSTEM_PROMPT = `You are the Codegen Agent in a Figma-to-code multi-agent system.
Your sole responsibility is to convert a structured Figma design context into a single, self-contained React TSX component.

Rules:
- Output ONLY the raw TSX file content. No explanation, no markdown fences, no comments about what you did.
- Export the component as a named export. Derive the name from the Figma frame name in PascalCase.
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
 * Receives a FigmaContext, calls the configured LLM with the node tree +
 * (optionally) the screenshot, and returns a GeneratedComponent with TSX.
 *
 * Model selection (checked in order):
 *   1. OLLAMA_MODEL env var → uses local Ollama via OpenAI-compatible endpoint
 *   2. OPENAI_API_KEY env var → uses OpenAI GPT-4o
 */
export async function runCodegen(ctx: FigmaContext): Promise<GeneratedComponent> {
  const useOllama = Boolean(process.env.OLLAMA_MODEL ?? process.env.OLLAMA_BASE_URL);
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!useOllama && !openaiKey) {
    throw new Error(
      'No LLM configured. Set OLLAMA_MODEL for local Ollama, ' +
        'or OPENAI_API_KEY for OpenAI.'
    );
  }

  const client = useOllama
    ? new OpenAI({ baseURL: OLLAMA_BASE_URL, apiKey: 'ollama' })
    : new OpenAI({ apiKey: openaiKey! });

  const model = useOllama ? OLLAMA_MODEL : 'gpt-4o';

  // Ollama models typically don't support vision — skip the screenshot
  // unless the model name suggests vision capability (llava, vision, etc.)
  const modelSupportsVision =
    !useOllama ||
    /llava|vision|minicpm|moondream|bakllava|llama3\.2-vision/i.test(model);

  const componentNameFallback = toPascalCase(ctx.frameName) || 'GeneratedComponent';

  const systemMessage = SYSTEM_PROMPT.replace(
    /\{frameWidth\}/g,
    String(ctx.frameWidth)
  );

  const userText = `You are receiving a message from the Ingestion Agent.

Frame: ${ctx.frameName} (${ctx.frameWidth}x${ctx.frameHeight}px)

Design tokens extracted from the design:
${JSON.stringify(ctx.tokens, null, 2)}

Node tree:
${JSON.stringify(ctx.nodeTree, null, 2)}

Use the design tokens and node tree as your structural guide.
Use the attached screenshot as your visual ground truth.
When the node tree and screenshot conflict, trust the screenshot.

Component must render correctly at exactly ${ctx.frameWidth}px wide.`;

  let rawTsx: string;
  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemMessage },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            ...(ctx.screenshot && modelSupportsVision
              ? [
                  {
                    type: 'image_url' as const,
                    image_url: {
                      url: `data:image/png;base64,${ctx.screenshot}`,
                      detail: 'high' as const,
                    },
                  },
                ]
              : []),
          ],
        },
      ],
    });

    rawTsx = response.choices[0]?.message?.content ?? '';
  } catch (err) {
    const backend = useOllama ? `Ollama (${model} @ ${OLLAMA_BASE_URL})` : `OpenAI (${model})`;
    throw new Error(`Codegen Agent — ${backend} call failed: ${String(err)}`);
  }

  if (!rawTsx.trim()) {
    throw new Error(
      'Codegen Agent — GPT-4o returned an empty response. ' +
        'Check your API key and try again.'
    );
  }

  const tsx = stripFences(rawTsx);
  const componentName = extractComponentName(tsx, componentNameFallback);

  return {
    tsx,
    componentName,
    dependencies: ['react'],
    tailwindConfigPatch: null,
  };
}
