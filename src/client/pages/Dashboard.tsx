import { useState, useEffect } from 'react';
import { api } from '../api';
import logoLightUrl from '../../logo/moderator_logo.png';
import logoDarkUrl from '../../logo/modegator_logo_dark.png';

export function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    api.config.get().then(res => setData(res));
    api.logs.recent(10).then(res => setLogs(res.logs || []));
  }, []);

  if (!data) return <div className="content">Loading dashboard...</div>;

  const config = data.parsed;
  const rulesCount = config?.rules?.length ?? 0;
  const macrosCount = Object.keys(config?.macros ?? {}).length;
  const actionsCount = config?.ui_actions?.length ?? 0;
  const scheduledCount = config?.scheduled?.length ?? 0;

  return (
    <div className="dashboard">
      <div className="card">
        <div className="section-label">Config Health</div>
        {data.hasConfig ? (
          <span className="badge badge-success">Loaded</span>
        ) : (
          <span className="badge badge-warning">No Config</span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        <div className="card" style={{ marginBottom: 0, borderLeft: '4px solid var(--r-orange)' }}>
          <div className="section-label">Active Rules</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{rulesCount}</div>
        </div>
        <div className="card" style={{ marginBottom: 0, borderLeft: '4px solid var(--r-blue)' }}>
          <div className="section-label">Macros</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{macrosCount}</div>
        </div>
        <div className="card" style={{ marginBottom: 0, borderLeft: '4px solid var(--r-success)' }}>
          <div className="section-label">UI Actions</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{actionsCount}</div>
        </div>
        <div className="card" style={{ marginBottom: 0, borderLeft: '4px solid var(--r-warning)' }}>
          <div className="section-label">Scheduled Tasks</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{scheduledCount}</div>
        </div>
      </div>

      <div className="card">
        <div className="section-label">Recent Logs</div>
        {logs.length === 0 ? (
          <div className="empty-state">
            <img src={logoLightUrl} alt="Modegator Logo" className="empty-logo light-logo" />
            <img src={logoDarkUrl} alt="Modegator Logo" className="empty-logo dark-logo" />
            <div>No recent logs</div>
          </div>
        ) : (
          <table style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Target</th>
                <th>Rule Name</th>
                <th>Action</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--r-text-2)', fontSize: 'var(--r-xs)' }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td>
                    {log.targetUrl ? (
                      <span 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(log.targetUrl!);
                          const target = e.currentTarget;
                          const original = target.innerText;
                          target.innerText = 'Copied!';
                          setTimeout(() => target.innerText = original, 2000);
                        }}
                        style={{ cursor: 'pointer', color: 'var(--r-brand-1)', fontWeight: 'bold' }}
                        title="Click to copy target URL"
                      >
                        {log.targetAuthor ? `u/${log.targetAuthor}` : log.targetId || 'View Target'}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--r-text-2)' }}>{log.targetAuthor ? `u/${log.targetAuthor}` : log.targetId || 'N/A'}</span>
                    )}
                  </td>
                  <td><strong>{log.ruleName || 'Manual Action'}</strong></td>
                  <td><span className="badge badge-gray">{log.action?.type || 'Unknown'}</span></td>
                  <td>
                    <span className={`badge ${log.status === 'SUCCESS' ? 'badge-success' : log.status === 'DRY_RUN' ? 'badge-dryrun' : 'badge-danger'}`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
