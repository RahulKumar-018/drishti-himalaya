import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Cloud, Clouds } from '@react-three/drei';
import * as THREE from 'three';

export interface CinematicAtmosphereProps {
  intensity?: number;
  isRaining?: boolean;
  theme?: 'dark' | 'bright';
  precipitationMm?: number | null;
}

export const CinematicAtmosphere: React.FC<CinematicAtmosphereProps> = React.memo(({
  intensity = 1,
  isRaining = false,
  theme = 'dark',
  precipitationMm = null,
}) => {
  const precipitation = precipitationMm ?? 0;
  const groupRef = useRef<THREE.Group>(null);
  const rainRef = useRef<THREE.Points>(null);
  
  // Rain particles scaled by actual/simulated precipitation mm/h
  const rainGeometry = React.useMemo(() => {
    if (!isRaining) return null;
    const geom = new THREE.BufferGeometry();
    const count = Math.min(9000, Math.max(2000, Math.round(precipitation * 200)));
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 2000;
      positions[i * 3 + 1] = Math.random() * 1000;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 2000;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [isRaining, precipitation]);

  // Animate clouds very slowly and rain falling based on precipitation velocity
  useFrame((_state, delta) => {
    if (groupRef.current) {
      const stormSpeedMultiplier = Math.min(4, Math.max(1, precipitation / 15));
      groupRef.current.position.x += delta * (isRaining ? 8 * stormSpeedMultiplier : 2);
      if (groupRef.current.position.x > 1000) {
        groupRef.current.position.x = -1000;
      }
    }
    if (rainRef.current && rainGeometry) {
      const positions = rainRef.current.geometry.attributes.position.array as Float32Array;
      const fallSpeed = 350 + Math.min(400, precipitation * 12);
      for (let i = 1; i < positions.length; i += 3) {
        positions[i] -= delta * fallSpeed; // Falling speed
        if (positions[i] < -50) {
          positions[i] = 1000;
        }
      }
      rainRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  const isBright = theme === 'bright';

  return (
    <group>
      {isRaining && rainGeometry && (
        <points ref={rainRef} geometry={rainGeometry}>
          <pointsMaterial 
            color={isBright ? "#88b5d1" : "#5588aa"} 
            size={2} 
            transparent 
            opacity={isBright ? 0.4 : 0.6} 
            depthWrite={false} 
          />
        </points>
      )}
      <group ref={groupRef} position={[0, 150, -200]}>
        <Clouds material={THREE.MeshBasicMaterial} limit={400} range={1000}>
          <Cloud 
            position={[-500, 50, -300]}
            speed={0.1} 
            opacity={0.15 * intensity} 
            segments={40}
            volume={20}
            color={isBright ? (isRaining ? "#8b9499" : "#ffffff") : "#151515"}
            bounds={[500, 100, 500]}
          />
          <Cloud 
            position={[0, 80, -400]}
            speed={0.1} 
            opacity={0.1 * intensity} 
            segments={40}
            volume={30}
            color={isBright ? (isRaining ? "#a6a9ab" : "#fdfdfd") : "#0f0f0f"}
            bounds={[600, 150, 600]}
          />
          <Cloud 
            position={[500, 60, -200]}
            speed={0.15} 
            opacity={0.2 * intensity} 
            segments={30}
            volume={15}
            color={isBright ? (isRaining ? "#949ea3" : "#f0f4f7") : "#1a1a1a"}
            bounds={[400, 80, 400]}
          />
        </Clouds>
      </group>
    </group>
  );
});
