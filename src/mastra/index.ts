/**
 * src/mastra/index.ts
 * Mastra instance — registers all agents and workflows.
 */

import { Mastra } from '@mastra/core';

import { figmaToCodeWorkflow } from './workflow.js';
import { codegenAgent, judgeAgent } from './agents.js';

export const mastra = new Mastra({
  workflows: { figmaToCodeWorkflow },
  agents: { codegenAgent, judgeAgent },
});


