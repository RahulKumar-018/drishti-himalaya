import React, { useState } from 'react';
import { Html } from '@react-three/drei';
import { PILOT_CORRIDOR_WAYPOINTS } from '../../../services/environmental/corridorConstants';
import { CorridorSegmentRisk } from '../../../services/risk/segmentRiskService';
import { useExperience } from '../../experience/ExperienceContext';

export interface CorridorWaypoints3DProps {
  centerLat: number;
  centerLon: number;
  segments?: CorridorSegmentRisk[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segment: CorridorSegmentRisk | null) => void;
}

const SCALE = 1000;
const ELEVATION_SCALE = 0.05;

// Prominent pilot settlements along NH-7
const PROMINENT_WAYPOINT_IDS = new Set([
  'WP-01', // Rishikesh
  'WP-05', // Devprayag
  'WP-08', // Srinagar
  'WP-10', // Rudraprayag
  'WP-12', // Karnaprayag
  'WP-15', // Chamoli
  'WP-17', // Pipalkoti
  'WP-21', // Joshimath
]);

export const CorridorWaypoints3D: React.FC<CorridorWaypoints3DProps> = React.memo(({
  centerLat,
  centerLon,
  segments = [],
  selectedSegmentId,
  onSelectSegment,
}) => {
  const { theme, cameraState, setCameraState, setPanelOpen } = useExperience();
  const [hoveredWpId, setHoveredWpId] = useState<string | null>(null);

  if (cameraState === 'intro') {
    return null;
  }

  const prominentWaypoints = PILOT_CORRIDOR_WAYPOINTS.filter(wp => 
    PROMINENT_WAYPOINT_IDS.has(wp.id)
  );

  const isBright = theme === 'bright';

  return (
    <group>
      {prominentWaypoints.map((wp) => {
        const x = (wp.coordinate[1] - centerLon) * SCALE;
        const z = -(wp.coordinate[0] - centerLat) * SCALE;
        const y = wp.approxElevationMsl * ELEVATION_SCALE;
        const isHovered = hoveredWpId === wp.id;

        // Find associated segment if any
        const matchingSegment = segments.find(s => 
          s.startWaypoint.name.toLowerCase().includes(wp.name.toLowerCase()) ||
          s.endWaypoint.name.toLowerCase().includes(wp.name.toLowerCase())
        );

        const isSelected = matchingSegment && matchingSegment.id === selectedSegmentId;

        const handleWaypointClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (matchingSegment) {
            onSelectSegment?.(matchingSegment);
          }
          setCameraState('segment-focus');
          setPanelOpen(true);
        };

        const baseTagClasses = "flex items-center gap-[6px] px-[9px] py-1 rounded-full border border-white/15 cursor-pointer whitespace-nowrap font-sans transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-[0_4px_12px_rgba(0,0,0,0.4)]";
        const themeClasses = isBright
          ? "bg-slate-50/85 backdrop-blur-md text-slate-800 border-[rgba(60,80,60,0.2)] shadow-[0_4px_12px_rgba(40,60,40,0.15)]"
          : "bg-slate-900/75 backdrop-blur-md text-slate-100";
        
        let stateClasses = "";
        if (isSelected) {
          stateClasses = "border-amber-500 bg-amber-500/20 shadow-[0_0_16px_rgba(245,158,11,0.5)] -translate-y-[2px] scale-105"; // Reduced scale from 1.08 to match closely
        } else if (isHovered) {
          stateClasses = "-translate-y-[2px] scale-105 border-sky-400 shadow-[0_6px_20px_rgba(56,189,248,0.3)]";
        }

        return (
          <group key={wp.id} position={[x, y, z]}>
            {/* Ground beacon pin mesh */}
            <mesh position={[0, 15, 0]}>
              <cylinderGeometry args={[0.8, 0.4, 30, 8]} />
              <meshBasicMaterial 
                color={isSelected ? '#f59e0b' : (isBright ? '#3b82f6' : '#60a5fa')} 
                transparent 
                opacity={0.8} 
              />
            </mesh>

            {/* Glowing beacon top */}
            <mesh position={[0, 30, 0]}>
              <sphereGeometry args={[isSelected ? 4 : 2.5, 12, 12]} />
              <meshBasicMaterial 
                color={isSelected ? '#fbbf24' : (isBright ? '#2563eb' : '#93c5fd')} 
              />
            </mesh>

            {/* In-Scene HTML Tag */}
            <Html
              position={[0, 42, 0]}
              center
              distanceFactor={700}
              zIndexRange={[100, 0]}
              className="hidden sm:block pointer-events-auto select-none"
            >
              <button
                type="button"
                className={`${baseTagClasses} ${themeClasses} ${stateClasses} hover:-translate-y-[2px] hover:scale-105 hover:border-sky-400 hover:shadow-[0_6px_20px_rgba(56,189,248,0.3)]`}
                onClick={handleWaypointClick}
                onMouseEnter={() => setHoveredWpId(wp.id)}
                onMouseLeave={() => setHoveredWpId(null)}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-500 shadow-[0_0_10px_#f59e0b]' : 'bg-sky-400 shadow-[0_0_8px_#38bdf8]'}`} />
                <div className="flex items-baseline gap-[5px]">
                  <span className="text-[11px] font-semibold tracking-[0.02em]">{wp.name}</span>
                  <span className="text-[9px] opacity-70 font-mono">{wp.approxElevationMsl}m</span>
                </div>
              </button>
            </Html>
          </group>
        );
      })}
    </group>
  );
});
