import { useState, useEffect } from 'react';
import { api } from '../api';
import logoLightUrl from '../../logo/moderator_logo.png';
import logoDarkUrl from '../../logo/modegator_logo_dark.png';
import { explainRule } from '../../shared/explainer';

export function RuleEditor({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [explaining, setExplaining] = useState<Record<number, boolean>>({});

  useEffect(() => {
    api.config.get().then(res => setData(res));
  }, []);

  if (!data) return <div className="content">Loading rules...</div>;

  const rules = data.parsed?.rules || [];

  return (
    <div className="rule-editor" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h2 style={{ fontSize: 'var(--r-xl)', color: 'var(--r-text)' }}>Active Rules</h2>
        <button className="btn btn-primary" onClick={() => onNavigate?.('yaml')}>New Rule</button>
      </div>

      {rules.length === 0 ? (
        <div className="card empty-state">
          <img src={logoLightUrl} alt="Modegator Logo" className="empty-logo light-logo" />
          <img src={logoDarkUrl} alt="Modegator Logo" className="empty-logo dark-logo" />
          <div>No rules defined. Head to the YAML editor to create one.</div>
        </div>
      ) : (
        rules.map((rule: any, i: number) => (
          <div key={i} className="card" style={{ borderLeft: '4px solid var(--r-blue)', animation: `fadeIn 0.${3 + i}s ease-out` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong style={{ fontSize: 'var(--r-lg)' }}>{rule.name}</strong>
              <span className="badge badge-gray">{rule.trigger?.event}</span>
            </div>

            <div style={{ background: 'var(--r-bg-2)', padding: '12px', borderRadius: 'var(--r-r-md)', marginBottom: '12px' }}>
              <div className="section-label">Conditions ({rule.condition_logic || 'AND'})</div>
              <ul style={{ listStyleType: 'none', padding: 0, margin: 0, fontFamily: 'var(--r-mono)', fontSize: 'var(--r-sm)' }}>
                {rule.conditions?.map((c: any, j: number) => {
                  const key = Object.keys(c)[0];
                  return (
                    <li key={j} style={{ padding: '4px 0', borderBottom: j < rule.conditions.length - 1 ? '1px solid var(--r-border)' : 'none' }}>
                      <span style={{ color: 'var(--r-orange)' }}>{key}</span>: {typeof c[key] === 'object' ? JSON.stringify(c[key]) : String(c[key])}
                    </li>
                  );
                })}
                {(!rule.conditions || rule.conditions.length === 0) && (
                  <li style={{ color: 'var(--r-text-2)' }}>No conditions (Runs on every trigger)</li>
                )}
              </ul>
            </div>

            <div style={{ background: 'var(--r-bg-2)', padding: '12px', borderRadius: 'var(--r-r-md)' }}>
              <div className="section-label">Actions</div>
              {rule.run_macro ? (
                <div style={{ fontFamily: 'var(--r-mono)', fontSize: 'var(--r-sm)' }}>
                  Run Macro: <span style={{ color: 'var(--r-blue)', fontWeight: 'bold' }}>{rule.run_macro}</span>
                </div>
              ) : (
                <ul style={{ listStyleType: 'none', padding: 0, margin: 0, fontFamily: 'var(--r-mono)', fontSize: 'var(--r-sm)' }}>
                  {rule.actions?.map((a: any, j: number) => (
                    <li key={j} style={{ padding: '4px 0', borderBottom: j < rule.actions.length - 1 ? '1px solid var(--r-border)' : 'none' }}>
                      <span style={{ color: 'var(--r-danger-text)', fontWeight: 'bold' }}>{a.type}</span>
                    </li>
                  ))}
                  {(!rule.actions || rule.actions.length === 0) && (
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
                {explainRule(rule)}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
