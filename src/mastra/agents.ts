/**
 * src/mastra/agents.ts
 * Mastra Agent instances — one per agent function.
 */

import { Agent } from '@mastra/core/agent';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { createOllama } from 'ollama-ai-provider';

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
  codegenTool,
  writeSandboxTool,
  renderTool,
  diffTool,
  refinementTool,
} from './tools.js';

// ---------------------------------------------------------------------------
// Phase 1 agents
// ---------------------------------------------------------------------------

export const codegenAgent = new Agent({
  id: 'codegen-agent',
  name: 'Codegen Agent',
  instructions:
    'You are the Codegen Agent. You receive a Figma URL, fetch the design screenshot, ' +
    'and generate a production-quality React TSX component. ' +
    'Follow Tailwind conventions strictly. Output only valid TSX.',
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

export const renderAgent = new Agent({
  id: 'render-agent',
  name: 'Render Agent',
  instructions:
    'You are the Render Agent. You write the generated component to the ' +
    'sandbox and capture a screenshot using a headless browser.',
  model: agentModel,
  tools: { renderTool },
});

export const diffAgent = new Agent({
  id: 'diff-agent',
  name: 'Diff Agent',
  instructions:
    'You are the Diff Agent. You compare the original Figma design against ' +
    'the rendered component screenshot and return a structured DiffReport.',
  model: agentModel,
  tools: { diffTool },
});

export const refinementAgent = new Agent({
  id: 'refinement-agent',
  name: 'Refinement Agent',
  instructions:
    'You are the Refinement Agent. You apply targeted code patches to fix ' +
    'visual discrepancies identified by the Diff Agent.',
  model: agentModel,
  tools: { refinementTool },
});
