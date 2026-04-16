# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

Figgen is a two-agent pipeline that converts Figma designs into production React+Tailwind components. A Codegen Agent generates/refines TSX, a Judge Agent scores visual fidelity and manages long-term memory, and a Render tool screenshots components via Playwright. The system improves across sessions through accumulated design guidelines.

## Commands

```bash
npm run dev                          # Start server (port 4111) + UI concurrently
npm run server                       # HTTP server only (SSE at /api/run)
npm run ui                           # React UI only
npm run pipeline "FIGMA_URL"         # CLI entry: run full pipeline on a Figma frame
npm run typecheck                    # TypeScript strict-mode check
npm run test:diff                    # Test the judge agent (scripts/test-diff.ts)

# Sandbox (separate package.json)
cd sandbox && npm run dev            # Vite dev server on port 5173
cd sandbox && npm run build          # Production build
```

## Setup

```bash
npm install                          # Pipeline dependencies
cd sandbox && npm install && cd ..   # Sandbox dependencies
cd ui && npm install && cd ..        # UI dependencies
npx playwright install chromium      # Headless browser for render tool
cp .env.example .env                 # Then fill in API keys
```

## Architecture

### Three packages in one repo

| Directory | Role | Port |
|-----------|------|------|
| `src/` | Pipeline server + agents (TypeScript, tsx/nodemon) | 4111 |
| `sandbox/` | Vite React app that renders the generated component | 5173 |
| `ui/` | React web UI with image comparison & iteration cards | (via `npm run ui`) |

### Two agents + one tool

Each agent is a **pure function** — no Mastra imports, no side effects beyond return values. Mastra wrappers live separately in `src/mastra/`.

1. **Codegen Agent** (`src/agents/codegen.ts`) — Dual-mode: generates TSX from Figma data (generation mode) or applies surgical fixes from a diff report (refinement mode). Reads design guidelines from long-term memory.
2. **Judge Agent** (`src/agents/judge.ts`) — Vision-compares Figma screenshot vs rendered screenshot, returns a DiffReport with fidelity score and categorized issues. Extracts generalizable design guidelines after successful sessions.
3. **Render Tool** (`src/agents/render.ts`) — Screenshots the sandbox component using Playwright headless Chromium. Not an LLM agent.

Pipeline orchestration: `pipeline.ts` (CLI) / `pipeline-runner.ts` (server).

### Pipeline loop

```
Read guidelines → Codegen (generate) → Write Sandbox → Render → Judge
                    ▲                                              │
                    └── Codegen (refine) ◄─── if fidelity < 0.95 ──┘
                                              (max 3 iterations)
On success: Judge extracts guidelines → Write to memory
```

### Long-term memory

Design guidelines accumulate in `output/memory/guidelines.json` across sessions. The Judge writes them after successful runs; the Codegen reads them before each generation. Capacity: 30 guidelines, evicted by lowest hitCount.

### Typed contracts

All agent inputs/outputs are defined as Zod schemas in `src/types/index.ts`: `GeneratedComponent`, `DiffReport`, `DiffIssue`, `Guideline`, `GuidelinesFile`.

### Caching

- **LLM cache**: `output/llm-cache/` — SHA-256 keyed by (model + system + user prompt)
- **Figma cache**: `output/figma-cache/` — JSON snapshots of Figma node data
- **Debug artifacts**: Timestamped directories under `output/debug/` with prompts, responses, screenshots

### Figma integration (src/utils/figma.ts)

Uses two approaches: the `figma-developer-mcp` server (via `@modelcontextprotocol/sdk`) for structured node data, and the REST API for screenshots. `parseFigmaUrl` extracts fileKey + nodeId from any Figma URL.

## Environment Variables

Required in `.env` (see `.env.example`):
- One LLM provider key: `REQUESTY_API_KEY` | `OPENROUTER_API_KEY` | `OPENAI_API_KEY` | `OLLAMA_MODEL`
- `FIGMA_ACCESS_TOKEN` — Figma personal access token
- `SERVER_PORT` (default 4111), `SANDBOX_URL` (default http://localhost:5173)

## Key Design Decisions

- Agent functions are pure; Mastra is an orchestration layer that can be swapped
- Codegen and refinement are unified in one agent — refinement is just codegen with existing TSX + diff report as additional context
- The sandbox is a separate Vite app so generated components render in full isolation with their own Tailwind config
- SSE streams pipeline events to the UI in real-time (server.ts → ui/src/App.tsx)
- Long-term memory enables cross-session improvement without model retraining
