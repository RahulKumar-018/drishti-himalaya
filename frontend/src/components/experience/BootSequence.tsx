interface BootSequenceProps {
  phase: string;
  ready: boolean;
}

export function BootSequence({ phase, ready }: BootSequenceProps) {
  if (ready) return null;
  return (
    <div className="boot-sequence" aria-live="polite">
      <div className="boot-mark">
        <span className="wordmark-notch" />
        <div>
          <span>DRISHTI</span>
          <strong>HIMALAYA</strong>
        </div>
      </div>
      <div className="boot-lines">
        <span className={phase === "terrain" ? "boot-line boot-line--active" : "boot-line"}>INITIALIZING TERRAIN</span>
        <span className={phase === "corridor" ? "boot-line boot-line--active" : "boot-line"}>LOADING CORRIDOR LAYER</span>
        <span className={phase === "telemetry" ? "boot-line boot-line--active" : "boot-line"}>CONNECTING ENVIRONMENTAL TELEMETRY</span>
        <span className={phase === "risk" ? "boot-line boot-line--active" : "boot-line"}>INITIALIZING RISK ENGINE</span>
      </div>
      <span className="boot-footer">FIELD INTERFACE / 01</span>
    </div>
  );
}
