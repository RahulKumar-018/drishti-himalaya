import { InteractiveMap, InteractiveMapProps } from "../map/InteractiveMap";
import type { LocationPoint } from "../../types/location";
import type { RouteResult } from "../../services/routing/routeTypes";
import type { CorridorSegmentRisk } from "../../services/risk/segmentRiskService";

interface MapModeFallbackProps extends Omit<InteractiveMapProps, 'origin' | 'destination' | 'onSelectSegment' | 'segments'> {
  start?: { id: string; label: string; latitude: number; longitude: number } | null;
  destination?: { id: string; label: string; latitude: number; longitude: number } | null;
  originOverride?: LocationPoint | null;
  destinationOverride?: LocationPoint | null;
  selectedSegmentId?: string | null;
  onSelectSegment?: (segment: CorridorSegmentRisk | null) => void;
  segments?: CorridorSegmentRisk[];
  activeRoute?: RouteResult | null;
  mode?: string;
}

export function MapModeFallback({
  start,
  destination,
  selectedSegmentId,
  onSelectSegment,
  originOverride,
  destinationOverride,
  mode,
  segments,
  activeRoute,
  ...rest
}: MapModeFallbackProps) {
  const originPoint: LocationPoint | null = originOverride || (start
    ? {
        id: start.id,
        name: start.label,
        latitude: start.latitude,
        longitude: start.longitude,
        state: "Uttarakhand",
        category: "ROUTE_NODE",
        source: "curated",
      }
    : null);

  const destPoint: LocationPoint | null = destinationOverride || (destination
    ? {
        id: destination.id,
        name: destination.label,
        latitude: destination.latitude,
        longitude: destination.longitude,
        state: "Uttarakhand",
        category: "ROUTE_NODE",
        source: "curated",
      }
    : null);

  const handleSelectSegment = (segment: CorridorSegmentRisk | null) => {
    onSelectSegment?.(segment);
  };

  return (
    <div
      className="map-fallback-container"
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        inset: 0,
        zIndex: 1,
        overflow: "hidden",
      }}
      aria-label="2D Geographic GIS Map"
    >
      <InteractiveMap
        origin={originPoint}
        destination={destPoint}
        activeRoute={activeRoute}
        segments={segments}
        selectedSegmentId={selectedSegmentId}
        onSelectSegment={handleSelectSegment}
        showCorridorRoute={true}
        mode={mode}
        {...rest}
      />
    </div>
  );
}
