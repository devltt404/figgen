/**
 * Log message parser — converts raw pipeline messages into structured
 * `LogEntry` records the UI can render with consistent grouping and icons.
 *
 * The pipeline emits flat strings (e.g. "Generating iteration 0...",
 * "Render 0 complete", "Saved 2 new design guideline(s) to memory"). This
 * parser detects which phase the message belongs to (Setup / Iteration N /
 * Memory / Done) and rewrites the wording into something a non-developer
 * can scan quickly.
 */

export type LogLevel = "info" | "step" | "ok" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  group: string;
  text: string;
}

/**
 * Parse one raw message into a `LogEntry`, given the current phase. Returns
 * the entry plus the new "current group" so the caller can carry it forward
 * for subsequent messages whose group is implied by context.
 */
export function parseLog(
  raw: string,
  currentGroup: string,
): { entry: LogEntry; nextGroup: string } {
  const trimmed = raw.trim();

  // ── Iteration boundaries ────────────────────────────────────────────────
  const genStart = trimmed.match(/^Generating iteration (\d+)...?$/);
  if (genStart) {
    const group = `Iteration ${genStart[1]}`;
    return {
      entry: { level: "step", group, text: "Generating code..." },
      nextGroup: group,
    };
  }
  const refStart = trimmed.match(/^Refining iteration (\d+)...?$/);
  if (refStart) {
    const group = `Iteration ${refStart[1]}`;
    return {
      entry: { level: "step", group, text: "Refining code..." },
      nextGroup: group,
    };
  }

  // ── Codegen done (de-noised) ────────────────────────────────────────────
  const cgDone = trimmed.match(/^Codegen done — (\S+) \((\d+) lines\)$/);
  if (cgDone) {
    return {
      entry: {
        level: "ok",
        group: currentGroup,
        text: `Generated ${cgDone[1]} (${cgDone[2]} lines)`,
      },
      nextGroup: currentGroup,
    };
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (/^Rendering iteration \d+...?$/.test(trimmed)) {
    return {
      entry: {
        level: "step",
        group: currentGroup,
        text: "Rendering component...",
      },
      nextGroup: currentGroup,
    };
  }
  if (/^Render \d+ complete$/.test(trimmed)) {
    return {
      entry: { level: "ok", group: currentGroup, text: "Render complete" },
      nextGroup: currentGroup,
    };
  }

  // ── Judge ───────────────────────────────────────────────────────────────
  if (/^Judging iteration \d+...?$/.test(trimmed)) {
    return {
      entry: {
        level: "step",
        group: currentGroup,
        text: "Comparing design vs. render...",
      },
      nextGroup: currentGroup,
    };
  }
  const judgeDone = trimmed.match(/^Judge \d+ — (\d+) issue/);
  if (judgeDone) {
    const n = parseInt(judgeDone[1], 10);
    return {
      entry: {
        level: n === 0 ? "ok" : "info",
        group: currentGroup,
        text:
          n === 0
            ? "Pixel-perfect match"
            : `${n} issue${n === 1 ? "" : "s"} found`,
      },
      nextGroup: currentGroup,
    };
  }
  if (trimmed === "No issues found — stopping early") {
    return {
      entry: {
        level: "ok",
        group: currentGroup,
        text: "Stopping early — no remaining issues",
      },
      nextGroup: currentGroup,
    };
  }

  // ── Memory phase ────────────────────────────────────────────────────────
  if (
    trimmed === "Extracting design guidelines..." ||
    trimmed === "Extracting design guidelines..."
  ) {
    return {
      entry: {
        level: "step",
        group: "Memory",
        text: "Extracting guidelines...",
      },
      nextGroup: "Memory",
    };
  }
  const extracted = trimmed.match(/^Extracted (\d+) guideline\(s\)$/);
  if (extracted) {
    return {
      entry: {
        level: "ok",
        group: "Memory",
        text: `Extracted ${extracted[1]} guideline(s)`,
      },
      nextGroup: "Memory",
    };
  }
  const saved = trimmed.match(
    /^Saved (\d+) new design guideline\(s\) to memory$/,
  );
  if (saved) {
    return {
      entry: {
        level: "ok",
        group: "Memory",
        text: `Saved ${saved[1]} guideline(s) to memory`,
      },
      nextGroup: "Memory",
    };
  }
  if (trimmed.startsWith("Loaded ") && trimmed.includes("guideline")) {
    const m = trimmed.match(/Loaded (\d+)/);
    const count = m ? m[1] : "?";
    return {
      entry: {
        level: "info",
        group: "Setup",
        text: `Loaded ${count} guideline(s) from memory`,
      },
      nextGroup: currentGroup,
    };
  }

  // ── Setup phase ─────────────────────────────────────────────────────────
  if (
    trimmed === "Starting pipeline..." ||
    trimmed === "Starting pipeline..."
  ) {
    return {
      entry: { level: "step", group: "Setup", text: "Starting pipeline" },
      nextGroup: "Setup",
    };
  }
  if (trimmed.startsWith("URL:")) {
    return {
      entry: { level: "info", group: "Setup", text: trimmed },
      nextGroup: "Setup",
    };
  }
  const maxIterMatch = trimmed.match(/^Max iterations: (\d+)$/);
  if (maxIterMatch) {
    return {
      entry: {
        level: "info",
        group: "Setup",
        text: `Max iterations: ${maxIterMatch[1]}`,
      },
      nextGroup: "Setup",
    };
  }
  if (
    trimmed === "Fetching Figma screenshot..." ||
    trimmed === "Fetching Figma screenshot..."
  ) {
    return {
      entry: {
        level: "step",
        group: "Setup",
        text: "Fetching Figma screenshot...",
      },
      nextGroup: "Setup",
    };
  }
  if (trimmed.startsWith("Figma screenshot ready")) {
    return {
      entry: { level: "ok", group: "Setup", text: "Design loaded" },
      nextGroup: "Setup",
    };
  }
  const nodeSize = trimmed.match(/Figma node size:\s*(\d+)[×x](\d+)/);
  if (nodeSize) {
    return {
      entry: {
        level: "info",
        group: "Setup",
        text: `Frame: ${nodeSize[1]} × ${nodeSize[2]}`,
      },
      nextGroup: "Setup",
    };
  }

  // ── Synthesised completion / error / user ───────────────────────────────
  if (trimmed.startsWith("✓ Done")) {
    return {
      entry: {
        level: "ok",
        group: "Done",
        text: trimmed.replace(/^✓\s*Done\s*—?\s*/, "") || "Done",
      },
      nextGroup: "Done",
    };
  }
  if (trimmed.startsWith("✗")) {
    return {
      entry: {
        level: "error",
        group: currentGroup,
        text: trimmed.replace(/^✗\s*/, ""),
      },
      nextGroup: currentGroup,
    };
  }
  if (trimmed === "— stopped by user") {
    return {
      entry: { level: "warn", group: currentGroup, text: "Stopped by user" },
      nextGroup: currentGroup,
    };
  }

  // ── Warnings ────────────────────────────────────────────────────────────
  if (/^Warning:/i.test(trimmed)) {
    return {
      entry: {
        level: "warn",
        group: currentGroup,
        text: trimmed.replace(/^Warning:\s*/i, ""),
      },
      nextGroup: currentGroup,
    };
  }

  // ── Unknown — show verbatim ─────────────────────────────────────────────
  return {
    entry: { level: "info", group: currentGroup, text: trimmed },
    nextGroup: currentGroup,
  };
}
