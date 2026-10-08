import type { ExperienceMode } from "../../types/route";

interface ModeSelectorProps {
  value: ExperienceMode;
  onChange: (mode: ExperienceMode) => void;
  disabled?: boolean;
}

const modes: { id: ExperienceMode; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "route", label: "Route" },
  { id: "environment", label: "Environment" },
  { id: "terrain", label: "Terrain" },
  { id: "risk", label: "Risk" },
];

export function ModeSelector({ value, onChange, disabled = false }: ModeSelectorProps) {
  return (
    <nav className="mode-selector" aria-label="Visualization mode">
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={value === mode.id ? "mode-button mode-button--active" : "mode-button"}
          onClick={() => onChange(mode.id)}
          disabled={disabled}
          aria-pressed={value === mode.id}
        >
          <span>{mode.label}</span>
        </button>
      ))}
    </nav>
  );
}
