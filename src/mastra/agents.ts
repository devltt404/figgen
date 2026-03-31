/**
 * src/mastra/agents.ts
 * Mastra Agent instances — one per agent function.
 * Each Agent has a role description, an LLM model, and its associated tool.
 * Agents are registered with the Mastra instance in src/mastra/index.ts.
 */

import { Agent } from '@mastra/core/agent';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { createOllama } from 'ollama-ai-provider';

// Model selection mirrors the priority in codegen.ts:
//   1. REQUESTY_API_KEY   → Requesty
//   2. OPENROUTER_API_KEY → OpenRouter
//   3. OLLAMA_MODEL       → local Ollama
//   4. default            → OpenAI GPT-4o
const agentModel = (() => {
  if (process.env.REQUESTY_API_KEY) {
    const model = process.env.REQUESTY_MODEL ?? 'openai-responses/gpt-5.4-nano';
    return createOpenAI({ baseURL: 'https://router.requesty.ai/v1', apiKey: process.env.REQUESTY_API_KEY })(model);
  }
  if (process.env.OPENROUTER_API_KEY) {
    const model = process.env.OPENROUTER_MODEL ?? 'qwen/qwen3-coder:free';
    return createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY })(model);
  }
  if (process.env.OLLAMA_MODEL) {
    return createOllama({ baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api' })(process.env.OLLAMA_MODEL);
  }
  return openai('gpt-4o');
})();

import {
  figmaIngestionTool,
  codegenTool,
  writeSandboxTool,
  renderTool,
  diffTool,
  refinementTool,
} from './tools.js';

// ---------------------------------------------------------------------------
// Phase 1 agents
// ---------------------------------------------------------------------------

export const ingestionAgent = new Agent({
  id: 'ingestion-agent',
  name: 'Ingestion Agent',
  instructions:
    'You are the Ingestion Agent. You fetch Figma design data ' +
    'and structure it into a FigmaContext for the Codegen Agent to consume. ' +
    'Always return complete, valid data matching the FigmaContext schema.',
  model: agentModel,
  tools: { figmaIngestionTool },
});

export const codegenAgent = new Agent({
  id: 'codegen-agent',
  name: 'Codegen Agent',
  instructions:
    'You are the Codegen Agent. You receive a FigmaContext ' +
    'from the Ingestion Agent and generate a production-quality React TSX ' +
    'component. Follow Tailwind conventions strictly. Output only valid TSX.',
  model: agentModel,
  tools: { codegenTool },
});

export const writeSandboxAgent = new Agent({
  id: 'write-sandbox-agent',
  name: 'Write Sandbox Agent',
  instructions:
    'You are the Write Sandbox Agent. You write generated component files ' +
    'to the Vite sandbox directory so they can be previewed in the browser.',
  model: agentModel,
  tools: { writeSandboxTool },
});

// ---------------------------------------------------------------------------
// Phase 2 agent stubs
// ---------------------------------------------------------------------------

// PHASE 2: renderAgent — screenshots the component in a headless browser
export const renderAgent = new Agent({
  id: 'render-agent',
  name: 'Render Agent',
  instructions:
    'You are the Render Agent. You write the generated component to the ' +
    'sandbox and capture a screenshot using a headless browser.',
  model: agentModel,
  tools: { renderTool },
});

// PHASE 2: diffAgent — compares Figma design vs rendered output
export const diffAgent = new Agent({
  id: 'diff-agent',
  name: 'Diff Agent',
  instructions:
    'You are the Diff Agent. You compare the original Figma screenshot ' +
    'against the rendered component screenshot and return a structured DiffReport.',
  model: agentModel,
  tools: { diffTool },
});

// PHASE 2: refinementAgent — patches the component based on diff issues
export const refinementAgent = new Agent({
  id: 'refinement-agent',
  name: 'Refinement Agent',
  instructions:
    'You are the Refinement Agent. You apply targeted code patches to fix ' +
    'visual discrepancies identified by the Diff Agent.',
  model: agentModel,
  tools: { refinementTool },
});
