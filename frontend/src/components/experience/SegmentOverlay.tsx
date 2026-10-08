import type { CorridorPoint, RouteSegment } from "../../types/route";
import { getRiskLabel } from "../../services/risk/riskEngine";

interface SegmentOverlayProps {
  points: CorridorPoint[];
  segments: RouteSegment[];
  startId: string | null;
  destinationId: string | null;
  selectedId: string | null;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (segment: RouteSegment) => void;
}

export function SegmentOverlay({ points, segments, startId, destinationId, selectedId, hoveredId, onHover, onSelect }: SegmentOverlayProps) {
  let startIndex = startId ? points.findIndex((point) => point.id === startId) : 0;
  let destinationIndex = destinationId ? points.findIndex((point) => point.id === destinationId) : points.length - 1;
  if (startIndex === -1) startIndex = 0;
  if (destinationIndex === -1) destinationIndex = points.length - 1;
  const low = Math.min(startIndex, destinationIndex);
  const high = Math.max(startIndex, destinationIndex);
  const visible = segments.filter((segment) => segment.index >= low + 1 && segment.index <= high);

  return (
    <div className="segment-overlay" aria-label="Interactive corridor segments">
      {visible.map((segment) => {
        const left = `${18 + ((segment.progressStart + segment.progressEnd) / 2) * 64}%`;
        const top = `${49 + Math.sin(segment.index * 1.4) * 9}%`;
        const active = selectedId === segment.id;
        return (
          <button
            key={segment.id}
            type="button"
            className={`segment-marker ${active ? "segment-marker--active" : ""} ${hoveredId === segment.id ? "segment-marker--hovered" : ""}`}
            style={{ left, top }}
            onMouseEnter={() => onHover(segment.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(segment.id)}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(segment)}
            aria-label={`Analyze segment ${segment.label}`}
          >
            <span className="marker-ring" aria-hidden="true" />
            <span className="marker-core" aria-hidden="true" />
            <span className="marker-label">SEG {String(segment.index).padStart(2, "0")}</span>
            {(hoveredId === segment.id || active) && (
              <span className="segment-tooltip">
                <span className="eyebrow">NH-7 / SEGMENT {String(segment.index).padStart(2, "0")}</span>
                <strong>{segment.from} → {segment.to}</strong>
                <span>{getRiskLabel(segment.risk)} · {segment.telemetry.state}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
