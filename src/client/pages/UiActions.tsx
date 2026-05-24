import { useState, useEffect } from 'react';
import { api } from '../api';
import logoLightUrl from '../../logo/moderator_logo.png';
import logoDarkUrl from '../../logo/modegator_logo_dark.png';
import { explainUiAction } from '../../shared/explainer';

export function UiActions({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [explaining, setExplaining] = useState<Record<number, boolean>>({});

  useEffect(() => {
    api.config.get().then(res => setData(res));
  }, []);

  if (!data) return <div className="content">Loading UI actions...</div>;

  const actions = data.parsed?.ui_actions || [];

  return (
    <div className="ui-actions-editor" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h2 style={{ fontSize: 'var(--r-xl)', color: 'var(--r-text)' }}>Active UI Actions</h2>
        <button className="btn btn-primary" onClick={() => onNavigate?.('yaml')}>New UI Action</button>
      </div>

      {actions.length === 0 ? (
        <div className="card empty-state">
          <img src={logoLightUrl} alt="Modegator Logo" className="empty-logo light-logo" />
          <img src={logoDarkUrl} alt="Modegator Logo" className="empty-logo dark-logo" />
          <div>No UI Actions defined. Head to the YAML editor to create one.</div>
        </div>
      ) : (
        actions.map((action: any, i: number) => (
          <div key={i} className="card" style={{ borderLeft: '4px solid var(--r-brand)', animation: `fadeIn 0.${3 + i}s ease-out` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong style={{ fontSize: 'var(--r-lg)' }}>{action.name}</strong>
              <span className="badge badge-gray">{action.location || 'subreddit'}</span>
            </div>

            <div style={{ background: 'var(--r-bg-2)', padding: '12px', borderRadius: 'var(--r-r-md)', marginBottom: '12px' }}>
              <div className="section-label">Configuration</div>
              <ul style={{ listStyleType: 'none', padding: 0, margin: 0, fontFamily: 'var(--r-mono)', fontSize: 'var(--r-sm)' }}>
                <li style={{ padding: '4px 0', borderBottom: '1px solid var(--r-border)' }}>
                  <span style={{ color: 'var(--r-orange)' }}>Menu Text</span>: {action.label}
                </li>
                <li style={{ padding: '4px 0', borderBottom: '1px solid var(--r-border)' }}>
                  <span style={{ color: 'var(--r-orange)' }}>For User Type</span>: {action.for_user_type || 'moderator'}
                </li>
                {action.confirm && (
                  <li style={{ padding: '4px 0', borderBottom: '1px solid var(--r-border)' }}>
                    <span style={{ color: 'var(--r-orange)' }}>Confirmation</span>: {action.confirm_message || 'Are you sure?'}
                  </li>
                )}
              </ul>
            </div>

            <div style={{ background: 'var(--r-bg-2)', padding: '12px', borderRadius: 'var(--r-r-md)' }}>
              <div className="section-label">Execution</div>
              {action.run_macro ? (
                <div style={{ fontFamily: 'var(--r-mono)', fontSize: 'var(--r-sm)' }}>
                  Run Macro: <span style={{ color: 'var(--r-blue)', fontWeight: 'bold' }}>{action.run_macro}</span>
                </div>
              ) : (
                <ul style={{ listStyleType: 'none', padding: 0, margin: 0, fontFamily: 'var(--r-mono)', fontSize: 'var(--r-sm)' }}>
                  {action.actions?.map((a: any, j: number) => (
                    <li key={j} style={{ padding: '4px 0', borderBottom: j < action.actions.length - 1 ? '1px solid var(--r-border)' : 'none' }}>
                      <span style={{ color: 'var(--r-danger-text)', fontWeight: 'bold' }}>{a.type}</span>
                    </li>
                  ))}
                  {(!action.actions || action.actions.length === 0) && (
                    <li style={{ color: 'var(--r-text-2)' }}>No actions defined.</li>
                  )}
                </ul>
              )}
            </div>
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={() => setExplaining(prev => ({ ...prev, [i]: !prev[i] }))}
              >
                {explaining[i] ? 'Hide Explanation' : 'Explain'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => onNavigate?.('yaml')}>Edit in YAML</button>
            </div>

            {explaining[i] && (
              <div style={{ marginTop: '12px', padding: '16px', backgroundColor: 'var(--r-brand-alpha)', borderLeft: '4px solid var(--r-brand)', borderRadius: 'var(--r-r-md)', fontSize: 'var(--r-md)', color: 'var(--r-text)', animation: 'fadeIn 0.2s' }}>
                <strong>Explanation:</strong><br/>
                {explainUiAction(action)}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
