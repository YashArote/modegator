import { useState } from 'react';
import { api } from '../api';

export function TestRunner() {
  const [triggerType, setTriggerType] = useState('PostSubmit');
  const [targetId, setTargetId] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    setLoading(true);
    const res = await api.test.run(triggerType, targetId || undefined);
    setResults(res.results || []);
    setLoading(false);
  };

  return (
    <div className="test-runner">
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--r-bg-2)', borderBottom: '2px solid var(--r-border)' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} style={{ flex: 1 }}>
            <option value="PostSubmit">PostSubmit</option>
            <option value="CommentSubmit">CommentSubmit</option>
            <option value="PostReport">PostReport</option>
            <option value="CommentReport">CommentReport</option>
            <option value="PostUpdate">PostUpdate</option>
            <option value="CommentUpdate">CommentUpdate</option>
            <option value="ModMail">ModMail</option>
          </select>
          <input 
            className="input" 
            placeholder="Target ID (e.g. t3_abc)" 
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={handleRun} disabled={loading} style={{ minWidth: '120px' }}>
            {loading ? 'Running...' : 'Run Test'}
          </button>
        </div>
        <div style={{ fontSize: 'var(--r-xs)', color: 'var(--r-text-2)', display: 'flex', justifyContent: 'space-between' }}>
          <span>{targetId ? `Testing against specific ID: ${targetId}` : `Will auto-fetch most recent content for ${triggerType}`}</span>
          <span><a href="https://modegator.netlify.app/core-features/scheduled-tasks" target="_blank" style={{ color: 'var(--r-text-link)', textDecoration: 'none' }}>Scheduled Tasks Docs</a></span>
        </div>
      </div>

      {results && results.length === 0 && (
        <div className="empty-state">No rules matched this trigger type.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {results && results.map((result, i) => (
          <div key={i} className="card" style={{ animation: 'fadeIn 0.3s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
              <strong style={{ fontSize: 'var(--r-lg)' }}>{result.ruleName}</strong>
              <span className={`badge ${result.matched ? 'badge-success' : 'badge-gray'}`} style={{ padding: '4px 10px' }}>
                {result.matched ? 'MATCHED' : 'NOT MATCHED'}
              </span>
            </div>

            <table style={{ marginBottom: '16px', border: '1px solid var(--r-border)' }}>
              <thead>
                <tr>
                  <th>Condition</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.conditionResults.map((c: any, j: number) => (
                  <tr key={j}>
                    <td style={{ fontFamily: 'var(--r-mono)' }}>{c.conditionKey}</td>
                    <td style={{ fontFamily: 'var(--r-mono)' }}>{String(c.expectedValue)}</td>
                    <td style={{ fontFamily: 'var(--r-mono)' }}>{String(c.actualValue)}</td>
                    <td>{c.passed ? '✅ Pass' : '❌ Fail'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {result.actionLogs.length > 0 && (
              <div style={{ background: 'var(--r-bg-3)', padding: '12px', borderRadius: 'var(--r-r-md)' }}>
                <div className="section-label" style={{ marginBottom: '8px' }}>Simulated Actions (Dry Run)</div>
                {result.actionLogs.map((log: any, j: number) => (
                  <div key={j} style={{ fontFamily: 'var(--r-mono)', padding: '6px 0', borderBottom: j < result.actionLogs.length - 1 ? '1px solid var(--r-border)' : 'none', color: 'var(--r-text)', fontSize: 'var(--r-sm)' }}>
                    <span className="badge badge-dryrun" style={{ marginRight: '8px' }}>DRY_RUN</span>
                    {log.action.type} <span style={{ color: 'var(--r-text-2)' }}>{JSON.stringify(log.action).substring(0, 100)}...</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
