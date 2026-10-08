import type { DataState, EnvironmentalTelemetry } from "../../types/environment";

interface TelemetryStatusProps {
  telemetry: EnvironmentalTelemetry;
  compact?: boolean;
}

const stateCopy: Record<DataState, string> = {
  LIVE: "LIVE",
  CALCULATED: "CALCULATED",
  UNASSESSED: "UNASSESSED",
  "FUTURE/PLANNED": "FUTURE / PLANNED",
  STALE: "STALE",
  ERROR: "ERROR",
  UNAVAILABLE: "UNAVAILABLE",
  PARTIAL: "PARTIAL",
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
};

export function TelemetryStatus({ telemetry, compact = false }: TelemetryStatusProps) {
  return (
    <div className={`telemetry-status ${compact ? "telemetry-status--compact" : ""}`}>
      <span className={`status-dot status-dot--${telemetry.state.toLowerCase().replace("/", "-")}`} aria-hidden="true" />
      <span className="eyebrow">ENVIRONMENTAL TELEMETRY</span>
      <strong>{stateCopy[telemetry.state]}</strong>
      {!compact && <span className="telemetry-source">{telemetry.source}</span>}
    </div>
  );
}
