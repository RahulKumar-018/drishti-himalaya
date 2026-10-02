# DRISHTI-HIMALAYA - DATASET PROVENANCE & GEOSPATIAL SOURCES

This document details the provenance, transformation lineage, and spatial coordinate reference systems (CRS) of historical landslide inventories utilized by the Drishti-Himalaya platform.

---

## 1. Operational Source: Geological Survey of India (GSI)

* **Dataset Title:** National Landslide Susceptibility Mapping (NLSM) Inventory
* **Source Organization:** Geological Survey of India (GSI), Ministry of Mines, Government of India
* **Raw File Path:** `data/raw/GSI_Landslide_Inventory.geojson`
* **Raw File Size:** 51.57 MB (54,069,955 bytes)
* **Total Raw Features:** 30,842 historical landslide failure locations across India
* **Geometry Type:** 100% `Point` (0 non-point, 0 null geometries)
* **Native Coordinate System:** WGS84 (`EPSG:4326`, `urn:ogc:def:crs:OGC::CRS84`), Axis Order: `[longitude, latitude]`
* **State Identification Field:** `STATE` (case-insensitive string matching `"UTTARAKHAND"`)

### Processed Statewide Dataset:
* **Processed File Path:** `data/processed/landslide_inventory_uttarakhand.geojson`
* **Processed File Size:** ~13.34 MB
* **Total Processed Features:** **5,206** mapped landslide failure records in Uttarakhand
* **Geographic Extent:**
  * Latitude: `29.135° N` to `31.130° N`
  * Longitude: `76.998° E` to `80.730° E`
* **Key Preserved Attributes:**
  * `OBJECTID`: Unique GSI feature identifier
  * `SLIDE_NO`: Official GSI slide code (e.g. `UK/UTT/53J09/2015/924`)
  * `DISTRICT`: District administration unit (e.g. Rudraprayag, Chamoli, Uttarkashi, Tehri Garhwal, Bageshwar, Pithoragarh, etc.)
  * `TRIGGERING`: Primary initiation trigger (e.g. `Rainfall`, `Cloudburst`, `Cut slope`)
  * `MOVEMENT_TYPE`: Kinematic failure classification (e.g. `Debris_Slide`, `Rock_Fall`, `Composite`, `Rotational`)
  * `MATERIAL_TYPE`: Material composition (e.g. `Debris`, `Rock`, `Earth`)
  * `FAILURE_MECHANISM`: Mechanical deformation mode (e.g. `Shallow translational failure`, `Planar sliding`)
  * `GEOLOGY` & `GEOMORPHOLOGY`: Lithological and landform terrain context
  * `source_dataset`: Explicit source provenance tag set to `"GSI"`

---

## 2. Metric Projection & Spatial Analysis CRS

* **Input CRS:** `EPSG:4326` (WGS84 2D, coordinates in decimal degrees)
* **Projected Metric CRS:** `EPSG:32644` (UTM Zone 44N, WGS84 ellipsoid)
* **Parameters:**
  * Central Meridian: $81.0^\circ\text{ E}$
  * Scale Factor ($k_0$): $0.9996$
  * False Easting ($E_0$): $500,000.0\text{ m}$
  * False Northing ($N_0$): $0.0\text{ m}$
* **Scientific Rationale:**
  The state of Uttarakhand spans between $77.5^\circ\text{ E}$ and $81.1^\circ\text{ E}$ longitude and $28.7^\circ\text{ N}$ to $31.5^\circ\text{ N}$ latitude (with actual GSI landslide records extending to $77.0^\circ\text{ E}$).
  Conformal transverse mercator projection in UTM Zone 44N maintains linear scale distortion bounded within $\le 0.15\%$ statewide ($0.007\%$ in central Uttarakhand, $0.040\%$ at the central meridian, $0.101\%$ at the western configured boundary, and $0.141\%$ at the extreme western catalog boundary).
  This guarantees that spatial Euclidean distance queries ($d_{\min}$ in meters) and 1,000-meter radius density counts ($N_{\text{scars}}$) executed by the `scipy.spatial.KDTree` remain accurate to within $\le 1.4\text{ meters}$ per kilometer across the entire state, ensuring negligible impact on nearest-scar decay ($< 0.05$ score points) and 1 km clustering.

---

## 3. Future Source: National Remote Sensing Centre (NRSC / ISRO)

* **Dataset Title:** Landslide Atlas of India
* **Source Organization:** National Remote Sensing Centre (NRSC), Indian Space Research Organisation (ISRO)
* **Current Status:** **Not present in the repository.** No synthetic or fabricated records have been created.
* **Architectural Readiness:**
  The geospatial layer implements an extensible multi-source adapter pattern:
  * [BaseLandslideLoader](file:///c:/Users/kesha/Projects/drishti-himalaya/backend/app/geospatial/loaders.py) defines the universal loader interface.
  * [NRSCLoader](file:///c:/Users/kesha/Projects/drishti-himalaya/backend/app/geospatial/loaders.py) is pre-configured to ingest `data/raw/NRSC_Landslide_Inventory.geojson` (or shapefile/CSV formats) once the real dataset is added.
  * [LandslideInventoryService](file:///c:/Users/kesha/Projects/drishti-himalaya/backend/app/geospatial/service.py) automatically detects and merges NRSC records if present, or operates in 100% GSI mode when absent.
  * Downstream KDTree queries, the MCDA risk engine, API schemas, and routing layers are completely decoupled from source-specific formats.

---

## 4. Topographic Elevation & Slope Source: Copernicus DEM GLO-30

* **Dataset Title:** Copernicus Digital Elevation Model (DEM) GLO-30
* **Product Identifier:** `COP-DEM_GLO-30` (30m global coverage)
* **Source Organization:** European Space Agency (ESA) & Airbus Defence and Space
* **Source URL / Access Portal:** Copernicus Data Space Ecosystem (https://dataspace.copernicus.eu/) / OpenTopography / AWS Registry of Open Data (`copernicus-dem-30m`)
* **Horizontal Coordinate Reference System:** WGS84 2D (`EPSG:4326`, Geographic Lat/Lon in decimal degrees)
* **Vertical Coordinate Reference System / Datum:** Earth Gravitational Model 2008 (EGM2008) geoid
* **Spatial Resolution:** 1.0 arc-second (~30 meters at the equator)
* **Storage Directory:** `data/raw/dem/copernicus_glo30/`
* **Licensing & Attribution:**
  * Free and open access under the Copernicus DEM Policy.
  * Attribution notice: *"© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018. Provided by European Space Agency (ESA) under the Copernicus Programme."*
* **Uttarakhand Study Area Tile Grid:**
  * Latitude Span: `28.7° N` to `31.5° N`
  * Longitude Span: `77.5° E` to `81.1° E`
  * Complete statewide coverage requires 12 1°×1° GeoTIFF tiles:
    1. `Copernicus_DSM_COG_10_N28_00_E077_00_DEM.tif`
    2. `Copernicus_DSM_COG_10_N28_00_E078_00_DEM.tif`
    3. `Copernicus_DSM_COG_10_N28_00_E079_00_DEM.tif`
    4. `Copernicus_DSM_COG_10_N28_00_E080_00_DEM.tif`
    5. `Copernicus_DSM_COG_10_N29_00_E077_00_DEM.tif`
    6. `Copernicus_DSM_COG_10_N29_00_E078_00_DEM.tif`
    7. `Copernicus_DSM_COG_10_N29_00_E079_00_DEM.tif`
    8. `Copernicus_DSM_COG_10_N29_00_E080_00_DEM.tif`
    9. `Copernicus_DSM_COG_10_N30_00_E077_00_DEM.tif`
    10. `Copernicus_DSM_COG_10_N30_00_E078_00_DEM.tif`
    11. `Copernicus_DSM_COG_10_N30_00_E079_00_DEM.tif`
    12. `Copernicus_DSM_COG_10_N30_00_E080_00_DEM.tif`
* **Current Status:** **Not locally present in repository.** No tiles are present in `data/raw/dem/copernicus_glo30/`.
* **Honest Execution Policy:**
  * Strictly no synthetic, randomized, or interpolated raster substitution.
  * In the absence of official Copernicus DEM tiles, terrain elevation and slope evaluate to `None`, preserving `status = "PARTIAL"` without fabricating risk.
