# figgen — Figma-to-code multi-agent system

A multi-agent pipeline that converts a Figma design URL into a production-quality React + Tailwind component. Built with Mastra AI, GPT-4o, and the official Figma MCP server.

## System overview

Each agent is a pure async function with a single responsibility. Agents communicate through typed message contracts and know nothing about each other — only the Mastra orchestrator knows the full pipeline.

| Agent | File | Responsibility |
|---|---|---|
| **Ingestion Agent** | `src/agents/ingestion.ts` | Fetches Figma design data via MCP, parses the node tree, extracts design tokens and a screenshot |
| **Codegen Agent** | `src/agents/codegen.ts` | Receives FigmaContext, calls GPT-4o with the node tree + screenshot, returns production-quality TSX |
| **Render Agent** *(Phase 2)* | `src/agents/render.ts` | Writes TSX to sandbox, screenshots it with Playwright headless browser |
| **Diff Agent** *(Phase 2)* | `src/agents/diff.ts` | Pixel-diffs + GPT-4o vision-diffs the Figma screenshot vs rendered output |
| **Refinement Agent** *(Phase 2)* | `src/agents/refinement.ts` | Applies targeted code patches to fix visual discrepancies |

## Prerequisites

- **Node.js 20+**
- **OpenAI API key** — [platform.openai.com](https://platform.openai.com)
- **Figma Personal Access Token** — requires a Dev or Full seat
  - Figma → Settings → Security → Personal Access Tokens

## Setup

```bash
# 1. Install pipeline dependencies
npm install

# 2. Install sandbox dependencies
cd sandbox && npm install && cd ..

# 3. Configure environment variables
cp .env.example .env
# Edit .env and fill in your keys
```

## Running the pipeline

```bash
npx ts-node src/pipeline.ts "YOUR_FIGMA_URL"
```

Example:
```bash
npx ts-node src/pipeline.ts "https://www.figma.com/design/abc123/MyDesign?node-id=1-2"
```

The pipeline will:
1. Fetch the Figma frame data via the Figma MCP server
2. Extract the node tree, design tokens, and a screenshot
3. Call GPT-4o to generate a React TSX component
4. Write the component to `sandbox/src/GeneratedComponent.tsx`

Then preview it:
```bash
cd sandbox && npm run dev
# Open http://localhost:5173
```

## Project structure

```
figgen/
├── src/
│   ├── types/
│   │   └── index.ts              # Shared Zod schemas + TypeScript types for all agent messages
│   ├── utils/
│   │   ├── figma-parser.ts       # Raw Figma MCP response → typed FigmaNode tree
│   │   └── token-mapper.ts       # FigmaNode tree → DesignTokens (colors, spacing, etc.)
│   ├── agents/
│   │   ├── ingestion.ts          # Ingestion Agent — pure function, no framework imports
│   │   ├── codegen.ts            # Codegen Agent — pure function, calls GPT-4o directly
│   │   ├── render.ts             # Render Agent stub (Phase 2)
│   │   ├── diff.ts               # Diff Agent stub (Phase 2)
│   │   └── refinement.ts         # Refinement Agent stub (Phase 2)
│   ├── mastra/
│   │   ├── tools.ts              # createTool wrappers — bridge between orchestrator and agents
│   │   ├── agents.ts             # Mastra Agent instances with instructions + model
│   │   ├── workflow.ts           # Mastra workflow — sequential pipeline orchestration
│   │   └── index.ts              # Mastra instance export
│   └── pipeline.ts               # CLI entry point
├── sandbox/
│   ├── src/
│   │   ├── GeneratedComponent.tsx  # Written by the pipeline on each run
│   │   ├── App.tsx                 # Renders GeneratedComponent centered on screen
│   │   ├── main.tsx                # React root
│   │   └── index.css               # Tailwind directives
│   ├── index.html
│   ├── vite.config.ts            # Vite dev server on port 5173
│   ├── tailwind.config.ts        # Tailwind config (extend block patched per run)
│   └── package.json              # Standalone — works independently of the pipeline
├── output/                       # Reserved for future output artifacts
├── .env.example                  # Environment variable template
├── package.json
└── tsconfig.json
```

## Phase 2 roadmap

Phase 2 adds a visual comparison + refinement loop after the Codegen step:

1. **Render Agent** — uses Playwright to screenshot the generated component at the correct viewport width
2. **Diff Agent** — two-pass comparison:
   - Pass 1: pixel diff (jimp/sharp) for a quantitative fidelity score
   - Pass 2: GPT-4o vision diff for semantic issue identification (wrong colors, spacing, missing elements)
3. **Refinement Agent** — targeted GPT-4o prompts to patch specific issues without rewriting the whole component
4. **Loop** — the orchestrator repeats Render → Diff → Refine until fidelity score ≥ 0.95 or 3 iterations

Adding Phase 2 requires:
- Implementing the three stub agent functions in `src/agents/`
- Uncommenting the Phase 2 steps in `src/mastra/workflow.ts`
- Nothing in Phase 1 changes — open/closed principle applied to multi-agent systems
