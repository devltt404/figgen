/**
 * src/pipeline.ts
 * CLI entry point for the Figma-to-code multi-agent pipeline.
 *
 * Usage:
 *   npx ts-node src/pipeline.ts "https://www.figma.com/design/{fileKey}/...?node-id={nodeId}"
 */

import 'dotenv/config';
import { mastra } from './mastra';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timestamp(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function isFigmaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === 'www.figma.com' || parsed.hostname === 'figma.com') &&
      /\/(file|design|proto|site|board)\//.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const figmaUrl = process.argv[2];

  if (!figmaUrl || !isFigmaUrl(figmaUrl)) {
    console.error(
      'Usage: npx ts-node src/pipeline.ts "https://www.figma.com/design/{fileKey}/...?node-id={nodeId}"'
    );
    process.exit(1);
  }

  console.log(`\nfiggen — Figma-to-code multi-agent pipeline`);
  console.log(`URL: ${figmaUrl}\n`);

  const workflow = mastra.getWorkflow('figmaToCodeWorkflow');
  const run = await workflow.createRun();

  let result: Awaited<ReturnType<typeof run.start>>;

  try {
    result = await run.start({ inputData: { figmaUrl } });
  } catch (err) {
    console.error(`\n✗ Pipeline failed: ${String(err)}`);
    process.exit(1);
  }

  if (result.status !== 'success') {
    const stepEntries = Object.entries(result.steps ?? {});
    const failedStep = stepEntries.find(
      ([, s]) => (s as { status?: string }).status === 'failed'
    );
    if (failedStep) {
      const [stepId, stepResult] = failedStep;
      const errorMsg = (stepResult as { error?: { message?: string } }).error?.message ?? 'unknown error';
      console.error(`\n✗ Step "${stepId}" failed: ${errorMsg}`);
    } else {
      console.error(`\n✗ Pipeline did not complete successfully (status: ${result.status})`);
    }
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Log per-agent completion
  // ---------------------------------------------------------------------------
  const steps = result.steps as Record<string, { output?: unknown }>;

  const ingestionOutput = steps['figma-ingestion']?.output as
    | { frameName?: string; nodeTree?: unknown[]; tokens?: Record<string, Record<string, string>> }
    | undefined;

  if (ingestionOutput) {
    const nodeCount = ingestionOutput.nodeTree?.length ?? 0;
    const tokenCount = Object.values(ingestionOutput.tokens ?? {}).reduce(
      (sum, group) => sum + Object.keys(group).length,
      0
    );
    console.log(
      `[${timestamp()}] Ingestion Agent  — completed (frame: "${ingestionOutput.frameName ?? 'unknown'}", ${nodeCount} nodes, ${tokenCount} tokens)`
    );
  }

  const codegenOutput = steps['codegen']?.output as
    | { tsx?: string; componentName?: string }
    | undefined;

  if (codegenOutput) {
    const lineCount = (codegenOutput.tsx ?? '').split('\n').length;
    console.log(
      `[${timestamp()}] Codegen Agent    — completed (component: ${codegenOutput.componentName ?? 'unknown'}, ${lineCount} lines)`
    );
  }

  const sandboxOutput = steps['write-sandbox']?.output as
    | { outputPath?: string; componentName?: string }
    | undefined;

  if (sandboxOutput) {
    console.log(
      `[${timestamp()}] Write Sandbox    — completed\n               → ${sandboxOutput.outputPath ?? 'sandbox/src/GeneratedComponent.tsx'}`
    );
  }

  // ---------------------------------------------------------------------------
  // Final success message
  // ---------------------------------------------------------------------------
  const componentName = sandboxOutput?.componentName ?? codegenOutput?.componentName ?? 'GeneratedComponent';
  const outputPath = sandboxOutput?.outputPath ?? 'sandbox/src/GeneratedComponent.tsx';

  console.log(`
✓ Multi-agent pipeline completed
  Component: ${componentName}
  File:      ${outputPath}
  Preview:   cd sandbox && npm run dev
`);
}

main().catch((err: unknown) => {
  console.error(`\n✗ Unexpected error: ${String(err)}`);
  process.exit(1);
});
