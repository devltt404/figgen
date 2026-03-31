/**
 * src/mastra/tools.ts
 * Mastra tool definitions — bridges between the orchestrator and each agent function.
 * Each tool wraps one pure agent function with a typed Zod input/output schema.
 * This is the ONLY place agent functions are called from the Mastra layer.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FigmaContextSchema,
  GeneratedComponentSchema,
} from '../types/index.js';
import { runIngestion } from '../agents/ingestion.js';
import { runCodegen } from '../agents/codegen.js';
import { runRender } from '../agents/render.js';
import { runDiff } from '../agents/diff.js';
import { runRefinement } from '../agents/refinement.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_DIR = path.resolve(__dirname, '../../sandbox');
const COMPONENT_PATH = path.join(SANDBOX_DIR, 'src/GeneratedComponent.tsx');
const TAILWIND_CONFIG_PATH = path.join(SANDBOX_DIR, 'tailwind.config.ts');

// ---------------------------------------------------------------------------
// figmaIngestionTool
// ---------------------------------------------------------------------------

export const figmaIngestionTool = createTool({
  id: 'figma-ingestion',
  description: 'Ingestion Agent — fetches Figma design data and returns a structured FigmaContext',
  inputSchema: z.object({ figmaUrl: z.string().url() }),
  outputSchema: FigmaContextSchema,
  execute: async (inputData) => {
    return runIngestion(inputData.figmaUrl);
  },
});

// ---------------------------------------------------------------------------
// codegenTool
// ---------------------------------------------------------------------------

export const codegenTool = createTool({
  id: 'codegen',
  description: 'Codegen Agent — generates a React TSX component from a FigmaContext',
  inputSchema: FigmaContextSchema,
  outputSchema: GeneratedComponentSchema,
  execute: async (inputData) => {
    return runCodegen(inputData);
  },
});

// ---------------------------------------------------------------------------
// writeSandboxTool
// ---------------------------------------------------------------------------

const writeSandboxOutputSchema = z.object({
  outputPath: z.string(),
  componentName: z.string(),
});

export const writeSandboxTool = createTool({
  id: 'write-sandbox',
  description: 'Writes the generated TSX component to the Vite sandbox for preview',
  inputSchema: GeneratedComponentSchema,
  outputSchema: writeSandboxOutputSchema,
  execute: async (inputData) => {
    console.log(`  [Sandbox] writing ${inputData.componentName} to ${COMPONENT_PATH}`);
    // Write component TSX
    await fs.writeFile(COMPONENT_PATH, inputData.tsx, 'utf-8');

    // Merge tailwind config patch if present
    if (inputData.tailwindConfigPatch) {
      await mergeTailwindPatch(inputData.tailwindConfigPatch);
    }

    return {
      outputPath: COMPONENT_PATH,
      componentName: inputData.componentName,
    };
  },
});

// ---------------------------------------------------------------------------
// Tailwind config patch helper
// ---------------------------------------------------------------------------

async function mergeTailwindPatch(patch: string): Promise<void> {
  let config: string;
  try {
    config = await fs.readFile(TAILWIND_CONFIG_PATH, 'utf-8');
  } catch {
    return; // If config doesn't exist, skip
  }

  // Find the extend block and inject the patch content
  const extendPattern = /extend\s*:\s*\{([^}]*)\}/s;
  const match = config.match(extendPattern);

  if (match) {
    const existingExtend = match[1].trim();
    const newExtend = existingExtend
      ? `${existingExtend},\n        ${patch.trim()}`
      : `\n        ${patch.trim()}\n      `;
    const updated = config.replace(extendPattern, `extend: {${newExtend}}`);
    await fs.writeFile(TAILWIND_CONFIG_PATH, updated, 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// Phase 2 tool stubs
// ---------------------------------------------------------------------------

// PHASE 2: renderTool — screenshots the rendered component in a headless browser
export const renderTool = createTool({
  id: 'render',
  description: 'Render Agent — renders the component in a headless browser and returns a screenshot',
  inputSchema: GeneratedComponentSchema,
  outputSchema: z.object({ screenshot: z.string() }),
  execute: async (inputData) => {
    const screenshot = await runRender(inputData);
    return { screenshot };
  },
});

// PHASE 2: diffTool — compares Figma screenshot vs rendered screenshot
export const diffTool = createTool({
  id: 'diff',
  description: 'Diff Agent — compares the Figma design against the rendered output',
  inputSchema: z.object({
    figmaContext: FigmaContextSchema,
    screenshot: z.string(),
  }),
  outputSchema: z.object({}),
  execute: async (inputData) => {
    return runDiff(inputData.figmaContext, inputData.screenshot);
  },
});

// PHASE 2: refinementTool — applies targeted patches based on diff issues
export const refinementTool = createTool({
  id: 'refinement',
  description: 'Refinement Agent — patches the component to fix visual diff issues',
  inputSchema: z.object({
    component: GeneratedComponentSchema,
    diff: z.object({}),
  }),
  outputSchema: z.object({}),
  execute: async (inputData) => {
    return runRefinement(inputData.component, inputData.diff);
  },
});
