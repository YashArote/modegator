import { useState, useEffect } from 'react';
import { api } from '../api';
import logoLightUrl from '../../logo/moderator_logo.png';
import logoDarkUrl from '../../logo/modegator_logo_dark.png';
import { explainMacro } from '../../shared/explainer';

export function Macros({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [explaining, setExplaining] = useState<Record<number, boolean>>({});

  useEffect(() => {
    api.config.get().then(res => setData(res));
  }, []);

  if (!data) return <div className="content">Loading macros...</div>;

  const macros = data.parsed?.macros || [];

  return (
    <div className="macros-editor" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h2 style={{ fontSize: 'var(--r-xl)', color: 'var(--r-text)' }}>Active Macros</h2>
        <button className="btn btn-primary" onClick={() => onNavigate?.('yaml')}>New Macro</button>
      </div>

      {macros.length === 0 ? (
        <div className="card empty-state">
          <img src={logoLightUrl} alt="Modegator Logo" className="empty-logo light-logo" />
          <img src={logoDarkUrl} alt="Modegator Logo" className="empty-logo dark-logo" />
          <div>No Macros defined. Head to the YAML editor to create one.</div>
        </div>
      ) : (
        macros.map((macro: any, i: number) => (
          <div key={i} className="card" style={{ borderLeft: '4px solid var(--r-purple)', animation: `fadeIn 0.${3 + i}s ease-out` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong style={{ fontSize: 'var(--r-lg)' }}>{macro.name}</strong>
              <span className="badge badge-gray">Macro Sequence</span>
            </div>

            <div style={{ background: 'var(--r-bg-2)', padding: '12px', borderRadius: 'var(--r-r-md)' }}>
              <div className="section-label">Execution Sequence</div>
              <ul style={{ listStyleType: 'decimal', paddingLeft: '20px', margin: 0, fontFamily: 'var(--r-mono)', fontSize: 'var(--r-sm)' }}>
                {macro.actions?.map((a: any, j: number) => (
                  <li key={j} style={{ padding: '4px 0', borderBottom: j < macro.actions.length - 1 ? '1px solid var(--r-border)' : 'none' }}>
                    <span style={{ color: 'var(--r-danger-text)', fontWeight: 'bold' }}>{a.type}</span>
                    {a.text && <span style={{ color: 'var(--r-text-2)' }}> - "{a.text.substring(0, 50)}{a.text.length > 50 ? '...' : ''}"</span>}
                  </li>
                ))}
                {(!macro.actions || macro.actions.length === 0) && (
                  <li style={{ color: 'var(--r-text-2)', listStyle: 'none', marginLeft: '-20px' }}>No actions defined.</li>
                )}
              </ul>
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
                {explainMacro(macro.name, macro)}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
