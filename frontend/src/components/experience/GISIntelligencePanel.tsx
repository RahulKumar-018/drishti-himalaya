import { LocationPoint } from '../../types/location';
import { RouteResult } from '../../services/routing/routeTypes';
import { RiskAssessment } from '../../services/risk/types';
import { EnvironmentalData } from '../../services/environmental/types';
import { CorridorSegmentRisk } from '../../services/risk/segmentRiskService';
import { formatTelemetryValue } from '../../services/environmental/telemetry';
import { formatCoordinates } from '../../services/location/locationService';
import { VisualTheme } from '../../types/route';
import { MonitoringTripApiResponse, TripAlertApiResponse } from '../../services/api/types';
import { 
  MapPin, 
  CloudRain, 
  Mountain, 
  Activity, 
  ArrowRight,
  RotateCcw,
  Layers,
  ChevronRight,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Flag,
  Radio,
  Loader2,
  X,
  CheckCircle2
} from 'lucide-react';
import './GISIntelligencePanel.css';

export interface InspectedHazardEntity {
  type: 'RISK_ZONE' | 'LANDSLIDE_SCAR' | 'HAZARD_STATION';
  id: string;
  name: string;
  riskTier?: string;
  riskScore?: number;
  district?: string;
  trigger?: string;
  mechanism?: string;
  material?: string;
  area?: number;
  factors?: {
    rainfall?: number;
    slope?: number;
    terrain?: number;
    historical?: number;
  };
  disclaimer?: string;
  source?: string;
}

export interface GISIntelligencePanelProps {
  origin: LocationPoint | null;
  destination: LocationPoint | null;
  activeRoute: RouteResult | null;
  riskAssessment: RiskAssessment | null;
  envData: EnvironmentalData | null;
  segments: CorridorSegmentRisk[];
  selectedSegment: CorridorSegmentRisk | null;
  onSelectSegment: (segment: CorridorSegmentRisk | null) => void;
  theme?: VisualTheme;
  // Phase 2 New Props for Location & Hazard Inspection
  selectedLocation?: LocationPoint | null;
  onClearSelectedLocation?: () => void;
  onSetOrigin?: (loc: LocationPoint) => void;
  onSetDestination?: (loc: LocationPoint) => void;
  inspectedHazard?: InspectedHazardEntity | null;
  onClearInspectedHazard?: () => void;
  isRouting?: boolean;
  routingError?: string | null;
  lastUpdated?: string | null;
  monitoringTrip?: MonitoringTripApiResponse | null;
  monitoringAlerts?: TripAlertApiResponse[];
  isMonitoringBusy?: boolean;
  monitoringError?: string | null;
  onStartMonitoring?: () => void;
  onUpdateMonitoringStatus?: (status: 'ACTIVE' | 'PAUSED' | 'COMPLETED') => void;
}

export function GISIntelligencePanel({
  origin,
  destination,
  activeRoute,
  riskAssessment,
  envData,
  segments,
  selectedSegment,
  onSelectSegment,
  theme = 'dark',
  selectedLocation,
  onClearSelectedLocation,
  onSetOrigin,
  onSetDestination,
  inspectedHazard,
  onClearInspectedHazard,
  isRouting = false,
  routingError,
  lastUpdated,
  monitoringTrip,
  monitoringAlerts = [],
  isMonitoringBusy = false,
  monitoringError,
  onStartMonitoring,
  onUpdateMonitoringStatus,
}: GISIntelligencePanelProps) {
  const compositeScore = riskAssessment?.score ?? null;
  const compositeTier = riskAssessment?.level ?? (riskAssessment ? 'INDETERMINATE' : 'UNASSESSED');
  const riskColor = riskAssessment?.colorHex ?? '#71717a';

  const totalDistanceKm = activeRoute?.metrics?.totalDistanceKm ?? null;
  const livePrecipMm = envData?.rainfall?.precipitation ?? null;
  const liveProbPercent = envData?.rainfall?.precipitationProbability ?? null;
  const elevationM = envData?.terrain?.elevation?.elevation ?? null;
  const telemetryLabel = !envData
    ? 'UNAVAILABLE'
    : envData.status === 'partial'
    ? 'PARTIAL TELEMETRY'
    : 'LIVE TELEMETRY';

  return (
    <aside 
      className={`gis-intelligence-panel ${theme === 'bright' ? 'gis-intelligence-panel--bright' : ''}`}
      aria-label="Risk Intelligence and Corridor Analysis"
      onWheel={(e) => e.stopPropagation()}
    >
      {/* ─── 1. SELECTED LOCATION INFORMATION CARD (NON-OBSTRUCTIVE) ─── */}
      {selectedLocation && (
        <div className="gis-intel-section gis-selected-location-card" role="region" aria-label="Inspected Location">
          <div className="gis-location-card-header">
            <div className="gis-location-card-title-group">
              <span className="gis-location-pill">INSPECTED WAYPOINT</span>
              <h3 className="gis-location-card-title">{selectedLocation.name}</h3>
              <span className="gis-location-card-sub">
                {selectedLocation.district ? `${selectedLocation.district} District · ` : ''}
                {selectedLocation.state || 'Uttarakhand'}
              </span>
            </div>
            <button
              type="button"
              className="gis-location-close-btn"
              onClick={onClearSelectedLocation}
              title="Close location details"
              aria-label="Close location details"
            >
              <X size={14} />
            </button>
          </div>

          <div className="gis-location-meta-grid">
            <div className="gis-location-meta-item">
              <span className="gis-meta-k">COORDINATES</span>
              <span className="gis-meta-v font-mono">
                {formatCoordinates(selectedLocation.latitude, selectedLocation.longitude)}
              </span>
            </div>
            <div className="gis-location-meta-item">
              <span className="gis-meta-k">ELEVATION</span>
              <span className="gis-meta-v font-mono">
                {selectedLocation.elevationM ? `~${selectedLocation.elevationM} m MSL` : 'Copernicus 90m'}
              </span>
            </div>
            <div className="gis-location-meta-item">
              <span className="gis-meta-k">CATEGORY</span>
              <span className="gis-meta-v">
                {selectedLocation.category || 'Transit Node'}
              </span>
            </div>
            <div className="gis-location-meta-item">
              <span className="gis-meta-k">LOCAL HAZARD STATUS</span>
              <span className="gis-meta-v" style={{ color: 'var(--ochre)' }}>
                Monitored Sector
              </span>
            </div>
          </div>

          {selectedLocation.description && (
            <p className="gis-location-desc">{selectedLocation.description}</p>
          )}

          {/* Contextual Action Buttons */}
          {(onSetOrigin || onSetDestination) && (
            <div className="gis-location-actions">
              {onSetOrigin && (
                <button
                  type="button"
                  className="gis-action-btn gis-action-btn--origin"
                  onClick={() => onSetOrigin(selectedLocation)}
                >
                  <MapPin size={11} />
                  <span>Set as Origin</span>
                </button>
              )}
              {onSetDestination && (
                <button
                  type="button"
                  className="gis-action-btn gis-action-btn--dest"
                  onClick={() => onSetDestination(selectedLocation)}
                >
                  <Flag size={11} />
                  <span>Set as Destination</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── 2. INSPECTED HAZARD ENTITY (ZONE OR GSI SCAR) ─── */}
      {inspectedHazard && (
        <div className="gis-intel-section gis-hazard-entity-card" role="region" aria-label="Inspected Hazard Detail">
          <div className="gis-hazard-card-head">
            <div className="gis-hazard-badge-row">
              <span className="gis-hazard-pill">
                <ShieldAlert size={11} /> {inspectedHazard.type.replace('_', ' ')}
              </span>
              {inspectedHazard.riskTier && (
                <span className="gis-hazard-tier-badge">
                  {inspectedHazard.riskTier} TIER
                </span>
              )}
            </div>
            <button
              type="button"
              className="gis-location-close-btn"
              onClick={onClearInspectedHazard}
              title="Dismiss hazard inspection"
            >
              <X size={14} />
            </button>
          </div>

          <h4 className="gis-hazard-title">{inspectedHazard.name}</h4>
          {inspectedHazard.district && (
            <span className="gis-hazard-district">{inspectedHazard.district} Sector</span>
          )}

          <div className="gis-hazard-grid">
            {inspectedHazard.riskScore != null && (
              <div className="gis-hazard-item">
                <span className="gis-meta-k">MCDA Risk Score</span>
                <span className="gis-meta-v font-mono">{inspectedHazard.riskScore.toFixed(1)} / 100</span>
              </div>
            )}
            {inspectedHazard.trigger && (
              <div className="gis-hazard-item">
                <span className="gis-meta-k">Trigger Mechanism</span>
                <span className="gis-meta-v">{inspectedHazard.trigger}</span>
              </div>
            )}
            {inspectedHazard.mechanism && (
              <div className="gis-hazard-item">
                <span className="gis-meta-k">Failure Mode</span>
                <span className="gis-meta-v">{inspectedHazard.mechanism}</span>
              </div>
            )}
            {inspectedHazard.area && (
              <div className="gis-hazard-item">
                <span className="gis-meta-k">Affected Footprint</span>
                <span className="gis-meta-v font-mono">{inspectedHazard.area.toLocaleString()} m²</span>
              </div>
            )}
          </div>

          <div className="gis-hazard-advisory">
            <span className="gis-advisory-label">RECOMMENDED ACTION</span>
            <p>
              Exercise high travel vigilance. Avoid night transit through active gorge sectors during monsoon saturations. Adhere to official SDRF/IMD advisories.
            </p>
          </div>

          <div className="gis-hazard-provenance">
            <span>Data Status: <strong>{inspectedHazard.source || 'Derived Decision Support'}</strong></span>
          </div>
        </div>
      )}

      {/* ─── 3. ROUTE SUMMARY & SAFETY SCORE HEADER ─── */}
      <div className="gis-intel-section gis-intel-header">
        <div className="gis-intel-eyebrow">
          <span className="eyebrow">CORRIDOR INTELLIGENCE</span>
          <span className="gis-live-badge">
            <span className="gis-live-dot" /> {telemetryLabel}
          </span>
        </div>

        <div className="gis-route-span">
          <div className="gis-route-point">
            <MapPin size={12} className="gis-point-icon gis-point-icon--origin" />
            <span className="gis-point-name">{origin?.name ?? 'Rishikesh'}</span>
            {origin?.district && (
              <span className="gis-point-sub">{origin.district}</span>
            )}
          </div>
          <ArrowRight size={14} className="gis-route-arrow" />
          <div className="gis-route-point">
            <MapPin size={12} className="gis-point-icon gis-point-icon--dest" />
            <span className="gis-point-name">{destination?.name ?? 'Badrinath'}</span>
            {destination?.district && (
              <span className="gis-point-sub">{destination.district}</span>
            )}
          </div>
        </div>

        {/* Route Status Messages: Loading, Error, or Active Route Metrics */}
        {isRouting ? (
          <div className="gis-routing-status-box gis-routing-status-box--loading">
            <Loader2 size={12} className="animate-spin" />
            <span>Calculating mountain road alignment via OSRM &amp; evaluating slope gradients...</span>
          </div>
        ) : routingError ? (
          <div className="gis-routing-status-box gis-routing-status-box--error">
            <AlertTriangle size={12} />
            <span>{routingError}</span>
          </div>
        ) : (
          <div className="gis-route-meta">
            <span>DISTANCE: <strong>{totalDistanceKm != null ? `~${totalDistanceKm.toFixed(1)} km` : '—'}</strong></span>
            <span className="gis-meta-divider">·</span>
            <span>DURATION: <strong>{activeRoute?.metrics?.formattedDuration ?? '—'}</strong></span>
            <span className="gis-meta-divider">·</span>
            <span>CORRIDOR: <strong>NH-7 ARTERIAL</strong></span>
          </div>
        )}

        {/* Authoritative Route Safety Score (Drishti Safety Score) */}
        {activeRoute?.routeRisk && (
          <div className="gis-route-safety-badge-box">
            <div className="gis-safety-row">
              <span className="gis-safety-label">ROUTE SAFETY SCORE</span>
              <span className="gis-safety-score">
                {activeRoute.routeRisk.safetyScore != null ? `${activeRoute.routeRisk.safetyScore} / 100` : 'Evaluated'}
              </span>
            </div>
            <div className="gis-safety-tier-pill">
              <span>{activeRoute.routeRisk.riskTier} RISK EXPOSURE</span>
            </div>
            <p className="gis-safety-disclaimer">{activeRoute.routeRisk.disclaimer}</p>
          </div>
        )}

        <div className="gis-route-safety-badge-box" aria-label="Trip monitoring">
          <div className="gis-safety-row">
            <span className="gis-safety-label">TRIP MONITORING</span>
            <span className="gis-safety-score">
              {monitoringTrip ? monitoringTrip.status : 'NOT ACTIVE'}
            </span>
          </div>
          {monitoringTrip ? (
            <>
              <p className="gis-safety-disclaimer">
                {monitoringTrip.origin.name || 'Origin'} → {monitoringTrip.destination.name || 'Destination'} · {monitoringAlerts.length} alert{monitoringAlerts.length === 1 ? '' : 's'}
              </p>
              <div className="gis-location-actions">
                {monitoringTrip.status === 'ACTIVE' && onUpdateMonitoringStatus && (
                  <button type="button" className="gis-action-btn" onClick={() => onUpdateMonitoringStatus('PAUSED')} disabled={isMonitoringBusy}>
                    <Clock size={11} /> Pause monitoring
                  </button>
                )}
                {monitoringTrip.status === 'PAUSED' && onUpdateMonitoringStatus && (
                  <button type="button" className="gis-action-btn" onClick={() => onUpdateMonitoringStatus('ACTIVE')} disabled={isMonitoringBusy}>
                    <Radio size={11} /> Resume monitoring
                  </button>
                )}
                {(monitoringTrip.status === 'ACTIVE' || monitoringTrip.status === 'PAUSED') && onUpdateMonitoringStatus && (
                  <button type="button" className="gis-action-btn" onClick={() => onUpdateMonitoringStatus('COMPLETED')} disabled={isMonitoringBusy}>
                    <CheckCircle2 size={11} /> Complete trip
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="gis-safety-disclaimer">Analyze a route to monitor changing risk and receive actionable alerts.</p>
              {onStartMonitoring && (
                <button type="button" className="gis-action-btn gis-action-btn--origin" onClick={onStartMonitoring} disabled={!activeRoute || isMonitoringBusy}>
                  {isMonitoringBusy ? <Loader2 size={11} className="animate-spin" /> : <Radio size={11} />}
                  {isMonitoringBusy ? 'Starting monitoring...' : 'Start trip monitoring'}
                </button>
              )}
            </>
          )}
          {monitoringError && <p className="gis-routing-status-box gis-routing-status-box--error">{monitoringError}</p>}
        </div>
      </div>

      {/* ─── 4. AUTHORITATIVE COMPOSITE RISK ─── */}
      <div className="gis-intel-section">
        <div className="gis-section-head">
          <span className="eyebrow">COMPOSITE RISK ENGINE</span>
          <span className="gis-model-tag">MCDA DECISION SUPPORT</span>
        </div>

        <div className="gis-risk-hero">
          <div className="gis-risk-score-box">
            <span className="gis-risk-number" style={{ color: riskColor }}>
              {typeof compositeScore === 'number' ? compositeScore.toFixed(1) : '—'}
            </span>
            <span className="gis-risk-scale">/ 100</span>
          </div>

          <div className="gis-risk-tier-box">
            <div className="gis-tier-pill" style={{ borderColor: riskColor, color: riskColor }}>
              <span className="gis-tier-dot" style={{ backgroundColor: riskColor }} />
              <strong>{compositeTier} TIER</strong>
            </div>
            <p className="gis-risk-subtext">
              Multi-criteria geotechnical &amp; meteorological exposure index across the corridor.
            </p>
          </div>
        </div>

        {/* MCDA Factor Contributors */}
        <div className="gis-contributors">
          <span className="gis-subhead">METHODOLOGY CONTRIBUTORS</span>
          <div className="gis-contrib-list">
            <div className="gis-contrib-row">
              <span className="gis-contrib-name">Slope Gradient (Copernicus DEM 30m)</span>
              <div className="gis-contrib-val">
                <span className="gis-contrib-pct">35%</span>
                <div className="gis-contrib-bar">
                  <div className="gis-contrib-fill" style={{ width: '35%', backgroundColor: 'var(--ochre)' }} />
                </div>
              </div>
            </div>

            <div className="gis-contrib-row">
              <span className="gis-contrib-name">24h Precipitation (Open-Meteo)</span>
              <div className="gis-contrib-val">
                <span className="gis-contrib-pct">30%</span>
                <div className="gis-contrib-bar">
                  <div className="gis-contrib-fill" style={{ width: '30%', backgroundColor: '#64b7d8' }} />
                </div>
              </div>
            </div>

            <div className="gis-contrib-row">
              <span className="gis-contrib-name">Historical Landslide Proximity (GSI)</span>
              <div className="gis-contrib-val">
                <span className="gis-contrib-pct">20%</span>
                <div className="gis-contrib-bar">
                  <div className="gis-contrib-fill" style={{ width: '20%', backgroundColor: '#e5675f' }} />
                </div>
              </div>
            </div>

            <div className="gis-contrib-row">
              <span className="gis-contrib-name">Landslide Scar Density</span>
              <div className="gis-contrib-val">
                <span className="gis-contrib-pct">10%</span>
                <div className="gis-contrib-bar">
                  <div className="gis-contrib-fill" style={{ width: '10%', backgroundColor: '#eab308' }} />
                </div>
              </div>
            </div>

            <div className="gis-contrib-row">
              <span className="gis-contrib-name">Engineered Road Cut-Slope (OSM)</span>
              <div className="gis-contrib-val">
                <span className="gis-contrib-pct">5%</span>
                <div className="gis-contrib-bar">
                  <div className="gis-contrib-fill" style={{ width: '5%', backgroundColor: '#53b99b' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 5. HYDRO-METEOROLOGICAL TELEMETRY ─── */}
      <div className="gis-intel-section">
        <div className="gis-section-head">
          <span className="eyebrow">ENVIRONMENTAL TELEMETRY</span>
          <span className="gis-source-tag">Copernicus + Open-Meteo</span>
        </div>

        <div className="gis-telemetry-grid">
          <div className="gis-telemetry-card">
            <span className="gis-telemetry-label">
              <CloudRain size={11} /> 24H PRECIPITATION
            </span>
            <strong className="gis-telemetry-value">
              {formatTelemetryValue(livePrecipMm, ' mm')}
            </strong>
          </div>

          <div className="gis-telemetry-card">
            <span className="gis-telemetry-label">
              <Activity size={11} /> RAIN PROBABILITY
            </span>
            <strong className="gis-telemetry-value">
              {formatTelemetryValue(liveProbPercent, '%')}
            </strong>
          </div>

          <div className="gis-telemetry-card">
            <span className="gis-telemetry-label">
              <Mountain size={11} /> CORRIDOR ELEVATION
            </span>
            <strong className="gis-telemetry-value">
              {elevationM != null ? `~${Math.round(elevationM)} m` : '—'}
            </strong>
          </div>

          <div className="gis-telemetry-card">
            <span className="gis-telemetry-label">
              <Layers size={11} /> GSI SCAR CATALOG
            </span>
            <strong className="gis-telemetry-value">
              5,206 scars
            </strong>
          </div>
        </div>

        {/* Freshness & Provenance */}
        <div className="gis-freshness-row">
          <div className="gis-freshness-item">
            <Clock size={10} />
            <span>Open-Meteo: {lastUpdated ? 'Live Synced' : 'Active'}</span>
          </div>
          <div className="gis-freshness-item">
            <CheckCircle2 size={10} />
            <span>Copernicus DEM: 90m Active</span>
          </div>
        </div>
      </div>

      {/* ─── 6. SELECTED SEGMENT DRILLDOWN (IF ACTIVE) ─── */}
      {selectedSegment && (
        <div className="gis-intel-section gis-selected-segment-box">
          <div className="gis-section-head">
            <span className="eyebrow" style={{ color: 'var(--ochre)' }}>
              INSPECTING SEGMENT {String(selectedSegment.index).padStart(2, '0')}
            </span>
            <button
              type="button"
              className="gis-clear-btn"
              onClick={() => onSelectSegment(null)}
              aria-label="Clear segment selection"
            >
              <RotateCcw size={10} /> VIEW ALL
            </button>
          </div>

          <div className="gis-segment-detail-header">
            <h4>{selectedSegment.name}</h4>
            <span 
              className="gis-tier-pill gis-tier-pill--sm"
              style={{ 
                color: selectedSegment.colorHex, 
                borderColor: selectedSegment.colorHex 
              }}
            >
              {selectedSegment.riskTier} ({typeof selectedSegment.riskScore === 'number' ? selectedSegment.riskScore.toFixed(1) : '—'}/100)
            </span>
          </div>

          <div className="gis-segment-stats">
            <div>
              <span>SPAN DISTANCE</span>
              <strong>~{typeof selectedSegment.distanceKm === 'number' ? selectedSegment.distanceKm.toFixed(1) : '—'} km</strong>
            </div>
            <div>
              <span>GRADIENT</span>
              <strong>{typeof selectedSegment.gradientDegrees === 'number' ? `${selectedSegment.gradientDegrees.toFixed(1)}°` : '—'}</strong>
            </div>
            <div>
              <span>ELEVATION SPAN</span>
              <strong>{selectedSegment.startElevationM}m → {selectedSegment.endElevationM}m</strong>
            </div>
            <div>
              <span>PRIMARY DRIVER</span>
              <strong style={{ color: 'var(--ochre)' }}>{selectedSegment.primaryDriver}</strong>
            </div>
          </div>

          <div className="gis-advisory-box">
            <span className="gis-advisory-title">GEOTECHNICAL ADVISORY</span>
            <p>{selectedSegment.riskAssessment?.summaryExplanation || selectedSegment.disclaimer}</p>
          </div>
        </div>
      )}

      {/* ─── 7. INTERACTIVE SEGMENT LIST (SYNCHRONIZED WITH MAP) ─── */}
      <div className="gis-intel-section gis-segments-list-section">
        <div className="gis-section-head">
          <span className="eyebrow">CORRIDOR SPANS ({segments.length} SEGMENTS)</span>
          <span className="gis-hint-tag">Click to focus on map</span>
        </div>

        <div className="gis-segments-list">
          {segments.map((seg) => {
            const isSelected = selectedSegment?.id === seg.id;
            return (
              <button
                key={seg.id}
                type="button"
                className={`gis-segment-row ${isSelected ? 'gis-segment-row--active' : ''}`}
                onClick={() => onSelectSegment(isSelected ? null : seg)}
                aria-pressed={isSelected}
              >
                <div className="gis-segment-row-left">
                  <span className="gis-seg-id">{String(seg.index).padStart(2, '0')}</span>
                  <div className="gis-seg-names">
                    <span className="gis-seg-title">{seg.name}</span>
                    <span className="gis-seg-elev">
                      {seg.startElevationM}m – {seg.endElevationM}m · {typeof seg.gradientDegrees === 'number' ? `${seg.gradientDegrees.toFixed(1)}°` : ''}
                    </span>
                  </div>
                </div>

                <div className="gis-segment-row-right">
                  <span
                    className="gis-seg-score"
                    style={{ color: seg.colorHex }}
                  >
                    {typeof seg.riskScore === 'number' ? seg.riskScore.toFixed(0) : '—'}
                  </span>
                  <span
                    className="gis-seg-dot"
                    style={{ backgroundColor: seg.colorHex }}
                  />
                  <ChevronRight size={12} className="gis-seg-arrow" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
