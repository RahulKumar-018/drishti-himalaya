import React, { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CorridorSegmentRisk } from '../../../services/risk/segmentRiskService';
import { useExperience } from '../../experience/ExperienceContext';

export interface CorridorPath3DProps {
  segments: CorridorSegmentRisk[];
  centerLat: number;
  centerLon: number;
  selectedSegmentId: string | null;
  onSelectSegment?: (segment: CorridorSegmentRisk | null) => void;
}

const SCALE = 1000;
const ELEVATION_SCALE = 0.05;

export const CorridorPath3D: React.FC<CorridorPath3DProps> = React.memo(({
  segments,
  centerLat,
  centerLon,
  selectedSegmentId,
  onSelectSegment
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const materialsRef = useRef<THREE.MeshBasicMaterial[]>([]);

  // Map coords to vectors
  const mapCoordToVector3 = (lat: number, lon: number, elev: number) => {
    const x = (lon - centerLon) * SCALE;
    const z = -(lat - centerLat) * SCALE;
    const y = elev * ELEVATION_SCALE;
    return new THREE.Vector3(x, y, z);
  };

  const { cameraState } = useExperience();

  const lineGeometries = useMemo(() => {
    materialsRef.current = [];
    return segments.map((segment) => {
      const path: THREE.Vector3[] = [];
      const numPoints = segment.coordinates.length;
      
      segment.coordinates.forEach((coord: [number, number], i: number) => {
        const t = numPoints > 1 ? i / (numPoints - 1) : 0;
        const elev = segment.startElevationM + (segment.endElevationM - segment.startElevationM) * t;
        path.push(mapCoordToVector3(coord[0], coord[1], elev));
      });
      
      // Use a CatmullRomCurve3 to create a smooth tube instead of a 1px line
      const curve = new THREE.CatmullRomCurve3(path);
      // TubeGeometry(curve, tubularSegments, radius, radialSegments, closed)
      const geometry = new THREE.TubeGeometry(curve, path.length * 4, 3, 8, false);
      
      // Flowing dashed material (works on tubes if mapped correctly, but simple transparent glowing is better)
      const material = new THREE.MeshBasicMaterial({
        color: segment.colorHex,
        transparent: true,
        opacity: 0.6,
        wireframe: false,
        depthWrite: false
      });
      
      materialsRef.current.push(material);

      const glowMaterial = new THREE.MeshBasicMaterial({
        color: segment.colorHex,
        transparent: true,
        opacity: 0.3,
        side: THREE.BackSide,
        depthWrite: false
      });
      // Outer glow tube (slightly larger)
      const glowGeometry = new THREE.TubeGeometry(curve, path.length * 4, 12, 8, false);

      const line = new THREE.Mesh(geometry, material);
      const glowLine = new THREE.Mesh(glowGeometry, glowMaterial);
      
      return {
        id: segment.id,
        line,
        glowLine,
        segment,
        material,
        glowMaterial
      };
    });
  }, [segments, centerLat, centerLon]);

  useFrame((state) => {
    // Determine if we should show the route
    const isVisible = cameraState !== 'intro';
    
    lineGeometries.forEach((item) => {
      const isSelected = selectedSegmentId === item.id;
      const isHovered = hoveredId === item.id;
      
      // Base opacity based on selection/hover
      let targetOpacity = 0.0;
      if (isVisible) {
        targetOpacity = isSelected ? 1.0 : (isHovered ? 0.9 : 0.6);
      }
      
      // Pulse effect for HIGH or SEVERE risk segments
      if (isVisible && !isSelected && !isHovered) {
        if (item.segment.riskTier === 'SEVERE' || item.segment.riskTier === 'HIGH') {
          const pulseSpeed = item.segment.riskTier === 'SEVERE' ? 5 : 2;
          const pulseAmount = Math.sin(state.clock.elapsedTime * pulseSpeed) * 0.2;
          targetOpacity += pulseAmount;
        }
      }

      // Smooth transition
      item.material.opacity += (targetOpacity - item.material.opacity) * 0.1;
      
      // Glow logic
      let targetGlow = 0.0;
      if (isVisible && (isSelected || isHovered)) {
         targetGlow = isSelected ? 0.4 : 0.3;
      }
      item.glowMaterial.opacity += (targetGlow - item.glowMaterial.opacity) * 0.1;
    });
  });

  return (
    <group>
      {lineGeometries.map((item) => {
        return (
          <group key={item.id}>
            <primitive 
              object={item.line} 
              onClick={(e: any) => {
                if (cameraState === 'intro') return;
                e.stopPropagation();
                onSelectSegment?.(item.segment);
              }}
              onPointerOver={(e: any) => {
                if (cameraState === 'intro') return;
                e.stopPropagation();
                setHoveredId(item.id);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={(e: any) => {
                if (cameraState === 'intro') return;
                e.stopPropagation();
                setHoveredId(null);
                document.body.style.cursor = 'default';
              }}
            />
            
            {/* We render the glow object but its opacity is managed in useFrame */}
            <primitive object={item.glowLine} />
          </group>
        );
      })}
    </group>
  );
});
