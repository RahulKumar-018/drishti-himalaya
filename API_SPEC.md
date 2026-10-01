# DRISHTI-HIMALAYA - REST API SPECIFICATION (v1)

Base URL: `http://localhost:8000/api/v1`  
Interactive Swagger Documentation: `http://localhost:8000/docs`  
OpenAPI Specification JSON: `http://localhost:8000/openapi.json`

---

## 1. Endpoints Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/route/analyze` | Disaggregates road alternatives into 250m segments, evaluates multi-criteria hazard risk, and returns color-coded GeoJSON routes. |
| `GET` | `/hazard/segment/{segment_id}` | Retrieves full factor attribution and geotechnical advisory for an individual clicked road segment. |
| `GET` | `/weather/corridor-summary` | Provides current 24h/72h rainfall, active alerts, and antecedent moisture across corridor monitoring nodes. |
| `GET` | `/health` | System health check, runtime mode (`DEMO` vs `LIVE`), and dataset cache status. |

---

## 2. Detailed Endpoint Specifications

### 2.1 Analyze Route & Assess Hazard Exposure

- **Endpoint:** `POST /api/v1/route/analyze`
- **Description:** Takes origin and destination coordinates, queries routing geometry, segments the path into uniform 250m elements using Shapely, extracts geotechnical and weather parameters, calculates MCDA risk scores, and returns comparative alternatives.

#### Request Headers
```http
Content-Type: application/json
Accept: application/json
```

#### Request Body Schema (`AnalyzeRouteRequest`)
```json
{
  "origin": {
    "latitude": 30.1033,
    "longitude": 78.2947,
    "name": "Rishikesh"
  },
  "destination": {
    "latitude": 30.5526,
    "longitude": 79.5684,
    "name": "Joshimath"
  },
  "preference_weight_safety": 0.50,
  "simulated_rainfall_mm": null
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `origin.latitude` | Float | Yes | Origin latitude (must be within Uttarakhand: 28.7 to 31.5). |
| `origin.longitude` | Float | Yes | Origin longitude (must be within Uttarakhand: 77.5 to 81.1). |
| `origin.name` | String | No | Human-readable origin label (e.g. "Rishikesh"). |
| `destination.latitude` | Float | Yes | Destination latitude (28.7 to 31.5). |
| `destination.longitude`| Float | Yes | Destination longitude (77.5 to 81.1). |
| `destination.name` | String | No | Human-readable destination label (e.g. "Joshimath"). |
| `preference_weight_safety` | Float | No | $\beta$ parameter [0.0 - 1.0]. Default `0.50`. Higher values prioritize safety over travel time. |
| `simulated_rainfall_mm` | Float | No | Optional rainfall override [0.0 - 150.0] for dynamic stress testing. |

#### Successful Response (`200 OK`)
```json
{
  "status": "success",
  "query_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "execution_duration_ms": 342,
  "data_mode": "DEMO",
  "corridor": "NH-7 (Rishikesh - Joshimath)",
  "routes": [
    {
      "route_id": "primary_nh7",
      "summary": "Direct NH-7 (Via Devprayag, Rudraprayag, Pipalkoti)",
      "is_recommended": false,
      "total_distance_km": 156.4,
      "estimated_time_minutes": 310,
      "composite_route_risk": 68.4,
      "max_bottleneck_risk": 89.2,
      "average_segment_risk": 37.2,
      "high_risk_segment_count": 14,
      "severe_risk_segment_count": 5,
      "recommendation": "CAUTION_HIGH_RISK",
      "advisory_text": "High failure hazard along Alaknanda gorge between Chamoli and Pipalkoti.",
      "geojson": {
        "type": "FeatureCollection",
        "features": [
          {
            "type": "Feature",
            "id": "seg_nh7_042",
            "properties": {
              "segment_index": 42,
              "segment_length_m": 250.0,
              "start_km": 10.5,
              "end_km": 10.75,
              "slope_degrees": 44.2,
              "elevation_m": 1240.0,
              "precipitation_24h_mm": 68.5,
              "distance_to_historic_scar_m": 85.0,
              "scar_density_1km": 6.2,
              "is_cut_slope": true,
              "segment_risk_score": 89.2,
              "risk_category": "SEVERE",
              "color_hex": "#EF4444"
            },
            "geometry": {
              "type": "LineString",
              "coordinates": [
                [79.3124, 30.3951],
                [79.3142, 30.3962]
              ]
            }
          }
        ]
      }
    },
    {
      "route_id": "alt_crest_corridor",
      "summary": "Alternative Southern Ridge Alignment",
      "is_recommended": true,
      "total_distance_km": 178.2,
      "estimated_time_minutes": 355,
      "composite_route_risk": 32.1,
      "max_bottleneck_risk": 42.0,
      "average_segment_risk": 25.5,
      "high_risk_segment_count": 0,
      "severe_risk_segment_count": 0,
      "recommendation": "RECOMMENDED_SAFER_ROUTE",
      "advisory_text": "Route B is recommended: 45 minutes slower, but bypasses 14 active high-risk failure corridors.",
      "geojson": {
        "type": "FeatureCollection",
        "features": []
      }
    }
  ]
}
```

#### Error Responses
- `422 Unprocessable Entity`: Coordinates outside Uttarakhand bounding box or invalid parameters.
```json
{
  "detail": [
    {
      "loc": ["body", "origin", "latitude"],
      "msg": "Origin latitude 25.40 is outside the valid Uttarakhand bounding box (28.7 to 31.5).",
      "type": "value_error"
    }
  ]
}
```

---

### 2.2 Segment Detailed Drilldown

- **Endpoint:** `GET /api/v1/hazard/segment/{segment_id}`
- **Description:** Returns the explainability profile and factor attribution for a specific road segment.

#### Response (`200 OK`)
```json
{
  "segment_id": "seg_nh7_042",
  "corridor": "NH-7",
  "chainage_km": 10.5,
  "coordinates": {
    "latitude": 30.3956,
    "longitude": 79.3133
  },
  "overall_risk_score": 89.2,
  "risk_tier": "SEVERE",
  "color_hex": "#EF4444",
  "factor_attribution": {
    "slope": {
      "value_degrees": 44.2,
      "sub_score": 92.4,
      "weight": 0.35,
      "weighted_contribution": 32.34,
      "status": "CRITICAL",
      "description": "Steep cut-slope exceeding 35° natural angle of repose"
    },
    "rainfall": {
      "precipitation_24h_mm": 68.5,
      "precipitation_72h_mm": 112.0,
      "antecedent_rain_index": 145.2,
      "sub_score": 91.3,
      "weight": 0.30,
      "weighted_contribution": 27.39,
      "status": "CRITICAL",
      "description": "24h rainfall approaching 75 mm initiation threshold"
    },
    "proximity_to_scars": {
      "distance_meters": 85.0,
      "sub_score": 78.4,
      "weight": 0.20,
      "weighted_contribution": 15.68,
      "status": "HIGH",
      "description": "Within 85m of mapped 2017 debris failure"
    },
    "landslide_density": {
      "scars_per_sq_km": 6.2,
      "sub_score": 77.5,
      "weight": 0.10,
      "weighted_contribution": 7.75,
      "status": "HIGH",
      "description": "High failure clustering near tectonic thrust zone"
    },
    "cut_slope_exposure": {
      "is_exposed": true,
      "sub_score": 100.0,
      "weight": 0.05,
      "weighted_contribution": 5.0,
      "status": "HIGH",
      "description": "Active highway toe excavation zone"
    }
  },
  "geotechnical_advisory": "Elevated probability of planar debris sliding across roadway under continued rainfall. Maintenance crews on standby."
}
```

---

### 2.3 Regional Weather Corridor Summary

- **Endpoint:** `GET /api/v1/weather/corridor-summary?corridor=NH7`
- **Description:** Supplies current meteorological summary along highway monitoring nodes.

#### Response (`200 OK`)
```json
{
  "corridor": "NH-7 (Rishikesh to Joshimath)",
  "data_mode": "DEMO",
  "last_updated": "2026-10-01T10:30:00Z",
  "average_rainfall_24h_mm": 38.4,
  "max_rainfall_24h_mm": 68.5,
  "active_alert_level": "ORANGE",
  "monitoring_nodes": [
    {
      "node_name": "Rishikesh",
      "latitude": 30.1033,
      "longitude": 78.2947,
      "rain_24h_mm": 12.0,
      "status": "GREEN"
    },
    {
      "node_name": "Devprayag",
      "latitude": 30.1459,
      "longitude": 78.5986,
      "rain_24h_mm": 24.5,
      "status": "YELLOW"
    },
    {
      "node_name": "Rudraprayag",
      "latitude": 30.2858,
      "longitude": 78.9810,
      "rain_24h_mm": 52.0,
      "status": "ORANGE"
    },
    {
      "node_name": "Pipalkoti",
      "latitude": 30.4285,
      "longitude": 79.4290,
      "rain_24h_mm": 68.5,
      "status": "RED"
    },
    {
      "node_name": "Joshimath",
      "latitude": 30.5526,
      "longitude": 79.5684,
      "rain_24h_mm": 41.2,
      "status": "ORANGE"
    }
  ]
}
```

---

### 2.4 System Health Check

- **Endpoint:** `GET /api/v1/health`
- **Description:** Verifies service health, database connectivity, and loaded geospatial asset counts.

#### Response (`200 OK`)
```json
{
  "status": "healthy",
  "service": "Drishti-Himalaya API",
  "version": "1.0.0",
  "data_mode": "DEMO",
  "database": "connected (SQLite in-memory fallback)",
  "weather_api": "active (cached baseline)",
  "routing_engine": "active (deterministic NH-7 corridor)",
  "cached_landslide_scars": 11219,
  "corridor_length_km": 156.4
}
```
