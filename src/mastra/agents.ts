/**
 * src/mastra/agents.ts
 * Mastra Agent instances — two agents + render tool.
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
  if (process.env.OPENAI_API_KEY) {
    return openai(process.env.OPENAI_MODEL ?? 'gpt-5.4-nano');
  }
  if (process.env.OLLAMA_MODEL) {
    return createOllama({ baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api' })(process.env.OLLAMA_MODEL);
  }
  throw new Error('No LLM configured. Set one of: REQUESTY_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, or OLLAMA_MODEL.');
})();

import {
  codegenTool,
  writeSandboxTool,
  renderTool,
  judgeTool,
} from './tools.js';

// ---------------------------------------------------------------------------
// Codegen Agent — handles both generation and refinement
// ---------------------------------------------------------------------------

export const codegenAgent = new Agent({
  id: 'codegen-agent',
  name: 'Codegen Agent',
  instructions:
    'You are the Codegen Agent. You receive a Figma URL, fetch the design data, ' +
    'and generate a production-quality React TSX component using Tailwind CSS. ' +
    'In refinement mode, you receive existing TSX code and a diff report, and apply ' +
    'minimal surgical fixes to resolve visual issues. ' +
    'Follow design guidelines from long-term memory when provided.',
  model: agentModel,
  tools: { codegenTool, writeSandboxTool },
});

// ---------------------------------------------------------------------------
// Judge Agent — visual fidelity review + guideline extraction
// ---------------------------------------------------------------------------

export const judgeAgent = new Agent({
  id: 'judge-agent',
  name: 'Judge Agent',
  instructions:
    'You are the Judge Agent. You compare the original Figma design against ' +
    'the rendered component screenshot and return a structured fidelity report. ' +
    'After successful sessions, you extract generalizable design guidelines ' +
    'and save them to long-term memory for future sessions.',
  model: agentModel,
  tools: { judgeTool, renderTool },
});
