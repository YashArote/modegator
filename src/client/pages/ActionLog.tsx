import React, { useState, useEffect } from 'react';
import { api } from '../api';
import logoLightUrl from '../../logo/moderator_logo.png';
import logoDarkUrl from '../../logo/modegator_logo_dark.png';

export function ActionLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const toggleRow = (index: number) => {
    setExpandedRow(expandedRow === index ? null : index);
  };

  const fetchMoreLogs = () => {
    if (loading || !hasMore) return;
    setLoading(true);
    const cursor = logs.length > 0 ? logs[logs.length - 1].timestamp : undefined;
    api.logs.recent(50, cursor).then(res => {
      const newLogs = res.logs || [];
      if (newLogs.length < 50) setHasMore(false);
      setLogs(prev => [...prev, ...newLogs]);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
      setHasMore(false);
    });
  };

  useEffect(() => {
    fetchMoreLogs();
  }, []);

  return (
    <div className="action-log">
      <div className="card">
        <div className="section-label">Action Logs</div>
        {logs.length === 0 ? (
          <div className="empty-state">
            <img src={logoLightUrl} alt="Modegator Logo" className="empty-logo light-logo" />
            <img src={logoDarkUrl} alt="Modegator Logo" className="empty-logo dark-logo" />
            <div>No logs available</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Target</th>
                <th>Rule</th>
                <th>Action</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <React.Fragment key={i}>
                  <tr 
                    onClick={() => toggleRow(i)} 
                    style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                  >
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
                    <td><span className="badge badge-gray">{log.action.type}</span></td>
                    <td>
                      <span className={`badge ${log.status === 'SUCCESS' ? 'badge-success' : log.status === 'DRY_RUN' ? 'badge-dryrun' : 'badge-danger'}`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                  {expandedRow === i && (
                    <tr style={{ backgroundColor: 'var(--r-bg-2)' }}>
                      <td colSpan={5} style={{ padding: '16px' }}>
                        <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: 'var(--r-xs)', color: 'var(--r-text-2)' }}>
                          ACTION DETAILS
                        </div>
                        <pre className="textarea-code" style={{ minHeight: 'auto', padding: '12px', borderRadius: 'var(--r-r-md)', backgroundColor: 'var(--r-bg-3)', margin: 0, overflowX: 'auto' }}>
                          {JSON.stringify(log.action, null, 2)}
                        </pre>
                        {log.error && (
                          <div style={{ marginTop: '12px' }}>
                            <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: 'var(--r-xs)', color: 'var(--r-danger-text)' }}>
                              ERROR DETAILS
                            </div>
                            <pre className="textarea-code" style={{ minHeight: 'auto', padding: '12px', borderRadius: 'var(--r-r-md)', backgroundColor: 'var(--r-danger-bg)', color: 'var(--r-danger-text)', margin: 0, overflowX: 'auto' }}>
                              {log.error}
                            </pre>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
        
        {logs.length > 0 && hasMore && (
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <button 
              className="btn btn-primary" 
              onClick={fetchMoreLogs}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Load Older Logs'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
