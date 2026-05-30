import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import _Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-yaml';
import 'prismjs/themes/prism-tomorrow.css';

const Editor = (_Editor as any).default || _Editor;

type FileItem = { id: string; code: string };

export function YamlEditor() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);

  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Use refs to track if undo/redo is available
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    api.config.templates().then(res => setTemplates(res.templates));

    const draft = localStorage.getItem('modkit_yaml_drafts_v2');
    if (draft) {
      try {
        const parsedDraft = JSON.parse(draft);
        setFiles(parsedDraft);
        if (parsedDraft.length > 0) {
          setActiveId(parsedDraft[0].id);
        }
      } catch (e) {
        loadFromServer();
      }
    } else {
      loadFromServer();
    }
  }, []);

  const loadFromServer = () => {
    api.config.get().then(res => {
      const serverFiles: FileItem[] = [];
      if (res.files && Object.keys(res.files).length > 0) {
        Object.entries(res.files).forEach(([name, code]) => {
          serverFiles.push({ id: name, code: code as string });
        });
      } else {
        serverFiles.push({ id: `untitled-${Date.now()}.yml`, code: 'name: New Config\n' });
      }
      setFiles(serverFiles);
      setActiveId(serverFiles[0].id);
    });
  };

  useEffect(() => {
    if (files.length > 0) {
      localStorage.setItem('modkit_yaml_drafts_v2', JSON.stringify(files));
    }
  }, [files]);

  // Check undo/redo availability periodically or on change
  useEffect(() => {
    const updateUndoRedoState = () => {
      // In modern browsers, we can't directly check the native undo stack size,
      // so we assume it's always possible if the editor is focused, or we just leave buttons enabled.
      // We'll leave them enabled since execCommand just fails silently if empty.
      setCanUndo(true);
      setCanRedo(true);
    };
    updateUndoRedoState();
  }, [files]);

  const getDisplayName = (code: string, id: string) => {
    const match = code.match(/^name:\s*(.+)$/m);
    if (match && match[1].trim()) {
      let n = match[1].trim().replace(/['"]/g, '');
      if (!n.endsWith('.yml')) n += '.yml';
      return n;
    }
    return id.endsWith('.yml') ? id : id + '.yml';
  };

  const handleSave = () => performSave(files);

  const performSave = async (filesToSave: FileItem[]) => {
    setErrors([]);
    setSuccess(false);

    const payload: Record<string, string> = {};
    const localErrors: string[] = [];

    for (const f of filesToSave) {
      if (!f.code.trim()) continue; // skip completely empty files

      const match = f.code.match(/^name:\s*(.+)$/m);
      if (!match || !match[1].trim()) {
        localErrors.push(`File missing name: Ensure each file has a "name:" property.`);
        continue;
      }

      let name = match[1].trim().replace(/['"]/g, '');
      if (!name.endsWith('.yml')) name += '.yml';

      if (payload[name]) {
        localErrors.push(`Duplicate file name: Multiple files are named "${name}". Each file must have a unique name.`);
        continue;
      }

      payload[name] = f.code;
    }

    if (localErrors.length > 0) {
      setErrors(localErrors);
      return;
    }

    const result = await api.config.save(payload);
    if (!result.success) {
      setErrors(result.errors || ['Unknown error']);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);

      const newFiles = filesToSave.map(f => ({
        id: getDisplayName(f.code, f.id),
        code: f.code
      }));
      setFiles(newFiles);

      if (activeId) {
        const currentlyActive = filesToSave.find(f => f.id === activeId);
        if (currentlyActive) {
          setActiveId(getDisplayName(currentlyActive.code, activeId));
        }
      }
    }
  };

  const handleLoadTemplate = (templateName: string) => {
    if (!templateName || !activeId) return;
    const newCode = templates[templateName] ?? '';

    // Use native commands so that this action is captured in the native undo stack
    const ta = document.querySelector('.textarea-code') as HTMLTextAreaElement;
    if (ta) {
      ta.focus();
      ta.select();

      // If the template is empty or browsers block insertText, this is a fallback
      const success = document.execCommand('insertText', false, newCode);
      if (!success) {
        updateFileCode(activeId, newCode);
      }
    } else {
      updateFileCode(activeId, newCode);
    }
  };

  const handleAddFile = () => {
    const newId = `untitled-${Date.now()}.yml`;
    setFiles([...files, { id: newId, code: 'name: New Config\n' }]);
    setActiveId(newId);
  };

  const handleDeleteFile = (id: string) => {
    if (deleteConfirmId === id) {
      const newFiles = files.filter(f => f.id !== id);
      if (newFiles.length === 0) {
        newFiles.push({ id: `untitled-${Date.now()}.yml`, code: 'name: New Config\n' });
      }
      setFiles(newFiles);
      if (activeId === id) {
        setActiveId(newFiles[0].id);
      }
      setDeleteConfirmId(null);
      // Auto-save on deletion to keep backend in sync
      setTimeout(() => performSave(newFiles), 0);
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
    }
  };

  const updateFileCode = (id: string, code: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, code } : f));
  };

  const handleUndo = () => {
    const ta = document.querySelector('.textarea-code') as HTMLTextAreaElement;
    if (ta) {
      ta.focus();
      document.execCommand('undo');
    }
  };

  const handleRedo = () => {
    const ta = document.querySelector('.textarea-code') as HTMLTextAreaElement;
    if (ta) {
      ta.focus();
      document.execCommand('redo');
    }
  };

  const activeCode = files.find(f => f.id === activeId)?.code || '';

  const handleExport = () => {
    const dataStr = JSON.stringify(files);
    navigator.clipboard.writeText(dataStr).then(() => {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }).catch(err => {
      setErrors(['Failed to copy to clipboard. Please manually copy the JSON text.']);
    });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          setFiles(imported);
          if (imported.length > 0) setActiveId(imported[0].id);
          // Provide instant feedback
          setSuccess(true);
          setTimeout(() => setSuccess(false), 3000);
        }
      } catch (err) {
        setErrors(['Failed to parse imported file. Please upload a valid Modgator JSON export.']);
      }
    };
    reader.readAsText(file);
    // reset input
    e.target.value = '';
  };

  return (
    <div className="yaml-editor" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => setSidebarVisible(!sidebarVisible)} className="btn btn-outline btn-sm" style={{ padding: '6px' }} aria-label="Toggle Sidebar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarVisible ? (
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="9" y1="3" x2="9" y2="21"></line>
                </>
              ) : (
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="9" y1="3" x2="9" y2="21"></line>
                </>
              )}
            </svg>
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleExport} title="Copy Export JSON to Clipboard" style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          </button>

          <label className="btn btn-outline btn-sm" title="Import JSON config" style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', margin: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </label>

          <select onChange={(e) => handleLoadTemplate(e.target.value)} value="" style={{ maxWidth: '200px', padding: '6px 12px' }}>
            <option value="" disabled>Load Template...</option>
            {Object.keys(templates).map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {success && (
            <span className="badge badge-success" style={{ animation: 'fadeIn 0.3s ease-out', marginRight: '4px' }}>
              Saved
            </span>
          )}
          <button className="btn btn-outline btn-sm" onClick={handleUndo} disabled={!canUndo} aria-label="Undo" style={{ padding: '6px 10px', opacity: canUndo ? 1 : 0.5 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleRedo} disabled={!canRedo} aria-label="Redo" style={{ padding: '6px 10px', opacity: canRedo ? 1 : 0.5 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>

      {errors.length > 0 && (() => {
        const toCanonical = (n: string) =>
          n.toLowerCase().replace(/\.yml$/i, '').replace(/[^a-z0-9]/g, '_') + '.yml';
        const defaultCanonicals = new Set(Object.keys(templates).map(toCanonical));
        const activeIsDefault = defaultCanonicals.has(toCanonical(activeId));
        return (
          <div className="card" style={{ background: 'var(--r-danger-bg)', marginBottom: 0, animation: 'fadeIn 0.2s' }}>
            <div className="section-label" style={{ color: 'var(--r-danger-text)' }}>Validation Errors</div>
            {errors.map((e, i) => <div key={i} className="error-text">! {e}</div>)}
            {activeIsDefault && (
              <div style={{ marginTop: '10px', padding: '8px 10px', background: 'var(--r-bg-3)', borderRadius: '6px', borderLeft: '3px solid var(--r-brand)', fontSize: 'var(--r-sm)', color: 'var(--r-text-2)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--r-text)' }}>💡 Tip:</strong> This is a built-in template file. Templates may be updated after the app is installed — try reloading it from the <strong>Load Template...</strong> dropdown above to get the latest version.
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ display: 'flex', flex: 1, gap: '16px', minHeight: '500px' }}>

        {/* Sidebar File Explorer */}
        {sidebarVisible && (
          <div className="card" style={{ width: '220px', display: 'flex', flexDirection: 'column', padding: 0, marginBottom: 0, transition: 'width 0.2s' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--r-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--r-xs)', fontWeight: 800, textTransform: 'uppercase', color: 'var(--r-text-2)' }}>Files</span>
              <button onClick={handleAddFile} style={{ background: 'none', border: 'none', color: 'var(--r-brand)', cursor: 'pointer', fontWeight: 'bold' }}>+ New</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {files.map(f => {
                const displayName = getDisplayName(f.code, f.id);
                return (
                  <div
                    key={f.id}
                    onClick={() => setActiveId(f.id)}
                    style={{
                      padding: '10px 16px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: activeId === f.id ? 'var(--r-bg-3)' : 'transparent',
                      borderLeft: activeId === f.id ? '3px solid var(--r-brand)' : '3px solid transparent',
                      color: activeId === f.id ? 'var(--r-text)' : 'var(--r-text-2)',
                      fontSize: 'var(--r-sm)',
                      fontWeight: activeId === f.id ? 600 : 400
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.id); }}
                      style={{
                        background: deleteConfirmId === f.id ? 'var(--r-danger)' : 'none',
                        border: 'none',
                        borderRadius: '4px',
                        color: deleteConfirmId === f.id ? 'white' : 'var(--r-danger)',
                        cursor: 'pointer',
                        opacity: (activeId === f.id || deleteConfirmId === f.id) ? 1 : 0,
                        padding: deleteConfirmId === f.id ? '2px 6px' : '2px',
                        fontSize: deleteConfirmId === f.id ? '10px' : '14px',
                        fontWeight: 'bold'
                      }}
                    >
                      {deleteConfirmId === f.id ? 'Sure?' : '×'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Editor Area */}
        <div className="card" style={{ flex: 1, padding: 0, overflow: 'auto', marginBottom: 0 }}>
          <Editor
            key={activeId}
            value={activeCode}
            onValueChange={(c) => updateFileCode(activeId, c)}
            highlight={code => Prism.highlight(code, Prism.languages.yaml, 'yaml')}
            padding={16}
            style={{
              fontFamily: 'var(--r-mono)',
              fontSize: 'var(--r-sm)',
              minHeight: '100%',
              minWidth: 'max-content',
              backgroundColor: 'var(--r-bg-input)',
              color: 'var(--r-text)',
              outline: 'none'
            }}
            textareaClassName="textarea-code"
          />
        </div>
      </div>

      <div className="help-links" style={{ marginTop: 0 }}>
        <a href="https://modegator.netlify.app/" target="_blank">Modegator Documentation</a>
      </div>
    </div>
  );
}
