import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useExperience } from './ExperienceContext';

export const IntroSequence: React.FC = () => {
  const { setCameraState, setIntroComplete, isIntroComplete } = useExperience();
  const [step, setStep] = useState<number>(0);

  useEffect(() => {
    if (!isIntroComplete) {
      const timers = [
        // Show DRISHTI HIMALAYA
        setTimeout(() => setStep(1), 500),
        
        // Show subtitle / loading
        setTimeout(() => setStep(2), 2000),
        
        // Start fading out the black overlay to reveal terrain
        setTimeout(() => {
          setStep(3);
          // Signal camera to move to overview
          setCameraState('overview');
        }, 4000),
        
        // Show "EXPLORE CORRIDOR" button
        setTimeout(() => setStep(4), 6000),
      ];

      return () => timers.forEach(clearTimeout);
    }
  }, [isIntroComplete, setCameraState]);

  if (isIntroComplete) return null;

  return (
    <AnimatePresence>
      {!isIntroComplete && (
        <motion.div 
          className="fixed top-0 left-0 w-screen h-screen z-[9999] flex items-center justify-center text-slate-100 font-sans transition-colors duration-[2000ms] ease-out motion-reduce:transition-none"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.5, ease: 'easeInOut' }}
          style={{ pointerEvents: step >= 4 ? 'auto' : 'none', backgroundColor: step < 3 ? '#080a0c' : 'transparent' }}
        >
          <div className="w-full h-full relative flex items-center justify-center">
            <AnimatePresence mode="wait">
              {step >= 1 && step < 4 && (
                <motion.div
                  key="title"
                  className="text-center tracking-[0.2em]"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                >
                  <h1 className="text-[2.5rem] font-light m-0 mb-8 leading-[1.4] text-slate-100">
                    DRISHTI <br /> HIMALAYA
                  </h1>
                  
                  {step >= 2 && (
                    <motion.div
                      className="text-xs text-slate-400 flex flex-col gap-2 tracking-[0.1em] uppercase"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5 }}
                    >
                      <p>INITIALIZING TERRAIN...</p>
                      <p>CONNECTING ENVIRONMENTAL TELEMETRY...</p>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {step >= 4 && (
                <motion.div
                  key="explore"
                  className="w-full h-full absolute top-0 left-0 flex flex-col items-center justify-center"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 1, delay: 0.5 }}
                >
                  <div className="absolute top-8 left-4 sm:left-8 tracking-[0.15em]">
                    <div className="text-[0.85rem] font-semibold text-slate-100 mb-1">DRISHTI HIMALAYA</div>
                    <div className="text-[0.65rem] text-slate-400">HIMALAYAN ROAD INTELLIGENCE</div>
                  </div>
                  
                  <div className="hidden sm:block absolute top-8 left-1/2 -translate-x-1/2 text-center tracking-[0.15em]">
                    <div className="text-[0.85rem] font-semibold text-slate-100 mb-1">NH-7 RISHIKESH — JOSHIMATH</div>
                    <div className="text-[0.65rem] text-slate-400">LIVE ENVIRONMENTAL TELEMETRY</div>
                  </div>
                  
                  <div className="absolute top-[5.5rem] sm:top-8 left-4 sm:left-auto sm:right-8 text-[0.7rem] tracking-[0.15em] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full inline-block bg-emerald-500 shadow-[0_0_8px_#10b981]"></span> SYSTEM LIVE
                  </div>

                  <button
                    type="button"
                    className="absolute bottom-16 bg-transparent border border-white/20 text-slate-100 px-10 py-4 text-sm tracking-[0.2em] cursor-pointer rounded-sm transition-all duration-300 backdrop-blur-sm hover:bg-white/5 hover:border-white/50 hover:-translate-y-0.5"
                    onClick={() => {
                      setIntroComplete(true);
                      setCameraState('overview');
                    }}
                  >
                    EXPLORE CORRIDOR
                  </button>

                  <button
                    type="button"
                    className="absolute right-4 sm:right-8 bottom-4 sm:bottom-8 py-2 text-slate-400 text-xs tracking-[0.08em] uppercase border-b border-transparent transition-all duration-200 hover:text-slate-100 hover:border-sky-400"
                    onClick={() => {
                      setIntroComplete(true);
                      setCameraState('overview');
                    }}
                  >
                    Skip intro
                  </button>
                  
                  <div className="absolute bottom-4 sm:bottom-8 left-4 sm:left-8 text-[0.65rem] text-slate-400 tracking-[0.15em] leading-relaxed">
                    UTTARAKHAND<br/>NH-7 CORRIDOR
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
