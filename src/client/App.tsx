import { useState, useEffect } from 'react';
import { Dashboard } from './pages/Dashboard';
import { RuleEditor } from './pages/RuleEditor';
import { UiActions } from './pages/UiActions';
import { Macros } from './pages/Macros';
import { ScheduledTasks } from './pages/ScheduledTasks';
import { YamlEditor } from './pages/YamlEditor';
import { TestRunner } from './pages/TestRunner';
import { ActionLog } from './pages/ActionLog';
import logoLightUrl from '../logo/moderator_logo.png';
import logoDarkUrl from '../logo/modegator_logo_dark.png';
import { requestExpandedMode, getWebViewMode } from '@devvit/web/client';
import './theme.css';

const TABS = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'visualizer', label: 'Visualizer' },
  { id: 'yaml',       label: 'YAML' },
  { id: 'test',      label: 'Test' },
  { id: 'log',       label: 'Log' },
];

export function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isExpanded, setIsExpanded] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    try {
      setIsExpanded(getWebViewMode() === 'expanded');
    } catch (e) {
      // Ignore if not in devvit context
    }
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem('modegator_theme') as 'dark' | 'light';
    const initialTheme = (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
    setTheme(initialTheme);
    document.documentElement.className = `theme-${initialTheme}`;
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('modegator_theme', newTheme);
    document.documentElement.className = `theme-${newTheme}`;
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    try {
      await requestExpandedMode(e.nativeEvent as any, 'default');
    } catch (err) {
      console.error('Failed to enter expanded mode:', err);
    }
  };

  // Add global unhandled promise rejection handler for FORBIDDEN errors
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.message === 'FORBIDDEN') {
        setAccessDenied(true);
      }
    };
    window.addEventListener('unhandledrejection', handleRejection);
    return () => window.removeEventListener('unhandledrejection', handleRejection);
  }, []);

  if (accessDenied) {
    return (
      <div className={`app theme-${theme}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg-card)' }}>
        <h1 style={{ color: 'var(--error-color)', fontSize: '3rem', marginBottom: '1rem' }}>Access Denied</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', textAlign: 'center', maxWidth: '400px' }}>
          This dashboard is strictly reserved for moderators of the subreddit. You do not have the required permissions to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className={`app theme-${theme}`}>
      <header className="header">
        <div className="header-left">
          <img src={theme === 'dark' ? logoDarkUrl : logoLightUrl} alt="Modegator Logo" className="header-logo-img" />
          <span className="header-title">
            <span style={{ color: theme === 'dark' ? '#f0f2f5' : '#2C3238' }}>Mode</span>
            <span style={{ color: '#FF4F00' }}>gator</span>
          </span>
        </div>
        
        <div className="header-right" style={{ gap: '8px' }}>
          {!isExpanded && (
            <button className="theme-toggle" onClick={handleMaximize} title="Maximize" aria-label="Maximize">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
              </svg>
            </button>
          )}
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle Theme" aria-label="Toggle Theme">
            {theme === 'dark' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'visualizer' && <VisualizerWrapper onNavigate={(t) => setActiveTab(t)} />}
        {activeTab === 'yaml'      && <YamlEditor />}
        {activeTab === 'test'      && <TestRunner />}
        {activeTab === 'log'       && <ActionLog />}
      </main>
    </div>
  );
}

function VisualizerWrapper({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [subTab, setSubTab] = useState('rules');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      <div className="tabs" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--r-border)', paddingBottom: '12px', paddingLeft: 0, paddingRight: 0, background: 'transparent' }}>
        <button className={`btn btn-sm ${subTab === 'rules' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSubTab('rules')}>Rules</button>
        <button className={`btn btn-sm ${subTab === 'ui' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSubTab('ui')}>UI Actions</button>
        <button className={`btn btn-sm ${subTab === 'macros' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSubTab('macros')}>Macros</button>
        <button className={`btn btn-sm ${subTab === 'scheduled' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSubTab('scheduled')}>Scheduled Tasks</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
        {subTab === 'rules' && <RuleEditor onNavigate={onNavigate} />}
        {subTab === 'ui' && <UiActions onNavigate={onNavigate} />}
        {subTab === 'macros' && <Macros onNavigate={onNavigate} />}
        {subTab === 'scheduled' && <ScheduledTasks onNavigate={onNavigate} />}
      </div>
    </div>
  );
}
