# FigGen

Figma-to-code multi-agent pipeline. Given a Figma frame URL, FigGen iterates **codegen → render → judge** until the rendered React/Tailwind component visually matches the Figma design.

## Prerequisites

- **Node.js** ≥ 20 (tested on 22.x)
- **OpenAI-compatible API key** — used by the codegen and judge agents
- **Figma personal access token** — used to fetch node JSON and reference screenshots ([how to generate](https://developers.figma.com/docs/rest-api/personal-access-tokens/))

## Setup

```bash
# 1. Install dependencies for all three packages (root, UI, sandbox)
npm install
npm install --prefix ui
npm install --prefix sandbox

# 2. Install Playwright's Chromium (used by the renderer to screenshot the sandbox)
npx playwright install chromium

# 3. Configure environment
cp .env.example .env
```

Then edit `.env`:

| Variable             | Required? | Notes                                                   |
| -------------------- | --------- | ------------------------------------------------------- |
| `OPENAI_API_KEY`     | Required  | Key for the codegen and judge agents.                   |
| `OPENAI_CHAT_MODEL`  | Required  | Any chat model your endpoint serves (e.g. `gpt-4o`).    |
| `FIGMA_ACCESS_TOKEN` | Required  | Personal access token used to read node JSON + assets.  |
| `OPENAI_BASE_URL`    | Optional  | Set only if you're not using `api.openai.com`.          |

## Run

### Option A — UI (recommended for interactive use)

```bash
npm run dev
```

This starts the API server (`localhost:4111`) and the React UI (`localhost:5174`) concurrently. Open `http://localhost:5174`, paste a Figma frame URL, and click **Run**. Progress streams live: Figma screenshot → codegen → render → judge → refinement iterations.

### Option B — CLI (single run, useful for scripting)

```bash
npm run pipeline -- "<figmaUrl>" [--max-iter N] [--use-memory]
```

Examples:

```bash
# Default: 3 iterations (1 initial codegen + 2 refinement passes)
npm run pipeline -- "https://www.figma.com/design/abc123/My-File?node-id=1-2"

# Single-shot generation, no refinement
npm run pipeline -- "https://www.figma.com/design/abc123/My-File?node-id=1-2" --max-iter 1

# Enable long-term memory: read prior design guidelines and append new ones
npm run pipeline -- "<url>" --use-memory
```

The generated component is written to [sandbox/src/GeneratedComponent.tsx](sandbox/src/GeneratedComponent.tsx). Per-iteration debug artifacts (rendered screenshots, diff reports, prompts) are saved under `output/<timestamp>/`.

### Option C — Evaluation harness

```bash
npm run eval
```

Runs the pipeline across a fixed list of Figma URLs and reports MAE (pixel-level) and VES (DINOv2 cosine similarity) scores. You can customize the evaluation corpus by editing the `FIGMA_URLS` array in [evaluate/run-eval.ts](evaluate/run-eval.ts).

## Project layout

```
src/
  pipeline.ts          CLI entry point
  pipeline-runner.ts   Orchestrates the codegen ↔ judge loop
  server.ts            HTTP/SSE wrapper for the UI
  agents/
    codegen.ts         Generates/refines TSX from Figma JSON + screenshot
    judge.ts           Compares rendered screenshot against Figma, emits a diff report
  utils/
    figma.ts           Figma REST client (node JSON, screenshots, imageRef assets)
    render.ts          Boots Vite sandbox, screenshots #generated-component via Playwright
    memory.ts          Long-term design-guideline storage
ui/                    React/Vite frontend (port 5174)
sandbox/               Vite app that hosts the generated component (port 5173)
evaluate/              MAE + VES evaluation harness
```

## Ports

| Service       | Default port | Override                |
| ------------- | ------------ | ----------------------- |
| API server    | 4111         | `SERVER_PORT` env var   |
| UI dev server | 5174         | `ui/vite.config.ts`     |
| Sandbox       | 5173         | `SANDBOX_URL` env var   |

## Type-check

```bash
npm run typecheck
```
