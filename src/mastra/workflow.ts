/**
 * The Mastra workflow orchestrator.
 *
 * The main pipeline loop (codegen ↔ judge) is now driven directly by
 * pipeline.ts / pipeline-runner.ts. This workflow is kept for Mastra
 * dashboard observability of the initial codegen + write-sandbox step.
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

import { codegenTool, writeSandboxTool } from './tools.js';

// ---------------------------------------------------------------------------
// Workflow steps
// ---------------------------------------------------------------------------

const codegenStep = createStep(codegenTool);
const writeSandboxStep = createStep(writeSandboxTool);

// ---------------------------------------------------------------------------
// figma-to-code workflow (initial generation only)
// ---------------------------------------------------------------------------

export const figmaToCodeWorkflow = createWorkflow({
  id: 'figma-to-code',
  description: 'Figma-to-code pipeline: Codegen → Write Sandbox',
  inputSchema: z.object({
    figmaUrl: z.string().url(),
    debugDir: z.string().optional(),
  }),
  outputSchema: z.object({
    outputPath: z.string(),
    componentName: z.string(),
  }),
})
  .then(codegenStep)
  .then(writeSandboxStep)
  .commit();
