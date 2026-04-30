interface ImageCompareProps {
  figma: string | null;
  render: string | null;
  /** Label shown above the rendered pane (e.g. "Initial render"). */
  label: string;
}

export function ImageCompare({ figma, render, label }: ImageCompareProps) {
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
