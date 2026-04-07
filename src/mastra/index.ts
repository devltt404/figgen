/**
 * src/mastra/index.ts
 * Mastra instance — registers all agents and workflows.
 */

import { Mastra } from '@mastra/core';

import { figmaToCodeWorkflow } from './workflow.js';
import {
  codegenAgent,
  writeSandboxAgent,
  // PHASE 2: renderAgent, diffAgent, refinementAgent
} from './agents.js';

export const mastra = new Mastra({
  workflows: { figmaToCodeWorkflow },
  agents: { codegenAgent, writeSandboxAgent },
});
