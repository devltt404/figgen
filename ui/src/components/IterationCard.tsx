import { useState, type MouseEvent } from "react";
import type { IterationData } from "../types";
import { ImageCompare } from "./ImageCompare";
import { IssueList } from "./IssueList";

interface IterationCardProps {
  iter: IterationData;
  figmaScreenshot: string | null;
  isLoading?: boolean;
}

export function IterationCard({
  iter,
  figmaScreenshot,
  isLoading,
}: IterationCardProps) {
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);

  // iteration 1 is the initial codegen; iterations 2+ are refinements.
  const isInitial = iter.iteration === 1;
  const showCompare = isLoading || !!iter.screenshot || !!figmaScreenshot;
  const componentName = extractComponentName(iter.tsx) ?? "GeneratedComponent";

  const handleCopy = (e: MouseEvent) => {
    e.stopPropagation();
    if (!iter.tsx) return;
    navigator.clipboard.writeText(iter.tsx).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleDownload = (e: MouseEvent) => {
    e.stopPropagation();
    if (!iter.tsx) return;
    const blob = new Blob([iter.tsx], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${componentName}.tsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="iter-card">
      <div className="iter-header">
        <div className="iter-title">
          <span className="iter-index">
            {isInitial ? "Initial" : `Refined ×${iter.iteration - 1}`}
          </span>
        </div>
        <div className="iter-header-actions">
          {iter.tsx && (
            <>
              <button
                className="copy-code-btn"
                onClick={() => setShowCode((s) => !s)}
                aria-expanded={showCode}
              >
                {showCode ? "Hide Code" : "View Code"}
              </button>
              <button className="copy-code-btn" onClick={handleDownload}>
                Download
              </button>
              <button className="copy-code-btn" onClick={handleCopy}>
                {copied ? "Copied!" : "Copy Code"}
              </button>
            </>
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
          label={isInitial ? "Initial render" : `Render ×${iter.iteration - 1}`}
        />
      )}

      {showCode && iter.tsx && (
        <pre className="code-view">
          <code>{iter.tsx}</code>
        </pre>
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

function extractComponentName(tsx: string | undefined): string | null {
  if (!tsx) return null;
  const patterns = [
    /export\s+(?:default\s+)?(?:function|class)\s+([A-Z][A-Za-z0-9_]*)/,
    /export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*[=:]/,
    /export\s+default\s+([A-Z][A-Za-z0-9_]*)/,
  ];
  for (const p of patterns) {
    const m = tsx.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}
