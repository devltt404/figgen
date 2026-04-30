/**
 * CLI entry point for the figgen pipeline.
 *
 * Usage:
 *   npx tsx src/pipeline.ts "<figmaUrl>" [--max-iter N]
 *
 * Thin wrapper around `runPipeline` (src/pipeline-runner.ts) that prints events
 * to the terminal and exits non-zero on error.
 */

import "dotenv/config";
import { runPipeline, type PipelineEvent } from "./pipeline-runner.js";

const DEFAULT_MAX_ITER = 3;

function parseArgs(argv: string[]) {
  const figmaUrl = argv.find((a) => !a.startsWith("--"));
  const maxIterIdx = argv.indexOf("--max-iter");
  const maxIter =
    maxIterIdx !== -1 ? parseInt(argv[maxIterIdx + 1] ?? "", 10) : DEFAULT_MAX_ITER;
  return { figmaUrl, maxIter };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.figmaUrl) {
    console.error(
      'Usage: npx tsx src/pipeline.ts "<figmaUrl>" [--max-iter N]',
    );
    process.exit(1);
  }
  if (isNaN(args.maxIter) || args.maxIter < 0) {
    console.error("--max-iter must be a non-negative integer");
    process.exit(1);
  }

  console.log(`\nfiggen — Figma-to-code pipeline`);
  console.log(`URL: ${args.figmaUrl}\n`);

  let exitCode = 0;
  const onEvent = (event: PipelineEvent): void => {
    switch (event.type) {
      case "log":
        console.log(`  ${event.message}`);
        break;
      case "codegen_done":
        console.log(`  [Codegen ${event.iteration}] ${event.componentName} (${event.lines} lines, ${event.mode})`);
        break;
      case "render_done":
        console.log(`  [Render ${event.iteration}] complete`);
        break;
      case "judge_done":
        console.log(`  [Judge ${event.iteration}] ${event.issues.length} issue(s)`);
        break;
      case "memory_updated":
        console.log(`  [Memory] saved ${event.guidelinesCount} new guideline(s)`);
        break;
      case "done":
        console.log(
          `\n✓ Done — component=${event.componentName} iterations=${event.iterations}` +
            (event.finalIssueCount !== null ? ` remaining-issues=${event.finalIssueCount}` : ""),
        );
        break;
      case "error":
        console.error(`\n✗ ${event.message}`);
        exitCode = 1;
        break;
    }
  };

  await runPipeline(
    args.figmaUrl,
    { maxIter: args.maxIter },
    onEvent,
  );

  process.exit(exitCode);
}

main().catch((err: unknown) => {
  console.error(`\n✗ Unexpected error: ${String(err)}`);
  process.exit(1);
});
