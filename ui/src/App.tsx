import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { DiffIssue, IterationData, PipelineEvent } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<DiffIssue["category"], string> = {
  layout: "#3b82f6",
  color: "#8b5cf6",
  typography: "#ec4899",
  spacing: "#14b8a6",
  "missing-element": "#ef4444",
  "extra-element": "#f97316",
  other: "#6b7280",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  moderate: "#f59e0b",
  minor: "#6b7280",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ImageCompare({
  figma,
  render,
  label,
}: {
  figma: string | null;
  render: string | null;
  label: string;
}) {
  return (
    <div className="compare-row">
      <div className="compare-pane">
        <span className="compare-label">Figma</span>
        {figma ? (
          <img src={`data:image/png;base64,${figma}`} alt="Figma design" />
        ) : (
          <div className="skeleton-img" />
        )}
      </div>
      <div className="compare-divider" />
      <div className="compare-pane">
        <span className="compare-label">{label}</span>
        {render ? (
          <img src={`data:image/png;base64,${render}`} alt="Rendered component" />
        ) : (
          <div className="skeleton-img" />
        )}
      </div>
    </div>
  );
}

function IssueList({ issues }: { issues: DiffIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="issue-list">
      {issues.map((issue, i) => (
        <li key={i} className="issue-item">
          <span
            className="issue-tag"
            style={{
              background: CATEGORY_COLORS[issue.category] + "22",
              color: CATEGORY_COLORS[issue.category],
            }}
          >
            {issue.category}
          </span>
          {issue.severity && (
            <span
              className="severity-badge"
              style={{ color: SEVERITY_COLORS[issue.severity] }}
            >
              {issue.severity}
            </span>
          )}
          <span className="issue-desc">{issue.description}</span>
        </li>
      ))}
    </ul>
  );
}

function IterationCard({
  iter,
  figmaScreenshot,
  index,
  isLoading,
}: {
  iter: IterationData;
  figmaScreenshot: string | null;
  index: number;
  isLoading?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isInitial = iter.iteration === 0;
  const showCompare = isLoading || !!iter.screenshot || !!figmaScreenshot;

  const handleCopy = (e: MouseEvent) => {
    e.stopPropagation();
    if (!iter.tsx) return;
    navigator.clipboard.writeText(iter.tsx).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="iter-card">
      <div className="iter-header">
        <div className="iter-title">
          <span className="iter-index">
            {isInitial ? "Initial" : `Refined ×${iter.iteration}`}
          </span>
        </div>
        <div className="iter-header-actions">
          {iter.tsx && (
            <button className="copy-code-btn" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy Code"}
            </button>
          )}
          {iter.diff && (
            <span className="iter-issues-count">
              {iter.diff.issues.length} issue
              {iter.diff.issues.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {showCompare && (
        <ImageCompare
          figma={figmaScreenshot}
          render={iter.screenshot ?? null}
          label={isInitial ? "Initial render" : `Render ×${iter.iteration}`}
        />
      )}

      {iter.diff && (
        <>
          {iter.diff.summary && (
            <p className="iter-summary">{iter.diff.summary}</p>
          )}
          <IssueList issues={iter.diff.issues} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

type Status = "idle" | "running" | "done" | "error";

export default function App() {
  const [figmaUrl, setFigmaUrl] = useState(
    "https://www.figma.com/design/uqQOs5jCjugYd6fUUonoE9/figgen-%E2%80%94-Test-Design?node-id=2-2",
  );
  const [maxIter, setMaxIter] = useState(3);
  const [status, setStatus] = useState<Status>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [figmaScreenshot, setFigmaScreenshot] = useState<string | null>(null);
  const [iterations, setIterations] = useState<IterationData[]>([]);
  const [componentName, setComponentName] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, msg]);
  }, []);

  const handleEvent = useCallback(
    (event: PipelineEvent) => {
      switch (event.type) {
        case "log":
          addLog(event.message);
          break;
        case "figma_screenshot":
          setFigmaScreenshot(event.screenshot);
          break;
        case "codegen_done":
          setComponentName(event.componentName);
          addLog(`✓ Component: ${event.componentName} (${event.lines} lines)`);
          setIterations((prev) => {
            const next = [...prev];
            const existing = next.findIndex(
              (i) => i.iteration === event.iteration,
            );
            if (existing >= 0) {
              next[existing] = { ...next[existing], tsx: event.tsx };
            } else {
              next.push({ iteration: event.iteration, tsx: event.tsx });
            }
            return next;
          });
          break;
        case "render_done":
          setIterations((prev) => {
            const next = [...prev];
            const existing = next.findIndex(
              (i) => i.iteration === event.iteration,
            );
            if (existing >= 0) {
              next[existing] = {
                ...next[existing],
                screenshot: event.screenshot,
              };
            } else {
              next.push({
                iteration: event.iteration,
                screenshot: event.screenshot,
              });
            }
            return next;
          });
          break;
        case "judge_done":
          setIterations((prev) => {
            const next = [...prev];
            const existing = next.findIndex(
              (i) => i.iteration === event.iteration,
            );
            const diffData = {
              issues: event.issues,
              summary: event.summary,
            };
            if (existing >= 0) {
              next[existing] = { ...next[existing], diff: diffData };
            } else {
              next.push({ iteration: event.iteration, diff: diffData });
            }
            return next;
          });
          break;
        case "memory_updated":
          addLog(`✓ Saved ${event.guidelinesCount} new design guideline(s) to memory`);
          break;
        case "done":
          setStatus("done");
          addLog(
            `✓ Done — ${event.iterations} iteration(s)${event.finalIssueCount !== null ? `, ${event.finalIssueCount} remaining issue(s)` : ""}`,
          );
          break;
        case "error":
          setStatus("error");
          addLog(`✗ ${event.message}`);
          break;
      }
    },
    [addLog],
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
            } catch {}
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setStatus("error");
        addLog(`✗ Connection error: ${err.message}`);
      }
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setStatus("idle");
    addLog("— stopped by user");
  };

  const isRunning = status === "running";

  return (
    <div className="app">
      {/* Header */}
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
              isRunning ? stop() : run();
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
              <label className="iter-label">iter</label>
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

          <div className="header-actions">
            <button
              className="action-btn"
              onClick={async () => {
                try {
                  const res = await fetch("/api/cache", { method: "DELETE" });
                  const data = await res.json();
                  addLog(`LLM cache cleared (${data.cleared.llm} entries)`);
                } catch {
                  addLog("✗ Failed to clear LLM cache");
                }
              }}
              disabled={isRunning}
              title="Clear cached LLM responses (codegen + judge). Figma data is preserved."
            >
              Clear LLM Cache
            </button>
            <button
              className="action-btn"
              onClick={async () => {
                if (!window.confirm("Clear Figma data cache? Next run will re-fetch design data and screenshots from Figma.")) return;
                try {
                  const res = await fetch("/api/figma-cache", { method: "DELETE" });
                  const data = await res.json();
                  addLog(`Figma cache cleared (${data.cleared.figma} entries)`);
                } catch {
                  addLog("✗ Failed to clear Figma cache");
                }
              }}
              disabled={isRunning}
              title="Clear cached Figma screenshots and design data. Next run will re-fetch from Figma API."
            >
              Clear Figma Cache
            </button>
            <button
              className="action-btn action-btn--danger"
              onClick={async () => {
                if (!window.confirm("Clear all design guidelines from memory?")) return;
                try {
                  await fetch("/api/memory", { method: "DELETE" });
                  addLog("Memory cleared — all guidelines removed");
                } catch {
                  addLog("✗ Failed to clear memory");
                }
              }}
              disabled={isRunning}
              title="Delete all accumulated design guidelines. Cannot be undone."
            >
              Clear Memory
            </button>
          </div>

          <div className={`status-dot status-dot--${status}`} title={status} />
        </div>
      </header>

      {/* Body */}
      <div className="body">
        {/* Log panel */}
        <aside className="log-panel">
          <div className="panel-title">Log</div>
          <div className="log-scroll">
            {logs.length === 0 && (
              <span className="log-empty">Waiting for run…</span>
            )}
            {logs.map((line, i) => (
              <div
                key={i}
                className={`log-line ${line.startsWith("✗") ? "log-line--error" : line.startsWith("✓") ? "log-line--ok" : ""}`}
              >
                <span className="log-prompt">›</span>
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </aside>

        {/* Results panel */}
        <main className="results-panel">
          {status === "idle" && iterations.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">⇄</div>
              <p>
                Paste a Figma URL and hit <strong>Run →</strong> to generate and
                compare your component.
              </p>
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
              iter={{ iteration: 0 }}
              figmaScreenshot={figmaScreenshot}
              index={0}
              isLoading={true}
            />
          )}

          {iterations.map((iter, idx) => (
            <IterationCard
              key={iter.iteration}
              iter={iter}
              figmaScreenshot={figmaScreenshot}
              index={idx}
              isLoading={isRunning && !iter.screenshot}
            />
          ))}
        </main>
      </div>
    </div>
  );
}
