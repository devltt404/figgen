/**
 * Render Agent — src/agents/render.ts
 *
 * Starts the Vite sandbox dev server, navigates to it with a viewport sized to
 * match the Figma node's actual dimensions (fetched from the API), screenshots
 * the rendered component, then shuts the server down.
 *
 * Input:  GeneratedComponent + optional figmaUrl for viewport sizing
 * Output: string — base64 PNG screenshot of the rendered component
 *
 * IMPORTANT: This is a pure agent function. Zero imports from @mastra/core
 * or any orchestration framework. The Mastra wrapper lives in src/mastra/.
 */

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import type { GeneratedComponent } from "../types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_DIR = path.resolve(__dirname, "../../sandbox");
const SANDBOX_URL = process.env.SANDBOX_URL ?? "http://localhost:5173";

// ---------------------------------------------------------------------------
// Vite server helpers
// ---------------------------------------------------------------------------

function startViteServer(): ChildProcess {
  return spawn("npm", ["run", "dev"], {
    cwd: SANDBOX_DIR,
    shell: true,
    stdio: "pipe",
  });
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok || res.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Vite server did not start within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Public agent function
// ---------------------------------------------------------------------------

/**
 * Render Agent entry point.
 *
 * @param _component  - GeneratedComponent (kept for interface consistency)
 * @param viewportSize - viewport dimensions to use; defaults to 1280×800
 * @returns base64 PNG screenshot of the rendered component
 */
export async function runRender(
  _component: GeneratedComponent,
  viewportSize: { width: number; height: number } = {
    width: 1280,
    height: 800,
  },
): Promise<string> {
  console.log(
    `  [Render] starting Vite sandbox… (viewport ${viewportSize.width}×${viewportSize.height})`,
  );
  const server = startViteServer();

  try {
    await waitForServer(SANDBOX_URL);
    console.log(
      `  [Render] server ready — launching Chromium → ${SANDBOX_URL}`,
    );

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        deviceScaleFactor: 2,
      });
      await page.setViewportSize(viewportSize);
      await page.goto(SANDBOX_URL, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
      const root = page.locator("#generated-component");
      await root.waitFor({ timeout: 10_000 });
      await page.evaluate("document.fonts.ready");

      const screenshot = await root.screenshot();
      console.log(
        `  [Render] screenshot captured (${Math.round(screenshot.length / 1024)} KB)`,
      );
      return screenshot.toString("base64");
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
    console.log("  [Render] Vite server stopped");
  }
}
