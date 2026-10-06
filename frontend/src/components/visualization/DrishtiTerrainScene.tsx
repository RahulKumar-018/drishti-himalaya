import React from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { CorridorSegmentRisk } from '../../services/risk/segmentRiskService';
import { CorridorPath3D } from './terrain/CorridorPath3D';
import { AtmosphericParticles } from './effects/AtmosphericParticles';
import { SceneControls } from './controls/SceneControls';
import './DrishtiTerrainScene.css';

export interface DrishtiTerrainSceneProps {
  segments?: CorridorSegmentRisk[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segment: CorridorSegmentRisk | null) => void;
}

export const DrishtiTerrainScene: React.FC<DrishtiTerrainSceneProps> = ({
  segments = [],
  selectedSegmentId = null,
  onSelectSegment,
}) => {
  // Center of the corridor (Rishikesh to Joshimath approx)
  const centerLat = 30.25;
  const centerLon = 78.85;

  return (
    <div className="dh-terrain-scene-container" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 150, 200], fov: 45, near: 0.1, far: 2000 }}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        dpr={[1, 2]} // limit to 2 for performance
      >
        <color attach="background" args={['#050814']} />
        <fog attach="fog" args={['#050814', 100, 600]} />

        <ambientLight intensity={0.2} color="#4b6584" />
        <directionalLight position={[100, 200, 100]} intensity={0.5} color="#c8d6e5" />

        <SceneControls selectedSegmentId={selectedSegmentId} segments={segments} centerLat={centerLat} centerLon={centerLon} />
        
        <CorridorPath3D 
          segments={segments} 
          centerLat={centerLat} 
          centerLon={centerLon}
          selectedSegmentId={selectedSegmentId}
          onSelectSegment={onSelectSegment}
        />

        <AtmosphericParticles />

        <EffectComposer>
          <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} />
        </EffectComposer>
      </Canvas>
    </div>
  );
};
