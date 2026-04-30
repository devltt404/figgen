import { useLayoutEffect, useRef, type RefObject } from "react";
import type { LogEntry, LogLevel } from "../utils/logParser";

interface LogPanelProps {
  entries: LogEntry[];
  /** When true, the panel auto-scrolls as new entries arrive. */
  followEnabled: boolean;
  /** Called whenever the user scrolls the log. */
  onScroll: (atBottom: boolean) => void;
}

const ICONS: Record<LogLevel, string> = {
  info: "·",
  step: "◌",
  ok: "✓",
  warn: "!",
  error: "✗",
};

/**
 * Group consecutive entries with the same `group` value into sections so the
 * log reads as: Setup → Iteration 0 → Iteration 1 → Memory → Done.
 */
function groupEntries(
  entries: LogEntry[],
): { group: string; items: LogEntry[] }[] {
  const groups: { group: string; items: LogEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.group === e.group) last.items.push(e);
    else groups.push({ group: e.group, items: [e] });
  }
  return groups;
}

export function LogPanel({ entries, followEnabled, onScroll }: LogPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (followEnabled) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, followEnabled]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    onScroll(distanceFromBottom < 32);
  };

  const groups = groupEntries(entries);

  return (
    <aside className="log-panel">
      <div className="panel-title">Log</div>
      <div
        className="log-scroll"
        ref={scrollRef as RefObject<HTMLDivElement>}
        onScroll={handleScroll}
      >
        {entries.length === 0 && (
          <span className="log-empty">Waiting for run...</span>
        )}
        {groups.map((g, gi) => (
          <section key={`${gi}-${g.group}`} className="log-group">
            <header className="log-group-header">{g.group}</header>
            {g.items.map((entry, i) => (
              <div key={i} className={`log-line log-line--${entry.level}`}>
                <span className="log-icon" aria-hidden>
                  {ICONS[entry.level]}
                </span>
                <span className="log-text">{entry.text}</span>
              </div>
            ))}
          </section>
        ))}
        <div ref={endRef} />
      </div>
    </aside>
  );
}
