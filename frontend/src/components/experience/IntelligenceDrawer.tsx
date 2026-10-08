import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ShieldAlert, 
  CloudRain, 
  Mountain, 
  Activity, 
  Sliders, 
  Compass, 
  AlertTriangle, 
  TrendingUp,
  RotateCcw
} from 'lucide-react';
import { CorridorSegmentRisk } from '../../services/risk/segmentRiskService';
import { RiskAssessment } from '../../services/risk/types';
import { EnvironmentalData } from '../../services/environmental/types';
import { useExperience } from './ExperienceContext';

export interface IntelligenceDrawerProps {
  segments?: CorridorSegmentRisk[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segment: CorridorSegmentRisk | null) => void;
  riskAssessment?: RiskAssessment | null;
  envData?: EnvironmentalData | null;
  scenarioPrecipitation?: number | null;
  onScenarioChange?: (val: number | null) => void;
}

export const IntelligenceDrawer: React.FC<IntelligenceDrawerProps> = ({
  segments = [],
  selectedSegmentId,
  onSelectSegment,
  riskAssessment: _riskAssessment,
  envData,
  scenarioPrecipitation,
  onScenarioChange,
}) => {
  const { isPanelOpen, setPanelOpen, theme, setCameraState } = useExperience();

  const selectedSegment = segments.find(s => s.id === selectedSegmentId) || (segments.length > 0 ? segments[0] : null);

  const livePrecip = envData?.rainfall?.precipitation ?? 14.2;
  const isSimulating = scenarioPrecipitation !== null && scenarioPrecipitation !== undefined;
  const activePrecip = isSimulating ? scenarioPrecipitation : livePrecip;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onScenarioChange?.(val);
  };

  const handleResetSimulation = () => {
    onScenarioChange?.(null);
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'LOW': return 'var(--color-risk-low)';
      case 'MODERATE': return 'var(--color-risk-moderate)';
      case 'HIGH': return 'var(--color-risk-high)';
      case 'SEVERE': return 'var(--color-risk-severe)';
      default: return 'var(--color-risk-moderate)';
    }
  };

  const isBright = theme === 'bright';

  return (
    <AnimatePresence>
      {isPanelOpen && (
        <motion.aside
          className={`fixed top-0 right-0 w-[440px] max-w-[90vw] h-screen z-[90] flex flex-col box-border overflow-hidden backdrop-blur-3xl shadow-[-20px_0_60px_rgba(0,0,0,0.6)] ${isBright ? 'bg-slate-50/85 border-l border-slate-200/50 text-slate-900' : 'bg-[#0a0f14]/85 border-l border-white/10 text-slate-100'}`}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 32, stiffness: 300, mass: 0.8 }}
          aria-label="Corridor Risk Intelligence Dossier"
        >
          {/* Header */}
          <div className={`px-8 py-7 flex justify-between items-start border-b ${isBright ? 'border-slate-200/50' : 'border-white/5'}`}>
            <div className="flex flex-col gap-1.5">
              <span className={`flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase ${isBright ? 'text-sky-700' : 'text-sky-400'}`}>
                <Compass size={13} strokeWidth={2.5} />
                OPERATIONAL INTELLIGENCE
              </span>
              <h2 className="m-0 text-2xl font-bold tracking-tight">
                {selectedSegment 
                  ? `${selectedSegment.startWaypoint.name} → ${selectedSegment.endWaypoint.name}`
                  : 'NH-7 Corridor Overview'}
              </h2>
              {selectedSegment && (
                <span className="text-xs opacity-70 font-mono tracking-wide mt-1">
                  Elevation {selectedSegment.startElevationM}m – {selectedSegment.endElevationM}m MSL
                </span>
              )}
            </div>

            <button
              type="button"
              className={`flex items-center justify-center w-8 h-8 rounded-full border transition-all duration-300 cursor-pointer ${isBright ? 'bg-black/5 border-black/10 text-slate-500 hover:bg-black/10 hover:text-slate-900 hover:scale-105' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/15 hover:text-white hover:scale-105'}`}
              onClick={() => setPanelOpen(false)}
              aria-label="Close intelligence drawer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Quick Segment Selector Strip */}
          <div className={`px-8 py-4 flex flex-col gap-2.5 border-b ${isBright ? 'bg-slate-100/40 border-slate-200/50' : 'bg-black/40 border-white/5'}`}>
            <span className="text-[10px] font-bold tracking-[0.15em] opacity-60">SELECT SECTOR</span>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/20">
              {segments.map((seg) => {
                const isSelected = selectedSegment?.id === seg.id;
                return (
                  <button
                    key={seg.id}
                    type="button"
                    className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap transition-all duration-300 border ${
                      isSelected 
                        ? (isBright ? 'bg-sky-100 border-sky-400 text-sky-800 shadow-sm' : 'bg-sky-500/20 border-sky-400/50 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.2)]')
                        : (isBright ? 'bg-white/80 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-white' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/15 hover:text-slate-200')
                    }`}
                    onClick={() => {
                      onSelectSegment?.(seg);
                      setCameraState('segment-focus');
                    }}
                  >
                    <span 
                      className="w-2 h-2 rounded-full shadow-inner" 
                      style={{ backgroundColor: seg.colorHex }}
                    />
                    {seg.startWaypoint.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 px-8 py-7 overflow-y-auto flex flex-col gap-6 scrollbar-thin scrollbar-thumb-white/20">
            {/* Risk Assessment Card */}
            {selectedSegment && (
              <div className={`flex flex-col gap-5 p-6 rounded-2xl border backdrop-blur-md ${isBright ? 'bg-white/80 border-slate-200 shadow-md' : 'bg-white/5 border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)]'}`}>
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold tracking-[0.15em] opacity-60">CORRIDOR HAZARD INDEX</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span 
                        className="text-5xl font-extrabold leading-none tracking-tighter"
                        style={{ color: getTierColor(selectedSegment.riskTier) }}
                      >
                        {selectedSegment.riskScore}
                      </span>
                      <span className="text-sm opacity-50 font-bold">/100</span>
                    </div>
                  </div>
                  <div 
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-bold tracking-[0.1em]"
                    style={{ 
                      backgroundColor: `${getTierColor(selectedSegment.riskTier)}15`,
                      borderColor: `${getTierColor(selectedSegment.riskTier)}40`,
                      color: getTierColor(selectedSegment.riskTier)
                    }}
                  >
                    <ShieldAlert size={15} strokeWidth={2.5} />
                    {selectedSegment.riskTier} HAZARD
                  </div>
                </div>

                <div className={`grid grid-cols-2 gap-3 pt-4 border-t ${isBright ? 'border-slate-200/60' : 'border-white/10'}`}>
                  <div className={`flex items-center gap-3 p-3 rounded-xl ${isBright ? 'bg-slate-50' : 'bg-black/30'}`}>
                    <CloudRain size={16} className="text-sky-500" />
                    <div>
                      <span className="block text-[10px] font-bold opacity-60 uppercase tracking-widest">Precipitation</span>
                      <span className="block text-sm font-bold mt-0.5">{activePrecip.toFixed(1)} mm/h</span>
                    </div>
                  </div>

                  <div className={`flex items-center gap-3 p-3 rounded-xl ${isBright ? 'bg-slate-50' : 'bg-black/30'}`}>
                    <Mountain size={16} className="text-sky-500" />
                    <div>
                      <span className="block text-[10px] font-bold opacity-60 uppercase tracking-widest">Slope Relief</span>
                      <span className="block text-sm font-bold mt-0.5">38° – 44° Dip</span>
                    </div>
                  </div>

                  <div className={`flex items-center gap-3 p-3 rounded-xl ${isBright ? 'bg-slate-50' : 'bg-black/30'}`}>
                    <Activity size={16} className="text-sky-500" />
                    <div>
                      <span className="block text-[10px] font-bold opacity-60 uppercase tracking-widest">Geology</span>
                      <span className="block text-sm font-bold mt-0.5">Phyllite / Quartzite</span>
                    </div>
                  </div>

                  <div className={`flex items-center gap-3 p-3 rounded-xl ${isBright ? 'bg-slate-50' : 'bg-black/30'}`}>
                    <TrendingUp size={16} className="text-sky-500" />
                    <div>
                      <span className="block text-[10px] font-bold opacity-60 uppercase tracking-widest">Debris Risk</span>
                      <span className="block text-sm font-bold mt-0.5">Elevated</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AI Decision Directives */}
            <div className={`flex flex-col gap-3.5 p-6 rounded-2xl border-l-4 shadow-md ${selectedSegment?.riskTier === 'SEVERE' || selectedSegment?.riskTier === 'HIGH' ? (isBright ? 'bg-amber-50 border-amber-500 border-y-amber-200 border-r-amber-200' : 'bg-amber-500/10 border-amber-500 border-y-amber-500/20 border-r-amber-500/20') : (isBright ? 'bg-emerald-50 border-emerald-500 border-y-emerald-200 border-r-emerald-200' : 'bg-emerald-500/10 border-emerald-500 border-y-emerald-500/20 border-r-emerald-500/20')}`}>
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className={selectedSegment?.riskTier === 'SEVERE' || selectedSegment?.riskTier === 'HIGH' ? "text-amber-600" : "text-emerald-500"} />
                <h3 className={`m-0 text-xs font-bold tracking-[0.1em] uppercase ${selectedSegment?.riskTier === 'SEVERE' || selectedSegment?.riskTier === 'HIGH' ? "text-amber-600" : "text-emerald-500"}`}>Operational Recommendation</h3>
              </div>
              <p className={`m-0 text-sm leading-relaxed ${isBright ? 'text-slate-700' : 'text-slate-300'}`}>
                {selectedSegment?.riskTier === 'SEVERE' || selectedSegment?.riskTier === 'HIGH' ? (
                  <>
                    <strong className="font-semibold text-amber-500">TRAFFIC CAUTION ADVISED:</strong> Continuous rainfall on unstable dip slope between {selectedSegment.startWaypoint.name} and {selectedSegment.endWaypoint.name} elevates rockfall and debris flow hazard. Recommend deploying emergency recovery machinery at nearest staging post and restricting heavy cargo convoy movements.
                  </>
                ) : (
                  <>
                    <strong className="font-semibold text-emerald-500">CORRIDOR TRANSIT CLEAR:</strong> Highway transit open. Standard Himalayan slope caution applies along steep cut-slopes. Monitor localized precipitation cells in the upper Alaknanda basin.
                  </>
                )}
              </p>
            </div>

            {/* What-If Rainfall Scenario Simulator */}
            <div className={`flex flex-col gap-4 p-6 rounded-2xl border ${isBright ? 'bg-sky-50/80 border-sky-200 shadow-inner' : 'bg-sky-900/10 border-sky-500/20 shadow-inner'}`}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-[10px] font-bold text-sky-500 tracking-[0.15em] uppercase">
                  <Sliders size={14} strokeWidth={2.5} />
                  <span>WHAT-IF RAINFALL SIMULATOR</span>
                </div>
                {isSimulating && (
                  <button 
                    type="button" 
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold tracking-wider transition-all cursor-pointer ${isBright ? 'bg-white border-sky-200 text-sky-700 hover:bg-sky-100 hover:border-sky-300 shadow-sm' : 'border-sky-500/30 text-sky-300 hover:bg-sky-500/20 hover:text-white'}`}
                    onClick={handleResetSimulation}
                    title="Reset to live sensor telemetry"
                  >
                    <RotateCcw size={12} />
                    RESET
                  </button>
                )}
              </div>

              <p className={`m-0 text-sm leading-relaxed ${isBright ? 'text-slate-600' : 'text-slate-400'}`}>
                Evaluate how torrential Himalayan rainstorms or cloudbursts escalate corridor risk in real time.
              </p>

              <div className="flex flex-col gap-3 mt-2">
                <div className="flex justify-between items-center">
                  <span className={`text-xs font-semibold ${isBright ? 'text-slate-500' : 'text-slate-400'}`}>Simulated Rainfall:</span>
                  <span className="font-bold text-sky-500 font-mono text-base tracking-tight">
                    {activePrecip.toFixed(1)} <span className="text-xs opacity-70">mm/h</span>
                    {isSimulating && <span className="text-[10px] text-amber-500 ml-2 tracking-widest bg-amber-500/10 px-1.5 py-0.5 rounded">SIMULATED</span>}
                  </span>
                </div>
                
                <div className="relative w-full py-2">
                  <input
                    type="range"
                    min="0"
                    max="120"
                    step="1"
                    value={activePrecip}
                    onChange={handleSliderChange}
                    className="w-full accent-sky-500 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-sky-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 [&::-webkit-slider-thumb]:transition-transform"
                  />
                </div>

                <div className={`flex justify-between text-[10px] font-mono font-semibold uppercase tracking-wider ${isBright ? 'text-slate-400' : 'text-slate-500'}`}>
                  <span>Dry (0)</span>
                  <span>Mod (25)</span>
                  <span>Hvy (60)</span>
                  <span className="text-amber-500">Cloudburst</span>
                </div>
              </div>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
