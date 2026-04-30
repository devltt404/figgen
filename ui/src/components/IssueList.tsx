import { CATEGORY_COLORS, SEVERITY_COLORS } from "../constants";
import type { DiffIssue } from "../types";

export function IssueList({ issues }: { issues: DiffIssue[] }) {
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
