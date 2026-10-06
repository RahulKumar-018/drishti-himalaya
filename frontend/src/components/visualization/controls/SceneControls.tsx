import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CorridorSegmentRisk } from '../../../services/risk/segmentRiskService';

export interface SceneControlsProps {
  selectedSegmentId: string | null;
  segments: CorridorSegmentRisk[];
  centerLat: number;
  centerLon: number;
}

export const SceneControls: React.FC<SceneControlsProps> = ({
  selectedSegmentId,
  segments,
  centerLat,
  centerLon
}) => {
  const controlsRef = useRef<any>(null);
  
  // Target position for camera animation
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const targetPosition = useRef(new THREE.Vector3(0, 150, 200));

  useEffect(() => {
    if (!selectedSegmentId || segments.length === 0) {
      // Reset to default view
      targetLookAt.current.set(0, 0, 0);
      targetPosition.current.set(0, 150, 200);
      return;
    }

    const segment = segments.find(s => s.id === selectedSegmentId);
    if (!segment) return;

    // Calculate center of segment
    const SCALE = 1000;
    const ELEVATION_SCALE = 0.05;
    
    // Use the middle coordinate
    const midIdx = Math.floor(segment.coordinates.length / 2);
    const coord = segment.coordinates[midIdx];
    const avgElev = (segment.startElevationM + segment.endElevationM) / 2;
    
    const x = (coord[1] - centerLon) * SCALE;
    const z = -(coord[0] - centerLat) * SCALE;
    const y = avgElev * ELEVATION_SCALE;
    
    targetLookAt.current.set(x, y, z);
    // Camera slightly above and offset from the segment
    targetPosition.current.set(x + 50, y + 80, z + 100);
    
  }, [selectedSegmentId, segments, centerLat, centerLon]);

  useFrame((state) => {
    // Smooth camera transitions
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt.current, 0.05);
      state.camera.position.lerp(targetPosition.current, 0.05);
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls 
      ref={controlsRef}
      enableDamping 
      dampingFactor={0.05} 
      maxPolarAngle={Math.PI / 2 - 0.05} // don't go below ground
      minDistance={10}
      maxDistance={1000}
      autoRotate={!selectedSegmentId} // slowly rotate when nothing selected
      autoRotateSpeed={0.5}
    />
  );
};
