import type { DiffIssue } from "./types";

export const CATEGORY_COLORS: Record<DiffIssue["category"], string> = {
  layout: "#3b82f6",
  color: "#8b5cf6",
  typography: "#ec4899",
  spacing: "#14b8a6",
  "missing-element": "#ef4444",
  "extra-element": "#f97316",
  other: "#6b7280",
};

export const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  moderate: "#f59e0b",
  minor: "#6b7280",
};
