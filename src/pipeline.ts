/**
 * src/pipeline.ts
 * CLI entry point for the Figma-to-code pipeline.
 *
 * Usage:
 *   npx ts-node src/pipeline.ts "https://www.figma.com/design/{fileKey}/...?node-id={nodeId}"
 */

import 'dotenv/config';
import { mastra } from './mastra';

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

async function main(): Promise<void> {
  const figmaUrl = process.argv[2];

  if (!figmaUrl || !isFigmaUrl(figmaUrl)) {
    console.error(
      'Usage: npx ts-node src/pipeline.ts "https://www.figma.com/design/{fileKey}/...?node-id={nodeId}"'
    );
    process.exit(1);
  }

  console.log(`\nfiggen — Figma-to-code pipeline`);
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

  const steps = result.steps as Record<string, { output?: unknown }>;

  const codegenOutput = steps['codegen']?.output as
    | { tsx?: string; componentName?: string }
    | undefined;

  if (codegenOutput) {
    const lineCount = (codegenOutput.tsx ?? '').split('\n').length;
    console.log(
      `[Codegen]       — completed (component: ${codegenOutput.componentName ?? 'unknown'}, ${lineCount} lines)`
    );
  }

  const sandboxOutput = steps['write-sandbox']?.output as
    | { outputPath?: string; componentName?: string }
    | undefined;

  if (sandboxOutput) {
    console.log(
      `[Write Sandbox] — completed\n               → ${sandboxOutput.outputPath ?? 'sandbox/src/GeneratedComponent.tsx'}`
    );
  }

  const componentName = sandboxOutput?.componentName ?? codegenOutput?.componentName ?? 'GeneratedComponent';
  const outputPath = sandboxOutput?.outputPath ?? 'sandbox/src/GeneratedComponent.tsx';

  console.log(`
✓ Pipeline completed
  Component: ${componentName}
  File:      ${outputPath}
  Preview:   cd sandbox && npm run dev
`);
}

main().catch((err: unknown) => {
  console.error(`\n✗ Unexpected error: ${String(err)}`);
  process.exit(1);
});
