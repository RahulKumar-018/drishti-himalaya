import { useState, useRef, useEffect, useCallback } from "react";
import {
  UTTARAKHAND_LOCATIONS,
  POPULAR_DESTINATION_IDS,
  POPULAR_ORIGIN_IDS,
} from "../../data/locations/uttarakhandLocations";
import { LocationPoint } from "../../types/location";
import { searchLocations } from "../../services/location/locationService";
import { Navigation, MapPin, Search, X, ArrowRight, Loader2, AlertCircle } from "lucide-react";

// ─── Primary quick chips visible on the selector (reducing typing for travelers) ─
const QUICK_ORIGINS = [
  "rishikesh",
  "dehradun",
  "haridwar",
  "mussoorie",
  "srinagar-garhwal",
  "rudraprayag",
] as const;

const QUICK_DESTINATIONS = [
  "badrinath",
  "kedarnath",
  "auli",
  "valley-of-flowers",
  "gangotri",
  "yamunotri",
  "chopta",
] as const;

// ─── Category display labels ──────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  PILGRIMAGE: "Char Dham & Pilgrimage",
  TOURIST: "Hill Stations & Nature",
  MOUNTAIN: "Adventure & High Altitude",
  CITY: "Major Cities & Gateways",
  TOWN: "Towns",
  DISTRICT_CENTER: "District Centers",
  ROUTE_NODE: "Corridor Transit Nodes",
};

interface RouteSelectorProps {
  startId: string;
  destinationId: string;
  onStartChange: (id: string) => void;
  onDestinationChange: (id: string) => void;
  onAnalyze: () => void;
  routeActive: boolean;
  isAnalyzing?: boolean;
  onUseMyLocation?: () => void;
  isLocating?: boolean;
  locationError?: string | null;
  validationError?: string | null;
}

// ─── Internal dropdown for location picking ───────────────────────────────────
function LocationDropdown({
  value,
  onChange,
  placeholder,
  label,
  popularIds,
  disabledId,
  onClose,
}: {
  value: LocationPoint | null;
  onChange: (loc: LocationPoint) => void;
  placeholder: string;
  label: string;
  popularIds: readonly string[];
  disabledId?: string | null;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const popular = popularIds
    .map((id) => UTTARAKHAND_LOCATIONS.find((l) => l.id === id))
    .filter(Boolean) as LocationPoint[];

  // Filter all locations by query using canonical search (name, alias, district, category)
  const filtered =
    query.trim().length > 0
      ? searchLocations(query, 16, UTTARAKHAND_LOCATIONS)
      : [];

  // Group filtered by category for display
  const groupedFiltered: Record<string, LocationPoint[]> = {};
  for (const loc of filtered) {
    const cat = loc.category || "Other";
    if (!groupedFiltered[cat]) groupedFiltered[cat] = [];
    groupedFiltered[cat].push(loc);
  }

  const renderChip = (loc: LocationPoint) => {
    const isDisabled = loc.id === disabledId;
    return (
      <button
        key={loc.id}
        type="button"
        className={`place-chip ${value?.id === loc.id ? "place-chip--active" : ""} ${isDisabled ? "place-chip--disabled" : ""}`}
        onClick={() => {
          if (!isDisabled) {
            onChange(loc);
            onClose();
          }
        }}
        disabled={isDisabled}
        title={isDisabled ? "Cannot be same as other location" : loc.description}
      >
        {loc.name}
      </button>
    );
  };

  const renderListItem = (loc: LocationPoint) => {
    const isDisabled = loc.id === disabledId;
    return (
      <button
        key={loc.id}
        type="button"
        className={`place-list-item ${value?.id === loc.id ? "place-list-item--active" : ""} ${isDisabled ? "place-list-item--disabled" : ""}`}
        onClick={() => {
          if (!isDisabled) {
            onChange(loc);
            onClose();
          }
        }}
        disabled={isDisabled}
      >
        <div className="place-list-main">
          <span className="place-list-name">{loc.name}</span>
          {loc.aliases && loc.aliases.length > 0 && (
            <span className="place-list-alias">{loc.aliases[0]}</span>
          )}
        </div>
        <span className="place-list-meta">
          {loc.district ? `${loc.district}` : ""}
          {loc.elevationM ? ` · ${loc.elevationM.toLocaleString()}m` : ""}
        </span>
      </button>
    );
  };

  return (
    <div className="location-dropdown" role="dialog" aria-label={`Select ${label}`}>
      <div className="location-dropdown-search">
        <Search size={13} className="location-search-icon" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="location-search-input"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {query && (
          <button
            type="button"
            className="location-search-clear"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="location-dropdown-body">
        {query.trim().length === 0 ? (
          <>
            <div className="location-dropdown-section">
              <span className="location-dropdown-label">Popular in Uttarakhand</span>
              <div className="place-chips">{popular.map(renderChip)}</div>
            </div>

            <div className="location-dropdown-section">
              <span className="location-dropdown-label">Char Dham & Pilgrimage</span>
              <div className="place-chips">
                {UTTARAKHAND_LOCATIONS.filter((l) => l.category === "PILGRIMAGE").map(renderChip)}
              </div>
            </div>

            <div className="location-dropdown-section">
              <span className="location-dropdown-label">Hill Stations & Adventure</span>
              <div className="place-chips">
                {UTTARAKHAND_LOCATIONS.filter(
                  (l) => l.category === "TOURIST" || l.category === "MOUNTAIN"
                ).map(renderChip)}
              </div>
            </div>

            <div className="location-dropdown-section">
              <span className="location-dropdown-label">Cities & Towns</span>
              <div className="place-chips">
                {UTTARAKHAND_LOCATIONS.filter(
                  (l) =>
                    l.category === "CITY" ||
                    l.category === "TOWN" ||
                    l.category === "DISTRICT_CENTER"
                ).map(renderChip)}
              </div>
            </div>
          </>
        ) : filtered.length === 0 ? (
          <div className="location-dropdown-empty">
            <MapPin size={14} />
            <span>No places found for "{query}"</span>
          </div>
        ) : (
          Object.entries(groupedFiltered).map(([cat, locs]) => (
            <div key={cat} className="location-dropdown-section">
              <span className="location-dropdown-label">
                {CATEGORY_LABELS[cat] || cat}
              </span>
              <div className="place-list">{locs.map(renderListItem)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main RouteSelector ───────────────────────────────────────────────────────
export function RouteSelector({
  startId,
  destinationId,
  onStartChange,
  onDestinationChange,
  onAnalyze,
  routeActive,
  isAnalyzing = false,
  onUseMyLocation,
  isLocating = false,
  locationError,
  validationError,
}: RouteSelectorProps) {
  const [originOpen, setOriginOpen] = useState(false);
  const [destOpen, setDestOpen] = useState(false);
  const originRef = useRef<HTMLDivElement>(null);
  const destRef = useRef<HTMLDivElement>(null);

  const originLoc = UTTARAKHAND_LOCATIONS.find((l) => l.id === startId) ?? null;
  const destLoc = UTTARAKHAND_LOCATIONS.find((l) => l.id === destinationId) ?? null;

  // Display names for GPS / custom IDs
  const getDisplayName = (id: string) => {
    const loc = UTTARAKHAND_LOCATIONS.find((l) => l.id === id);
    if (loc) return loc.name;
    if (id.startsWith("gps-") || id === "my-location") return "My Location";
    if (id) return id;
    return null;
  };

  const originDisplay = getDisplayName(startId);
  const destDisplay = getDisplayName(destinationId);

  const sameLocation =
    startId !== "" && destinationId !== "" && startId === destinationId;
  const valid =
    startId !== "" &&
    destinationId !== "" &&
    !sameLocation &&
    !isAnalyzing;

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        originRef.current &&
        !originRef.current.contains(e.target as Node)
      ) {
        setOriginOpen(false);
      }
      if (destRef.current && !destRef.current.contains(e.target as Node)) {
        setDestOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOriginOpen(false);
        setDestOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleOriginSelect = useCallback(
    (loc: LocationPoint) => {
      onStartChange(loc.id);
      setOriginOpen(false);
    },
    [onStartChange]
  );

  const handleDestSelect = useCallback(
    (loc: LocationPoint) => {
      onDestinationChange(loc.id);
      setDestOpen(false);
    },
    [onDestinationChange]
  );

  const myLocationLabel = isLocating
    ? "Detecting location..."
    : locationError
    ? "Location unavailable"
    : "📍 My Location";

  return (
    <section
      className={`route-selector ${routeActive ? "route-selector--active" : ""}`}
      aria-label="Plan your journey"
    >
      <div className="selector-label">
        <span className="eyebrow">PLAN YOUR JOURNEY</span>
        <span>
          {isAnalyzing
            ? "ANALYZING CORRIDOR..."
            : routeActive
            ? "CORRIDOR ACTIVE"
            : "CHOOSE YOUR ROUTE"}
        </span>
      </div>

      <div className="select-row">
        {/* ── ORIGIN ── */}
        <div className="select-field" ref={originRef}>
          <div className="field-topline">
            <span>START LOCATION</span>
            {onUseMyLocation && (
              <button
                type="button"
                className={`my-location-btn ${isLocating ? "my-location-btn--locating" : ""} ${locationError ? "my-location-btn--error" : ""}`}
                onClick={onUseMyLocation}
                disabled={isLocating || isAnalyzing}
                title={locationError ?? "Use browser GPS location"}
              >
                {isLocating ? (
                  <Loader2 size={11} className="spin-icon" />
                ) : locationError ? (
                  <AlertCircle size={11} />
                ) : (
                  <Navigation size={11} />
                )}
                {myLocationLabel}
              </button>
            )}
          </div>

          {/* Origin picker trigger */}
          <button
            type="button"
            className={`location-trigger ${originDisplay ? "location-trigger--set" : ""} ${originOpen ? "location-trigger--open" : ""}`}
            onClick={() => {
              setOriginOpen((o) => !o);
              setDestOpen(false);
            }}
            disabled={isAnalyzing}
            aria-expanded={originOpen}
            aria-haspopup="dialog"
          >
            <MapPin size={12} className="trigger-icon" />
            <span className="trigger-text">
              {originDisplay ?? "Choose starting point..."}
            </span>
            <span className="trigger-caret" aria-hidden="true">
              {originOpen ? "▲" : "▼"}
            </span>
          </button>

          {/* Compact context detail badge for selected origin */}
          {originLoc && (
            <div className="place-context-badge">
              <span>{originLoc.district ? `${originLoc.district} District` : originLoc.state}</span>
              {originLoc.elevationM && <span> · {originLoc.elevationM.toLocaleString()}m MSL</span>}
              <span> · {CATEGORY_LABELS[originLoc.category] || originLoc.category}</span>
            </div>
          )}

          {/* Quick Popular Origin Chips */}
          <div className="quick-chips-row" aria-label="Popular start points">
            {QUICK_ORIGINS.map((id) => {
              const loc = UTTARAKHAND_LOCATIONS.find((l) => l.id === id);
              if (!loc) return null;
              const isSelected = startId === loc.id;
              const isDisabled = destinationId === loc.id;
              return (
                <button
                  key={loc.id}
                  type="button"
                  className={`place-chip place-chip--sm ${isSelected ? "place-chip--active" : ""} ${isDisabled ? "place-chip--disabled" : ""}`}
                  onClick={() => {
                    if (!isDisabled) onStartChange(loc.id);
                  }}
                  disabled={isDisabled || isAnalyzing}
                  title={isDisabled ? "Cannot be same as destination" : loc.description}
                >
                  {loc.name}
                </button>
              );
            })}
            <button
              type="button"
              className="place-chip place-chip--sm place-chip--more"
              onClick={() => setOriginOpen(true)}
            >
              More...
            </button>
          </div>

          {originOpen && (
            <LocationDropdown
              value={originLoc}
              onChange={handleOriginSelect}
              placeholder="Search Uttarakhand start location..."
              label="start location"
              popularIds={POPULAR_ORIGIN_IDS}
              disabledId={destinationId || null}
              onClose={() => setOriginOpen(false)}
            />
          )}
        </div>

        <span className="select-arrow" aria-hidden="true">
          <ArrowRight size={16} />
        </span>

        {/* ── DESTINATION ── */}
        <div className="select-field" ref={destRef}>
          <div className="field-topline">
            <span>DESTINATION</span>
          </div>

          <button
            type="button"
            className={`location-trigger ${destDisplay ? "location-trigger--set" : ""} ${destOpen ? "location-trigger--open" : ""}`}
            onClick={() => {
              setDestOpen((o) => !o);
              setOriginOpen(false);
            }}
            disabled={isAnalyzing}
            aria-expanded={destOpen}
            aria-haspopup="dialog"
          >
            <MapPin size={12} className="trigger-icon" />
            <span className="trigger-text">
              {destDisplay ?? "Search Uttarakhand destination..."}
            </span>
            <span className="trigger-caret" aria-hidden="true">
              {destOpen ? "▲" : "▼"}
            </span>
          </button>

          {/* Compact context detail badge for selected destination */}
          {destLoc && (
            <div className="place-context-badge">
              <span>{destLoc.district ? `${destLoc.district} District` : destLoc.state}</span>
              {destLoc.elevationM && <span> · {destLoc.elevationM.toLocaleString()}m MSL</span>}
              <span> · {CATEGORY_LABELS[destLoc.category] || destLoc.category}</span>
            </div>
          )}

          {/* Quick Popular Destination Chips */}
          <div className="quick-chips-row" aria-label="Popular destinations">
            {QUICK_DESTINATIONS.map((id) => {
              const loc = UTTARAKHAND_LOCATIONS.find((l) => l.id === id);
              if (!loc) return null;
              const isSelected = destinationId === loc.id;
              const isDisabled = startId === loc.id;
              return (
                <button
                  key={loc.id}
                  type="button"
                  className={`place-chip place-chip--sm ${isSelected ? "place-chip--active" : ""} ${isDisabled ? "place-chip--disabled" : ""}`}
                  onClick={() => {
                    if (!isDisabled) onDestinationChange(loc.id);
                  }}
                  disabled={isDisabled || isAnalyzing}
                  title={isDisabled ? "Cannot be same as start" : loc.description}
                >
                  {loc.name}
                </button>
              );
            })}
            <button
              type="button"
              className="place-chip place-chip--sm place-chip--more"
              onClick={() => setDestOpen(true)}
            >
              More...
            </button>
          </div>

          {destOpen && (
            <LocationDropdown
              value={destLoc}
              onChange={handleDestSelect}
              placeholder="Search Uttarakhand destination (e.g. Badri, Auli)..."
              label="destination"
              popularIds={POPULAR_DESTINATION_IDS}
              disabledId={startId || null}
              onClose={() => setDestOpen(false)}
            />
          )}
        </div>

        <button
          type="button"
          className="analyze-button"
          onClick={onAnalyze}
          disabled={!valid}
          aria-label="Analyze route"
        >
          <span>
            {isAnalyzing
              ? "ANALYZING..."
              : routeActive
              ? "UPDATE ROUTE"
              : "ANALYZE ROUTE"}
          </span>
          <span aria-hidden="true">↗</span>
        </button>
      </div>

      {sameLocation && (
        <p className="selector-error" role="alert">
          Choose a different destination.
        </p>
      )}
      {validationError && !sameLocation && (
        <p className="selector-error" role="alert">
          {validationError}
        </p>
      )}
      {!sameLocation && !validationError && (
        <p className="selector-note">
          Authoritative multi-criteria risk model · Copernicus DEM 30m, GSI Landslide Inventory &amp; Open-Meteo.
        </p>
      )}
    </section>
  );
}
