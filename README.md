# figgen — Figma-to-code multi-agent system

A multi-agent pipeline that converts a Figma design URL into a production-quality React + Tailwind component. Built with Mastra AI, GPT-4o vision, and the official Figma MCP server.

## Architecture

Two LLM agents and one render tool operate in a loop:

| Component | File | Role |
|---|---|---|
| **Codegen Agent** | `src/agents/codegen.ts` | Generates React TSX from Figma data (generation mode) or applies surgical fixes based on a diff report (refinement mode). Reads long-term design guidelines from memory before each run. |
| **Judge Agent** | `src/agents/judge.ts` | Compares Figma screenshot vs rendered component using vision LLM. Returns a fidelity score (0–1) and categorized issues. After a successful session, extracts generalizable design guidelines and saves them to long-term memory. |
| **Render Tool** | `src/agents/render.ts` | Screenshots the generated component in a headless Chromium browser at the exact Figma frame dimensions. Not an LLM agent. |

### Pipeline flow

```
Read guidelines from memory
  │
  ▼
Codegen (generate) → Write Sandbox → Render → Judge
                                        ▲        │
                                        │        ▼
                                   Write Sandbox ← Codegen (refine) ◄── if fidelity < 95%
                                                                          (max 3 iterations)
  │
  ▼  (on success)
Judge extracts guidelines → Save to memory
```

### Long-term memory

Design guidelines accumulate across sessions in `output/memory/guidelines.json`. The Judge agent writes them; the Codegen agent reads them. Over time the system generates better first-pass code without retraining. Capacity is capped at 30 guidelines with hitCount-based eviction.

## Prerequisites

- **Node.js 20+**
- **Figma Personal Access Token** — requires a Dev or Full seat
  - Figma → Settings → Security → Personal Access Tokens
- **LLM API key** — at least one of: Requesty (recommended), OpenRouter, OpenAI, or local Ollama

## Setup

```bash
# 1. Install pipeline dependencies
npm install

# 2. Install sandbox dependencies
cd sandbox && npm install && cd ..

# 3. Install UI dependencies
cd ui && npm install && cd ..

# 4. Install Playwright browser
npx playwright install chromium

# 5. Configure environment variables
cp .env.example .env
# Edit .env and fill in your keys
```

## Running the project

### Option A: Web UI (recommended)

```bash
npm run dev
```

This starts both the API server (port 4111) and the React UI concurrently. Open the URL printed in the terminal, paste a Figma frame URL, and click **Run →**.

### Option B: CLI

```bash
npm run pipeline "https://www.figma.com/design/abc123/MyDesign?node-id=1-2"
```

CLI flags:
- `--max-iter N` — max refinement iterations (default: 3, use 0 to skip the render/judge loop)
- `--skip-codegen` — skip generation and use the existing `sandbox/src/GeneratedComponent.tsx`
- `--stop-after-figma` — fetch Figma data and save to debug dir, then exit

### Option C: Individual services

```bash
npm run server                       # API server only (port 4111)
npm run ui                           # React UI only
cd sandbox && npm run dev            # Sandbox preview (port 5173)
```

## Available scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start server + UI concurrently |
| `npm run server` | HTTP server with SSE endpoint (`/api/run`) |
| `npm run ui` | React web UI |
| `npm run pipeline "URL"` | CLI pipeline entry point |
| `npm run typecheck` | TypeScript type checking |
| `npm run test:diff` | Test the judge agent with saved debug artifacts |

## Environment variables

Set in `.env` (see `.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `REQUESTY_API_KEY` | One LLM key required | Requesty API key (recommended) |
| `REQUESTY_MODEL` | No | Model override (default: `openai-responses/gpt-5.4-nano`) |
| `REQUESTY_DIFF_MODEL` | No | Separate model for Judge agent (default: `openai/gpt-4o`) |
| `OPENROUTER_API_KEY` | Alt | OpenRouter API key |
| `OPENAI_API_KEY` | Alt | OpenAI API key |
| `OLLAMA_MODEL` | Alt | Ollama model name for local inference |
| `FIGMA_ACCESS_TOKEN` | Yes | Figma personal access token |
| `SERVER_PORT` | No | Server port (default: 4111) |
| `SANDBOX_URL` | No | Sandbox URL (default: `http://localhost:5173`) |

## Project structure

```
figgen/
├── src/
│   ├── agents/
│   │   ├── codegen.ts              # Codegen Agent — generation + refinement
│   │   ├── judge.ts                # Judge Agent — fidelity scoring + guideline extraction
│   │   └── render.ts               # Render tool — Playwright screenshots
│   ├── types/
│   │   └── index.ts                # Zod schemas (GeneratedComponent, DiffReport, Guideline)
│   ├── utils/
│   │   ├── figma.ts                # Figma MCP + REST API integration with caching
│   │   ├── llm-cache.ts            # File-based LLM response cache
│   │   ├── memory.ts               # Long-term guideline memory (read/write/evict)
│   │   └── debug.ts                # Debug run directory & artifact management
│   ├── mastra/
│   │   ├── agents.ts               # Mastra Agent instances
│   │   ├── tools.ts                # Mastra Tool wrappers
│   │   ├── workflow.ts             # Mastra workflow (codegen → write sandbox)
│   │   └── index.ts                # Mastra instance export
│   ├── pipeline.ts                 # CLI entry point
│   ├── pipeline-runner.ts          # Event-emitting pipeline (used by server)
│   └── server.ts                   # HTTP server with SSE streaming
├── sandbox/                        # Isolated Vite React app for component preview
├── ui/                             # React web UI for pipeline control
├── scripts/
│   └── test-diff.ts                # Standalone judge prompt testing
├── output/                         # Generated at runtime
│   ├── debug/                      # Timestamped run directories with artifacts
│   ├── llm-cache/                  # Cached LLM responses
│   ├── figma-cache/                # Cached Figma API data
│   └── memory/                     # Long-term design guidelines
└── .env.example
```
