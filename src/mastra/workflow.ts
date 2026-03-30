/**
 * The Mastra workflow orchestrator — wires all agents in a sequential pipeline.
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

import { figmaIngestionTool, codegenTool, writeSandboxTool } from './tools.js';

// ---------------------------------------------------------------------------
// Workflow steps (each wraps one tool)
// ---------------------------------------------------------------------------

const ingestionStep = createStep(figmaIngestionTool);
const codegenStep = createStep(codegenTool);
const writeSandboxStep = createStep(writeSandboxTool);

// ---------------------------------------------------------------------------
// figma-to-code workflow
// ---------------------------------------------------------------------------

export const figmaToCodeWorkflow = createWorkflow({
  id: 'figma-to-code',
  description: 'Figma-to-code multi-agent pipeline: Ingestion → Codegen → Write Sandbox',
  inputSchema: z.object({
    figmaUrl: z.string().url(),
  }),
  outputSchema: z.object({
    outputPath: z.string(),
    componentName: z.string(),
  }),
})
  .then(ingestionStep)
  .then(codegenStep)
  .then(writeSandboxStep)
  .commit();

// ---------------------------------------------------------------------------
// PHASE 2: Visual comparison and refinement loop
// Uncomment and implement when Phase 2 begins.
//
// import { renderTool, diffTool, refinementTool } from './tools.js';
//
// const renderStep       = createStep(renderTool);
// const diffStep         = createStep(diffTool);
// const refinementStep   = createStep(refinementTool);
//
// The Phase 2 workflow will extend this pipeline:
//
//   .then(renderStep)          -- screenshot the rendered component
//   .then(diffStep)            -- compare Figma design vs rendered output
//   .branch([                  -- loop until score >= 0.95 or 3 iterations
//     [diffScoreOk,  finalizeStep],
//     [needsRefine,  refinementStep → loop back to renderStep],
//   ])
// ---------------------------------------------------------------------------
