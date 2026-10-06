import React, { useMemo } from 'react';
import * as THREE from 'three';
import { CorridorSegmentRisk } from '../../../services/risk/segmentRiskService';

export interface CorridorPath3DProps {
  segments: CorridorSegmentRisk[];
  centerLat: number;
  centerLon: number;
  selectedSegmentId: string | null;
  onSelectSegment?: (segment: CorridorSegmentRisk | null) => void;
}

const SCALE = 1000;
const ELEVATION_SCALE = 0.05;

export const CorridorPath3D: React.FC<CorridorPath3DProps> = ({
  segments,
  centerLat,
  centerLon,
  selectedSegmentId,
  onSelectSegment
}) => {
  // Map coords to vectors
  const mapCoordToVector3 = (lat: number, lon: number, elev: number) => {
    const x = (lon - centerLon) * SCALE;
    const z = -(lat - centerLat) * SCALE;
    const y = elev * ELEVATION_SCALE;
    return new THREE.Vector3(x, y, z);
  };

  const lineGeometries = useMemo(() => {
    return segments.map((segment) => {
      // Approximate intermediate elevations if needed, or just use start/end for simplcity
      // For a more accurate line, we can just interpolate between start and end elevation
      const path: THREE.Vector3[] = [];
      const numPoints = segment.coordinates.length;
      
      segment.coordinates.forEach((coord: [number, number], i: number) => {
        const t = numPoints > 1 ? i / (numPoints - 1) : 0;
        const elev = segment.startElevationM + (segment.endElevationM - segment.startElevationM) * t;
        path.push(mapCoordToVector3(coord[0], coord[1], elev));
      });
      
      const geometry = new THREE.BufferGeometry().setFromPoints(path);
      const material = new THREE.LineBasicMaterial({
        color: segment.colorHex,
        linewidth: 2,
        transparent: true,
        opacity: 0.6
      });
      
      const glowMaterial = new THREE.LineBasicMaterial({
        color: segment.colorHex,
        linewidth: 8,
        transparent: true,
        opacity: 0.3
      });

      const line = new THREE.Line(geometry, material);
      const glowLine = new THREE.Line(geometry, glowMaterial);
      
      return {
        id: segment.id,
        line,
        glowLine,
        segment
      };
    });
  }, [segments, centerLat, centerLon]);

  return (
    <group>
      {/* Grid base to ground the scene */}
      <gridHelper args={[1000, 100, '#111b3d', '#0c132c']} position={[0, 0, 0]} />

      {lineGeometries.map((item) => {
        const isSelected = selectedSegmentId === item.id;
        
        // Update materials based on selection
        const mat = item.line.material as THREE.LineBasicMaterial;
        mat.opacity = isSelected ? 1.0 : 0.6;
        mat.linewidth = isSelected ? 4 : 2;

        return (
          <group key={item.id}>
            <primitive 
              object={item.line} 
              onClick={(e: any) => {
                e.stopPropagation();
                onSelectSegment?.(item.segment);
              }}
            />
            
            {isSelected && (
              <primitive object={item.glowLine} />
            )}
          </group>
        );
      })}
    </group>
  );
};
