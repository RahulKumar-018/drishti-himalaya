import React from 'react';
import { Canvas } from '@react-three/fiber';
import { CorridorSegmentRisk } from '../../services/risk/segmentRiskService';
import { CorridorPath3D } from './terrain/CorridorPath3D';
import { Terrain3D } from './terrain/Terrain3D';
import { SceneControls } from './controls/SceneControls';
import { CinematicAtmosphere } from './terrain/CinematicAtmosphere';
import { CameraParallax } from './controls/CameraParallax';
import { useExperience } from '../experience/ExperienceContext';
import { CorridorWaypoints3D } from './terrain/CorridorWaypoints3D';

export interface DrishtiTerrainSceneProps {
  segments?: CorridorSegmentRisk[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segment: CorridorSegmentRisk | null) => void;
  precipitationMm?: number | null;
}

const SceneContent: React.FC<DrishtiTerrainSceneProps> = ({ 
  segments = [], 
  selectedSegmentId = null, 
  onSelectSegment,
  precipitationMm = null,
}) => {
  const { theme, mode } = useExperience();
  const centerLat = 30.25;
  const centerLon = 78.85;

  const isBright = theme === 'bright';
  const bgColor = isBright ? '#a8b4b7' : '#050505';

  return (
    <>
      <color attach="background" args={[bgColor]} />
      <fog attach="fog" args={[bgColor, 100, isBright ? 3500 : 2500]} />

      {/* Realistic subtle lighting */}
      <ambientLight intensity={isBright ? 0.6 : 0.15} color={isBright ? "#ffffff" : "#2a2a2a"} />
      <directionalLight 
        position={[-100, 400, -100]} 
        intensity={isBright ? 1.5 : 0.5} 
        color={isBright ? "#fdfbd3" : "#d0d0d0"} 
        castShadow 
      />
      <directionalLight 
        position={[100, 150, 100]} 
        intensity={isBright ? 0.8 : 0.2} 
        color={isBright ? "#a8c0d8" : "#8a8a8a"} 
      />

      <CinematicAtmosphere 
        intensity={mode === 'environment' ? 3 : 1} 
        isRaining={mode === 'environment'} 
        theme={theme} 
        precipitationMm={precipitationMm}
      />
      
      <CameraParallax intensity={1.5} />

      <SceneControls 
        selectedSegmentId={selectedSegmentId} 
        segments={segments} 
        centerLat={centerLat} 
        centerLon={centerLon} 
      />
      
      <Terrain3D />

      <CorridorPath3D 
        segments={segments} 
        centerLat={centerLat} 
        centerLon={centerLon}
        selectedSegmentId={selectedSegmentId}
        onSelectSegment={onSelectSegment}
      />

      <CorridorWaypoints3D 
        centerLat={centerLat}
        centerLon={centerLon}
        segments={segments}
        selectedSegmentId={selectedSegmentId}
        onSelectSegment={onSelectSegment}
      />
    </>
  );
};

export const DrishtiTerrainScene: React.FC<DrishtiTerrainSceneProps> = React.memo((props) => {
  return (
    <div className="fixed top-0 left-0 w-full h-full z-0 overflow-hidden pointer-events-none bg-[#050814]" aria-hidden="true">
      <Canvas
        className="pointer-events-auto w-full h-full animate-cinematic-fade-in"
        camera={{ position: [0, 400, 800], fov: 45, near: 0.1, far: 8000 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        dpr={[1, 2]} // limit to 2 for performance
      >
        <SceneContent {...props} />
      </Canvas>
    </div>
  );
});
