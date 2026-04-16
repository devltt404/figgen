/**
 * src/mastra/tools.ts
 * Mastra tool definitions — bridges between the orchestrator and each agent function.
 * Each tool wraps one pure agent function with a typed Zod input/output schema.
 */

import { createTool } from "@mastra/core/tools";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { runCodegen } from "../agents/codegen.js";
import { runJudge } from "../agents/judge.js";
import { runRender } from "../agents/render.js";
import { DiffReportSchema, GeneratedComponentSchema } from "../types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_DIR = path.resolve(__dirname, "../../sandbox");
const COMPONENT_PATH = path.join(SANDBOX_DIR, "src/GeneratedComponent.tsx");
const TAILWIND_CONFIG_PATH = path.join(SANDBOX_DIR, "tailwind.config.ts");

// ---------------------------------------------------------------------------
// codegenTool (handles both generation and refinement modes)
// ---------------------------------------------------------------------------

export const codegenTool = createTool({
  id: "codegen",
  description:
    "Codegen Agent — generates or refines a React TSX component from Figma design data",
  inputSchema: z.object({
    figmaUrl: z.string().url(),
    existingComponent: GeneratedComponentSchema.optional(),
    diffReport: DiffReportSchema.optional(),
    guidelines: z.array(z.string()).optional(),
    debugDir: z.string().optional(),
    iter: z.number().optional(),
  }),
  outputSchema: GeneratedComponentSchema,
  execute: async (inputData) => {
    return runCodegen(inputData.figmaUrl, {
      existingComponent: inputData.existingComponent,
      diffReport: inputData.diffReport,
      guidelines: inputData.guidelines,
      debugDir: inputData.debugDir,
      iter: inputData.iter,
    });
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
  id: "write-sandbox",
  description:
    "Writes the generated TSX component to the Vite sandbox for preview",
  inputSchema: GeneratedComponentSchema,
  outputSchema: writeSandboxOutputSchema,
  execute: async (inputData) => {
    console.log(
      `  [Sandbox] writing ${inputData.componentName} to ${COMPONENT_PATH}`,
    );
    await fs.writeFile(COMPONENT_PATH, inputData.tsx, "utf-8");

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
    config = await fs.readFile(TAILWIND_CONFIG_PATH, "utf-8");
  } catch {
    return;
  }

  const extendPattern = /extend\s*:\s*\{([^}]*)\}/s;
  const match = config.match(extendPattern);

  if (match) {
    const existingExtend = match[1].trim();
    const newExtend = existingExtend
      ? `${existingExtend},\n        ${patch.trim()}`
      : `\n        ${patch.trim()}\n      `;
    const updated = config.replace(extendPattern, `extend: {${newExtend}}`);
    await fs.writeFile(TAILWIND_CONFIG_PATH, updated, "utf-8");
  }
}

// ---------------------------------------------------------------------------
// renderTool (utility, not an LLM agent)
// ---------------------------------------------------------------------------

export const renderTool = createTool({
  id: "render",
  description:
    "Render tool — renders the component in a headless browser and returns a screenshot",
  inputSchema: GeneratedComponentSchema,
  outputSchema: z.object({ screenshot: z.string() }),
  execute: async (inputData) => {
    const screenshot = await runRender(inputData);
    return { screenshot };
  },
});

// ---------------------------------------------------------------------------
// judgeTool
// ---------------------------------------------------------------------------

export const judgeTool = createTool({
  id: "judge",
  description:
    "Judge Agent — compares the Figma design against the rendered output",
  inputSchema: z.object({
    figmaUrl: z.string(),
    screenshot: z.string(),
  }),
  outputSchema: DiffReportSchema,
  execute: async (inputData) => {
    return runJudge(inputData.figmaUrl, inputData.screenshot);
  },
});
