import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CorridorSegmentRisk } from '../../../services/risk/segmentRiskService';
import { useExperience } from '../../experience/ExperienceContext';

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
  const { cameraState, setCameraState } = useExperience();
  
  // Target position for camera animation
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const targetPosition = useRef(new THREE.Vector3(0, 400, 800));

  useEffect(() => {
    // When a segment is selected, auto-switch to segment-focus
    if (selectedSegmentId && cameraState !== 'segment-focus') {
      setCameraState('segment-focus');
    }
  }, [selectedSegmentId, cameraState, setCameraState]);

  useEffect(() => {
    // Cinematic Intro State
    if (cameraState === 'intro') {
      targetLookAt.current.set(0, 50, 0);
      targetPosition.current.set(0, 50, 200); // Low, inside the fog
      return;
    }

    // Cinematic Overview State
    if (cameraState === 'overview') {
      targetLookAt.current.set(0, 0, 0);
      targetPosition.current.set(0, 600, 1000); // High up, revealing the corridor
      return;
    }

    // Default or Segment Focus
    if (!selectedSegmentId || segments.length === 0) {
      targetLookAt.current.set(0, 0, 0);
      targetPosition.current.set(0, 400, 800);
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
    
    if (cameraState === 'segment-focus') {
      // Zoom in close on the segment
      targetPosition.current.set(x + 50, y + 100, z + 100);
    } else {
      // Camera slightly above and offset from the segment
      targetPosition.current.set(x + 100, y + 200, z + 200);
    }
    
  }, [selectedSegmentId, segments, centerLat, centerLon, cameraState]);

  useFrame((state) => {
    // Smooth camera transitions (slower for cinematic feel)
    const lerpSpeed = cameraState === 'overview' ? 0.015 : 0.05;
    
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt.current, lerpSpeed);
      state.camera.position.lerp(targetPosition.current, lerpSpeed);
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
      maxDistance={2000}
      autoRotate={false}
      enableZoom={true}
    />
  );
};
