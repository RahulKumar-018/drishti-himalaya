import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ExperienceMode = 'overview' | 'route' | 'environment' | 'terrain' | 'risk';

export type CameraState = 'intro' | 'overview' | 'route-focus' | 'segment-focus' | 'analysis' | 'reset';

export type ExperienceTheme = 'dark' | 'bright';

interface ExperienceContextType {
  mode: ExperienceMode;
  setMode: (mode: ExperienceMode) => void;
  cameraState: CameraState;
  setCameraState: (state: CameraState) => void;
  isIntroComplete: boolean;
  setIntroComplete: (complete: boolean) => void;
  theme: ExperienceTheme;
  setTheme: (theme: ExperienceTheme) => void;
  isPanelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
}

const ExperienceContext = createContext<ExperienceContextType | undefined>(undefined);

export const ExperienceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ExperienceMode>('overview');
  const hasSeenIntro =
    typeof window !== 'undefined' && window.sessionStorage.getItem('drishti-intro-seen') === 'true';
  const [cameraState, setCameraState] = useState<CameraState>(
    hasSeenIntro ? 'overview' : 'intro'
  );
  const [isIntroComplete, setIntroComplete] = useState<boolean>(hasSeenIntro);

  // Determine theme: localStorage > system preference > default 'dark'
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const storedTheme = typeof window !== 'undefined' ? window.localStorage.getItem('drishti-theme') : null;
  let initialTheme: ExperienceTheme = 'dark';
  if (storedTheme === 'dark') {
    initialTheme = 'dark';
  } else if (storedTheme === 'bright' || storedTheme === 'light') {
    initialTheme = 'bright';
  } else if (prefersDark) {
    initialTheme = 'dark';
  } else {
    initialTheme = 'dark'; // Keep default dark for cinematic Himalayan terrain
  }
  const [theme, setTheme] = useState<ExperienceTheme>(initialTheme);
  const [isPanelOpen, setPanelOpen] = useState<boolean>(false);

  // Synchronize data-theme on root document and persist in localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem('drishti-theme', theme);
      const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', normalizedTheme);
    } catch {
      // localStorage not available (e.g. incognito)
    }
  }, [theme]);

  const completeIntro = (complete: boolean) => {
    setIntroComplete(complete);
    if (complete && typeof window !== 'undefined') {
      window.sessionStorage.setItem('drishti-intro-seen', 'true');
    }
  };

  return (
    <ExperienceContext.Provider
      value={{
        mode,
        setMode,
        cameraState,
        setCameraState,
        isIntroComplete,
        setIntroComplete: completeIntro,
        theme,
        setTheme,
        isPanelOpen,
        setPanelOpen,
      }}
    >
      {children}
    </ExperienceContext.Provider>
  );
};

export const useExperience = () => {
  const context = useContext(ExperienceContext);
  if (!context) {
    throw new Error('useExperience must be used within an ExperienceProvider');
  }
  return context;
};
