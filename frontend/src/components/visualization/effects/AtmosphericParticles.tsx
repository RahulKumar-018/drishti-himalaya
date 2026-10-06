import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const AtmosphericParticles: React.FC = () => {
  const pointsRef = useRef<THREE.Points>(null);
  const particleCount = 1000;
  
  const positions = useMemo(() => {
    const positionsArray = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positionsArray[i * 3] = (Math.random() - 0.5) * 800; // x
      positionsArray[i * 3 + 1] = Math.random() * 300;      // y
      positionsArray[i * 3 + 2] = (Math.random() - 0.5) * 800; // z
    }
    return positionsArray;
  }, []);

  useFrame((state) => {
    if (pointsRef.current) {
      // Subtle floating motion
      pointsRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.1) * 10;
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.02;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={2}
        color="#87ceeb"
        transparent
        opacity={0.4}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};
