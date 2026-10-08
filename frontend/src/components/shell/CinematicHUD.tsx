import React from 'react';
import { useExperience, ExperienceMode } from '../experience/ExperienceContext';
import { 
  Layers, 
  CloudRain, 
  ShieldAlert, 
  Sun, 
  Moon, 
  RotateCcw, 
  PanelRightClose, 
  PanelRightOpen,
  MapPin,
  Compass
} from 'lucide-react';
import { RiskAssessment } from '../../services/risk/types';
import { EnvironmentalData } from '../../services/environmental/types';

export interface CinematicHUDProps {
  riskAssessment?: RiskAssessment | null;
  envData?: EnvironmentalData | null;
  onOpenWorkspace?: () => void;
}

export const CinematicHUD: React.FC<CinematicHUDProps> = ({
  riskAssessment,
  envData,
  onOpenWorkspace,
}) => {
  const { 
    mode, 
    setMode, 
    theme, 
    setTheme, 
    isIntroComplete, 
    setCameraState,
    isPanelOpen,
    setPanelOpen
  } = useExperience();

  if (!isIntroComplete) return null;

  const isBright = theme === 'bright';
  const riskTier = riskAssessment?.level ?? 'MODERATE';
  const riskScore = riskAssessment?.score ?? 45;
  const precip = envData?.rainfall?.precipitation ?? 14.2;
  const temp = 18;

  const getRiskColor = (tier: string) => {
    switch (tier) {
      case 'LOW': return '#10b981';
      case 'MODERATE': return '#f59e0b';
      case 'HIGH': return '#ef4444';
      case 'SEVERE': return '#a855f7';
      default: return '#f59e0b';
    }
  };

  const handleModeSwitch = (targetMode: ExperienceMode) => {
    setMode(targetMode);
    if (targetMode === 'overview') {
      setCameraState('overview');
    }
  };

  const handleResetCamera = () => {
    setCameraState('overview');
  };

  // Common Tailwind Class Variables
  const containerBase = "pointer-events-auto bg-slate-900/75 backdrop-blur-md border border-white/12 shadow-[0_8px_32px_rgba(0,0,0,0.35)]";
  const containerBright = "bg-slate-50/90 border-[#3c503c33] shadow-[0_8px_32px_rgba(30,45,30,0.12)]";

  const btnBase = "flex items-center gap-[6px] pointer-events-auto rounded-[10px] px-3 py-[7px] text-[0.75rem] font-semibold tracking-[0.04em] cursor-pointer transition-all duration-200 ease-out hover:-translate-y-[1px]";
  const btnDark = "bg-slate-900/75 backdrop-blur-md border border-white/12 text-slate-200 shadow-[0_4px_16px_rgba(0,0,0,0.25)] hover:bg-white/10 hover:border-white/25";
  const btnBright = "bg-slate-50/90 border border-[#3c503c33] text-slate-800 shadow-[0_4px_16px_rgba(30,45,30,0.08)] hover:bg-white hover:border-[#3c503c59]";

  return (
    <div className={`absolute top-0 left-0 w-full h-full pointer-events-none z-50 flex flex-wrap md:flex-nowrap justify-between items-start p-4 md:p-6 gap-3 font-sans box-border ${isBright ? 'text-slate-800' : 'text-slate-100'}`}>
      
      {/* 1. TOP LEFT: Corridor Branding & Visualization Modes */}
      <div className="flex flex-col gap-[0.85rem] max-w-[320px] pointer-events-auto">
        <div className="flex flex-col gap-1">
          <div className={`inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 rounded-full w-fit ${isBright ? 'text-sky-600 bg-sky-600/10 border border-sky-600/20' : 'text-sky-400 bg-sky-400/10 border border-sky-400/25'}`}>
            <span className="w-[5px] h-[5px] rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8] animate-pulse" />
            LIVE TELEMETRY
          </div>
          <h1 className={`m-0 flex flex-col text-[1.15rem] font-extrabold tracking-[0.05em] ${isBright ? 'drop-shadow-[0_1px_4px_rgba(255,255,255,0.7)]' : 'drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]'}`}>
            <span>NH-7 CORRIDOR</span>
            <span className="text-[0.78rem] font-medium opacity-75 tracking-[0.02em] mt-[1px]">Rishikesh — Joshimath (240 km)</span>
          </h1>
        </div>
        
        <div className={`flex rounded-xl p-[3px] gap-[3px] ${isBright ? containerBright : containerBase}`}>
          <button 
            type="button"
            className={`flex-1 flex items-center justify-center gap-[5px] bg-transparent border border-transparent text-[0.72rem] font-semibold tracking-[0.04em] py-1.5 px-2.5 rounded-lg cursor-pointer transition-all duration-200 ease-out whitespace-nowrap ${
              mode === 'overview' 
                ? (isBright ? 'bg-white text-sky-700 border-sky-600/30 shadow-[0_2px_10px_rgba(0,0,0,0.08)]' : 'bg-sky-400/20 text-sky-400 border-sky-400/30 shadow-[0_2px_8px_rgba(56,189,248,0.2)]')
                : (isBright ? 'text-slate-500 hover:text-slate-800 hover:bg-black/5' : 'text-slate-400 hover:text-white hover:bg-white/5')
            }`}
            onClick={() => handleModeSwitch('overview')}
            title="High-altitude topographic perspective"
          >
            <Layers size={14} />
            TERRAIN
          </button>
          
          <button 
            type="button"
            className={`flex-1 flex items-center justify-center gap-[5px] bg-transparent border border-transparent text-[0.72rem] font-semibold tracking-[0.04em] py-1.5 px-2.5 rounded-lg cursor-pointer transition-all duration-200 ease-out whitespace-nowrap ${
              mode === 'environment' 
                ? (isBright ? 'bg-white text-sky-700 border-sky-600/30 shadow-[0_2px_10px_rgba(0,0,0,0.08)]' : 'bg-sky-400/20 text-sky-400 border-sky-400/30 shadow-[0_2px_8px_rgba(56,189,248,0.2)]')
                : (isBright ? 'text-slate-500 hover:text-slate-800 hover:bg-black/5' : 'text-slate-400 hover:text-white hover:bg-white/5')
            }`}
            onClick={() => handleModeSwitch('environment')}
            title="Meteorological storm & precipitation dynamics"
          >
            <CloudRain size={14} />
            ATMOSPHERE
          </button>

          <button 
            type="button"
            className={`flex-1 flex items-center justify-center gap-[5px] bg-transparent border border-transparent text-[0.72rem] font-semibold tracking-[0.04em] py-1.5 px-2.5 rounded-lg cursor-pointer transition-all duration-200 ease-out whitespace-nowrap ${
              mode === 'risk' 
                ? (isBright ? 'bg-white text-sky-700 border-sky-600/30 shadow-[0_2px_10px_rgba(0,0,0,0.08)]' : 'bg-sky-400/20 text-sky-400 border-sky-400/30 shadow-[0_2px_8px_rgba(56,189,248,0.2)]')
                : (isBright ? 'text-slate-500 hover:text-slate-800 hover:bg-black/5' : 'text-slate-400 hover:text-white hover:bg-white/5')
            }`}
            onClick={() => handleModeSwitch('risk')}
            title="Corridor hazard tiers & slope instability heatmap"
          >
            <ShieldAlert size={14} />
            HAZARDS
          </button>
        </div>
      </div>

      {/* 2. TOP CENTER: Real-Time Environmental & Risk Telemetry */}
      <div className="flex items-center order-3 md:order-none w-full md:w-auto justify-center pointer-events-auto">
        <div className={`flex items-center gap-2 rounded-full px-2.5 py-1 w-full sm:w-auto justify-center flex-wrap ${isBright ? containerBright : containerBase}`}>
          {/* Corridor Status Pill */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[0.72rem] ${isBright ? 'bg-black/5' : 'bg-white/5'}`} title="Composite Himalayan corridor risk index">
            <span 
              className="w-[7px] h-[7px] rounded-full shadow-[0_0_6px_currentColor]" 
              style={{ backgroundColor: getRiskColor(riskTier), color: getRiskColor(riskTier) }}
            />
            <span className="text-[0.65rem] font-bold tracking-[0.08em] opacity-65 uppercase">STATUS</span>
            <span 
              className="font-bold tracking-[0.02em]"
              style={{ color: getRiskColor(riskTier) }}
            >
              {riskTier} ({riskScore}/100)
            </span>
          </div>

          {/* Meteorological Telemetry */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[0.72rem] ${isBright ? 'bg-black/5' : 'bg-white/5'}`} title="Real-time corridor precipitation">
            <CloudRain size={13} className="opacity-70" />
            <span className="font-bold tracking-[0.02em]">
              {precip.toFixed(1)} mm/h
            </span>
            <span className="text-[0.68rem] opacity-60 font-mono">
              {temp.toFixed(0)}°C
            </span>
          </div>

          {/* Active Corridor Sectors */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[0.72rem] ${isBright ? 'bg-black/5' : 'bg-white/5'}`} title="Monitored road waypoints">
            <Compass size={13} className="opacity-70" />
            <span className="text-[0.65rem] font-bold tracking-[0.08em] opacity-65 uppercase">WAYPOINTS</span>
            <span className="font-bold tracking-[0.02em]">21 Stations</span>
          </div>
        </div>
      </div>

      {/* 3. TOP RIGHT: Intelligence Panel Toggle, Reset Orbit, Theme Toggle */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Reset Camera button */}
        <button 
          type="button"
          className={`${btnBase} ${isBright ? btnBright : btnDark}`}
          onClick={handleResetCamera}
          title="Reset camera to high-altitude corridor orbit"
        >
          <RotateCcw size={15} />
          <span className="hidden md:inline">ORBIT</span>
        </button>

        {/* Intelligence Dossier Drawer Toggle */}
        <button 
          type="button"
          className={`${btnBase} ${
            isPanelOpen 
              ? (isBright ? 'bg-sky-600 text-white border-sky-600 shadow-[0_0_16px_rgba(2,132,199,0.5)]' : 'bg-sky-400 text-slate-900 border-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.5)]')
              : (isBright ? `text-sky-600 bg-sky-600/10 border-sky-600/30 hover:bg-white hover:border-[#3c503c59]` : `text-sky-400 bg-sky-400/20 border-sky-400/35 hover:bg-white/10 hover:border-white/25`)
          }`}
          onClick={() => setPanelOpen(!isPanelOpen)}
          title="Toggle corridor risk intelligence dossier"
        >
          {isPanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          <span className="hidden md:inline">INTELLIGENCE</span>
        </button>

        {/* Theme Toggle (Dark Mode vs Bright Nature Tones) */}
        <button 
          type="button"
          className={`flex items-center justify-center p-2 rounded-[10px] cursor-pointer transition-all duration-200 ease-out hover:-translate-y-[1px] ${isBright ? btnBright : btnDark}`}
          onClick={() => setTheme(isBright ? 'dark' : 'bright')}
          title={isBright ? 'Switch to Deep Charcoal Night Mode' : 'Switch to Natural Alpine Bright Mode'}
        >
          {isBright ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        {/* Optional 2D GIS workspace switch */}
        {onOpenWorkspace && (
          <button
            type="button"
            className={`${btnBase} ${isBright ? btnBright : btnDark} bg-transparent border-transparent shadow-none hover:bg-black/5 hover:border-transparent dark:hover:bg-white/5`}
            onClick={onOpenWorkspace}
            title="Switch to Classical 2D GIS Map Workspace"
          >
            <MapPin size={14} />
            <span className="hidden md:inline">GIS DESK</span>
          </button>
        )}
      </div>
    </div>
  );
};
