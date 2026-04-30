// Boots the Vite sandbox, screenshots `#generated-component` via Playwright, tears it down.

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_DIR = path.resolve(__dirname, "../../sandbox");
const SANDBOX_URL = process.env.SANDBOX_URL ?? "http://localhost:5173";

const SERVER_TIMEOUT_MS = 30_000;
const PAGE_TIMEOUT_MS = 30_000;
const ROOT_TIMEOUT_MS = 10_000;
const VIEWPORT_FALLBACK = { width: 1280, height: 800 };

function startViteServer(): ChildProcess {
  return spawn("npm", ["run", "dev"], {
    cwd: SANDBOX_DIR,
    shell: true,
    stdio: "pipe",
  });
}

/** Poll the dev server URL until it answers (or the timeout elapses). */
async function waitForServer(
  url: string,
  timeoutMs = SERVER_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      // Any non-5xx response means the server is up enough to serve static
      // files; HMR may still be wiring up, but Playwright's `networkidle`
      // wait absorbs that.
      if (res.ok || res.status < 500) return;
    } catch {
      // ECONNREFUSED while Vite boots — keep polling
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Vite server did not start within ${timeoutMs}ms`);
}

/**
 * Boot the sandbox dev server, screenshot `#generated-component`, tear the
 * server back down. The caller has already written the TSX to disk via
 * `pipeline-runner.writeSandbox`, so HMR will pick it up before we screenshot.
 *
 * `viewportSize` should match the Figma node's pixel dimensions so the
 * rendered output's aspect/scale matches the design — the pipeline supplies
 * this from `getFigmaNodeSize`. Falls back to 1280×800 if unspecified.
 */
export async function runRender(
  viewportSize: { width: number; height: number } = VIEWPORT_FALLBACK,
): Promise<string> {
  console.log(
    `  [Render] starting Vite sandbox... (viewport ${viewportSize.width}×${viewportSize.height})`,
  );
  const server = startViteServer();

  try {
    await waitForServer(SANDBOX_URL);
    console.log(
      `  [Render] server ready — launching Chromium → ${SANDBOX_URL}`,
    );

    const browser = await chromium.launch();
    try {
      // deviceScaleFactor: 2 matches the scale the Figma /v1/images endpoint
      // uses (we request `&scale=2`), so the pixel dimensions of both
      // screenshots align without a post-render resize.
      const page = await browser.newPage({ deviceScaleFactor: 2 });
      await page.setViewportSize(viewportSize);
      await page.goto(SANDBOX_URL, {
        waitUntil: "networkidle",
        timeout: PAGE_TIMEOUT_MS,
      });

      const root = page.locator("#generated-component");
      await root.waitFor({ timeout: ROOT_TIMEOUT_MS });
      // Web fonts (e.g. Google Fonts loaded via `@import` in the generated
      // TSX) may still be loading at networkidle; this guarantees text is
      // metric-correct in the screenshot.
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
