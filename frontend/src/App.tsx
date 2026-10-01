import React from 'react';
import { AppShell } from './components/shell';
import { Workspace } from './components/workspace';
import './App.css';

export default function App(): React.JSX.Element {
  return (
    <AppShell>
      <Workspace />
    </AppShell>
  );
}

