import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { useExperience } from '../../experience/ExperienceContext';

export const Terrain3D: React.FC = React.memo(() => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { theme, mode } = useExperience();
  
  // Procedural terrain generation using Simplex noise
  const { geometry, wireframeColor } = useMemo(() => {
    const width = 2000;
    const depth = 2000;
    const widthSegments = 128;
    const depthSegments = 128;
    
    const geom = new THREE.PlaneGeometry(width, depth, widthSegments, depthSegments);
    geom.rotateX(-Math.PI / 2); // Lay flat
    
    const noise2D = createNoise2D();
    const position = geom.attributes.position;
    const colorArray = new Float32Array(position.count * 3);
    
    const isBright = theme === 'bright';
    const isEnv = mode === 'environment';

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      
      let y = 0;
      let amplitude = 150;
      let frequency = 0.002;
      
      for(let o = 0; o < 4; o++) {
        y += noise2D(x * frequency, z * frequency) * amplitude;
        amplitude *= 0.45;
        frequency *= 2.5;
      }
      
      y = Math.pow(Math.abs(y), 1.2) * Math.sign(y);
      y -= 20; 
      
      position.setY(i, y);
      
      const color = new THREE.Color();
      
      if (isBright) {
        if (y > 180) {
          color.setHex(0xe8ecef); // Snow peak
        } else if (y > 80) {
          color.setHex(0x7c8573); // Earthy alpine
        } else {
          color.setHex(0x4a5441); // Valley green/brown
        }
      } else {
        if (y > 180) {
          color.setHex(0x222222);
        } else if (y > 80) {
          color.setHex(0x111111);
        } else {
          color.setHex(0x050505);
        }
      }

      // If in environment mode, overlay a subtle rainfall heatmap (cyan/blue)
      if (isEnv) {
        // Pseudo-precipitation intensity based on elevation and some noise
        const rainIntensity = (noise2D(x * 0.01, z * 0.01) * 0.5 + 0.5) * (y < 100 ? 1 : 0.2);
        const rainColor = new THREE.Color(0x00a8ff);
        color.lerp(rainColor, rainIntensity * 0.4);
      } else if (mode === 'risk') {
        // Highlight steep slopes and high elevation gradients (landslide hazard)
        const slopeRisk = Math.min(1, Math.max(0, (y - 40) / 110));
        const riskColor = new THREE.Color(0xe11d48);
        color.lerp(riskColor, slopeRisk * 0.4);
      }
      
      const colorNoise = noise2D(x * 0.05, z * 0.05) * (isBright ? 0.03 : 0.05);
      color.r = Math.max(0, Math.min(1, color.r + colorNoise));
      color.g = Math.max(0, Math.min(1, color.g + colorNoise));
      color.b = Math.max(0, Math.min(1, color.b + colorNoise));
      
      colorArray[i * 3] = color.r;
      colorArray[i * 3 + 1] = color.g;
      colorArray[i * 3 + 2] = color.b;
    }
    
    geom.computeVertexNormals();
    geom.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    
    let wfColor = isBright ? "#a8b5a1" : "#333333";
    if (isEnv) {
      wfColor = "#00a8ff"; // highlight wireframe as data grid in env mode
    } else if (mode === 'risk') {
      wfColor = "#f59e0b"; // hazard grid in risk mode
    }

    return { geometry: geom, wireframeColor: wfColor };
  }, [theme, mode]);

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry} receiveShadow>
        <meshStandardMaterial 
          vertexColors
          roughness={theme === 'bright' ? 0.8 : 0.9}
          metalness={theme === 'bright' ? 0.05 : 0.1}
          flatShading
        />
      </mesh>
      <mesh geometry={geometry} position={[0, 0.5, 0]}>
        <meshBasicMaterial 
          color={wireframeColor} 
          wireframe={true} 
          transparent={true} 
          opacity={theme === 'bright' ? 0.25 : 0.15} 
        />
      </mesh>
    </group>
  );
});
