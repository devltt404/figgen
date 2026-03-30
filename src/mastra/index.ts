/**
 * src/mastra/index.ts
 * Mastra instance — registers all agents and workflows.
 * Import this from pipeline.ts to access the full multi-agent system.
 */

import { Mastra } from '@mastra/core';

import { figmaToCodeWorkflow } from './workflow.js';
import {
  ingestionAgent,
  codegenAgent,
  writeSandboxAgent,
  // PHASE 2: renderAgent, diffAgent, refinementAgent
} from './agents.js';

export const mastra = new Mastra({
  workflows: { figmaToCodeWorkflow },
  agents: { ingestionAgent, codegenAgent, writeSandboxAgent },
});
