export interface TerrainSample {
  x: number;
  z: number;
  elevation: number;
}

export interface TerrainDataProvider {
  readonly source: "COPERNICUS_DEM" | "PROVISIONAL_PROCEDURAL";
  load(): Promise<TerrainSample[]>;
}

/**
 * Visual scaffolding only. It has no geographic claim and is intentionally
 * isolated from the renderer so a real DEM provider can replace it later.
 */
export class ProvisionalTerrainDataProvider implements TerrainDataProvider {
  readonly source = "PROVISIONAL_PROCEDURAL" as const;

  async load() {
    const samples: TerrainSample[] = [];
    for (let z = -5; z <= 5; z += 1) {
      for (let x = -9; x <= 9; x += 1) {
        const ridge = Math.sin(x * 0.48) * 0.32 + Math.cos(z * 0.72) * 0.16;
        samples.push({ x, z, elevation: ridge });
      }
    }
    return samples;
  }
}

export function createProvisionalTerrainSamples() {
  const samples: TerrainSample[] = [];
  for (let z = -5; z <= 5; z += 1) {
    for (let x = -9; x <= 9; x += 1) {
      const ridge = Math.sin(x * 0.48) * 0.32 + Math.cos(z * 0.72) * 0.16;
      samples.push({ x, z, elevation: ridge });
    }
  }
  return samples;
}
