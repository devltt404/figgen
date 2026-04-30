import { useCallback, useEffect, useRef, useState } from "react";
import { IterationCard } from "./components/IterationCard";
import { LogPanel } from "./components/LogPanel";
import { parseLog, type LogEntry } from "./utils/logParser";
import type { IterationData, PipelineEvent } from "./types";
import {
  loadFigmaUrl,
  loadMaxIter,
  loadRecentUrls,
  pushRecentUrl,
  saveFigmaUrl,
  saveMaxIter,
} from "./utils/storage";

type Status = "idle" | "running" | "done" | "error";

const DEFAULT_URL =
  "https://www.figma.com/design/uqQOs5jCjugYd6fUUonoE9/figgen-%E2%80%94-Test-Design?node-id=2-2";

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    const name = segs[2] ? decodeURIComponent(segs[2]) : segs.at(-1) ?? url;
    const nodeId = u.searchParams.get("node-id");
    return nodeId ? `${name} · ${nodeId}` : name;
  } catch {
    return url;
  }
}

export default function App() {
  const [figmaUrl, setFigmaUrl] = useState(() => loadFigmaUrl(DEFAULT_URL));
  const [maxIter, setMaxIter] = useState(() => loadMaxIter(3));
  const [recentUrls, setRecentUrls] = useState<string[]>(() => loadRecentUrls());
  const [status, setStatus] = useState<Status>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [figmaScreenshot, setFigmaScreenshot] = useState<string | null>(null);
  const [iterations, setIterations] = useState<IterationData[]>([]);
  const [componentName, setComponentName] = useState<string | null>(null);

  // Parser state — the "current group" follows context across messages.
  const groupRef = useRef<string>("Setup");
  // Auto-follow flag for the log panel.
  const stickToBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  // Persist URL + max-iter as the user changes them.
  useEffect(() => {
    saveFigmaUrl(figmaUrl);
  }, [figmaUrl]);
  useEffect(() => {
    saveMaxIter(maxIter);
  }, [maxIter]);

  const pushLog = useCallback((raw: string) => {
    const { entry, nextGroup } = parseLog(raw, groupRef.current);
    groupRef.current = nextGroup;
    setLogs((prev) => [...prev, entry]);
  }, []);

  const handleEvent = useCallback(
    (event: PipelineEvent) => {
      switch (event.type) {
        case "log":
          pushLog(event.message);
          break;
        case "figma_screenshot":
          setFigmaScreenshot(event.screenshot);
          break;
        case "codegen_done":
          // Component name comes from this typed event. The companion raw
          // "Codegen done — Name (N lines)" log is parsed separately, so we
          // don't push another line here.
          setComponentName(event.componentName);
          setIterations((prev) => {
            const next = [...prev];
            const existing = next.findIndex((i) => i.iteration === event.iteration);
            if (existing >= 0) next[existing] = { ...next[existing], tsx: event.tsx };
            else next.push({ iteration: event.iteration, tsx: event.tsx });
            return next;
          });
          break;
        case "render_done":
          setIterations((prev) => {
            const next = [...prev];
            const existing = next.findIndex((i) => i.iteration === event.iteration);
            if (existing >= 0)
              next[existing] = { ...next[existing], screenshot: event.screenshot };
            else next.push({ iteration: event.iteration, screenshot: event.screenshot });
            return next;
          });
          break;
        case "judge_done":
          setIterations((prev) => {
            const next = [...prev];
            const existing = next.findIndex((i) => i.iteration === event.iteration);
            const diff = { issues: event.issues, summary: event.summary };
            if (existing >= 0) next[existing] = { ...next[existing], diff };
            else next.push({ iteration: event.iteration, diff });
            return next;
          });
          break;
        case "memory_updated":
          // Memory writes already produce a parseable raw log line; no need
          // to synthesise another entry here.
          break;
        case "done":
          setStatus("done");
          pushLog(
            `✓ Done — ${event.iterations} iteration(s)` +
              (event.finalIssueCount !== null
                ? `, ${event.finalIssueCount} remaining issue(s)`
                : ""),
          );
          break;
        case "error":
          setStatus("error");
          pushLog(`✗ ${event.message}`);
          break;
      }
    },
    [pushLog],
  );

  const run = async () => {
    if (!figmaUrl.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus("running");
    setLogs([]);
    setFigmaScreenshot(null);
    setIterations([]);
    setComponentName(null);
    groupRef.current = "Setup";
    stickToBottomRef.current = true;

    setRecentUrls(pushRecentUrl(figmaUrl.trim()));

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ figmaUrl: figmaUrl.trim(), maxIter }),
        signal: ctrl.signal,
      });

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (line.startsWith("data: ")) {
            try {
              handleEvent(JSON.parse(line.slice(6)));
            } catch {
              // malformed event line — skip
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setStatus("error");
        pushLog(`✗ Connection error: ${err.message}`);
      }
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setStatus("idle");
    pushLog("— stopped by user");
  };

  const isRunning = status === "running";

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-mark">f</span>
            <span className="logo-name">figgen</span>
          </div>

          <form
            className="run-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (isRunning) stop();
              else run();
            }}
          >
            <input
              className="url-input"
              type="url"
              placeholder="https://www.figma.com/design/..."
              value={figmaUrl}
              onChange={(e) => setFigmaUrl(e.target.value)}
              disabled={isRunning}
              spellCheck={false}
            />
            <div className="iter-control">
              <label className="iter-label">Max Iteration</label>
              <input
                className="iter-input"
                type="number"
                min={0}
                max={10}
                value={maxIter}
                onChange={(e) => setMaxIter(parseInt(e.target.value) || 0)}
                disabled={isRunning}
              />
            </div>
            <button
              type="submit"
              className={`run-btn ${isRunning ? "run-btn--stop" : ""}`}
              disabled={!isRunning && !figmaUrl.trim()}
            >
              {isRunning ? (
                <>
                  <span className="spinner" /> Stop
                </>
              ) : (
                "Run →"
              )}
            </button>
          </form>

          <div className={`status-dot status-dot--${status}`} title={status} />
        </div>
      </header>

      <div className="body">
        <LogPanel
          entries={logs}
          followEnabled={stickToBottomRef.current}
          onScroll={(atBottom) => {
            stickToBottomRef.current = atBottom;
          }}
        />

        <main className="results-panel">
          {status === "idle" && iterations.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">⇄</div>
              <p>
                Paste a Figma URL and hit <strong>Run →</strong> to generate and compare
                your component.
              </p>
              {recentUrls.length > 0 && (
                <div className="recent-runs">
                  <div className="recent-runs-title">Recent</div>
                  <div className="recent-runs-list">
                    {recentUrls.map((url) => (
                      <button
                        key={url}
                        type="button"
                        className="recent-chip"
                        title={url}
                        onClick={() => setFigmaUrl(url)}
                      >
                        {shortenUrl(url)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {componentName && (
            <div className="component-badge">
              <span className="component-badge-label">Component</span>
              <code className="component-badge-name">{componentName}</code>
            </div>
          )}

          {isRunning && iterations.length === 0 && (
            <IterationCard
              iter={{ iteration: 1 }}
              figmaScreenshot={figmaScreenshot}
              isLoading={true}
            />
          )}

          {iterations.map((iter) => (
            <IterationCard
              key={iter.iteration}
              iter={iter}
              figmaScreenshot={figmaScreenshot}
              isLoading={isRunning && !iter.screenshot}
            />
          ))}
        </main>
      </div>
    </div>
  );
}
