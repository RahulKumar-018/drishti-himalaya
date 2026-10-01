/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - PILOT CORRIDOR CONSTANTS & SAMPLING CONFIGURATION
 * Authoritative geometric and spatial constants for the NH-7 Garhwal pilot sector.
 * ==============================================================================
 */

/**
 * NH-7 Pilot Corridor: Rishikesh → Joshimath
 * Representative progression along the Alaknanda canyon corridor.
 * Coordinates are formatted as [latitude, longitude] in WGS84 decimal degrees.
 *
 * IMPORTANT GEOMETRIC CLARIFICATION:
 * These 21 waypoints define the straight control-point polyline of the pilot corridor.
 * Straight chord distances between these control stations sum to exactly 155.04 km, whereas the
 * actual winding physical NH-7 road alignment exhibits a tortuosity factor of ~1.55 (~240 km).
 * This metric is calculated along the straight control-point polyline connecting pilot corridor
 * waypoints. It is not the gradient of the physical NH-7 road alignment.
 */
export const PILOT_CORRIDOR_COORDINATES: [number, number][] = [
  [30.0869, 78.2676], // Rishikesh (Origin)
  [30.1347, 78.3888], // Shivpuri
  [30.1082, 78.4905], // Byasi
  [30.0766, 78.5028], // Kaudiyala
  [30.1459, 78.5989], // Devprayag (Bhagirathi/Alaknanda confluence)
  [30.2291, 78.6948], // Maletha
  [30.2185, 78.7451], // Kirtinagar
  [30.2224, 78.7844], // Srinagar
  [30.2520, 78.9040], // Dhari Devi
  [30.2844, 78.9811], // Rudraprayag (Mandakini/Alaknanda confluence)
  [30.2890, 79.1550], // Gauchar
  [30.2573, 79.2157], // Karnaprayag (Pindar/Alaknanda confluence)
  [30.3010, 79.2780], // Langasu
  [30.3300, 79.3250], // Nandaprayag
  [30.4042, 79.3364], // Chamoli
  [30.4180, 79.3850], // Birahi
  [30.4289, 79.4299], // Pipalkoti
  [30.4720, 79.4580], // Pakhi
  [30.5050, 79.4890], // Gulabkoti
  [30.5280, 79.5080], // Helang
  [30.5564, 79.5663], // Joshimath (Destination)
];

export const RISHIKESH_COORDS: [number, number] = [30.0869, 78.2676];
export const JOSHIMATH_COORDS: [number, number] = [30.5564, 79.5663];
export const DEFAULT_CORRIDOR_CENTER: [number, number] = [30.32, 78.92];

/**
 * DEFAULT TERRAIN SAMPLING INTERVAL:
 * Target geodesic spacing between consecutive DEM query coordinates along the corridor.
 *
 * ENGINEERING JUSTIFICATION:
 * - 500 meters is an empirical engineering balance between spatial fidelity and API efficiency.
 * - Copernicus DEM (GLO-90) provides ~90m horizontal grid cells. Sampling at < 90m produces
 *   redundant queries within identical raster cells, resulting in flat-slope staircase artifacts.
 * - Sampling at > 1,000m risks bridging across deep Himalayan tributary gorges, underestimating
 *   localized route grades and relief extremes.
 * - At 500m spacing, the ~155 km chord corridor yields ~320 discrete sample points requiring
 *   4 API requests (100 coords/request), fitting comfortably within provider rate limits.
 * - This value is an MVP default and is fully configurable for localized sub-corridor deep dives.
 */
export const DEFAULT_SAMPLING_INTERVAL_METERS = 500;

/**
 * Open-Meteo Elevation API batch size limit.
 * Maximum allowable coordinates per GET request URL.
 */
export const OPEN_METEO_ELEVATION_BATCH_LIMIT = 100;
