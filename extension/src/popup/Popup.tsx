import React, { useEffect, useState } from 'react';
import { getDocumentHistory, type SavedDocument } from '../utils/storage';
import {
  generateDocument,
  checkBackendHealth,
  getApiConfig,
  saveApiConfig,
  type ApiConfig
} from '../utils/apiClient';

interface TabItem {
  id: number;
  title: string;
  url: string;
  checked: boolean;
}

export default function Popup() {
  const [activeTab, setActiveTab] = useState<'create' | 'history' | 'settings'>('create');
  const [pageInfo, setPageInfo] = useState<{
    title: string;
    url: string;
    domain: string;
    content: string;
    hasSelection?: boolean;
    selectedText?: string;
  } | null>(null);
  const [useSelectionOnly, setUseSelectionOnly] = useState(false);
  
  // Multi-tab research state
  const [multiTabMode, setMultiTabMode] = useState(false);
  const [windowTabs, setWindowTabs] = useState<TabItem[]>([]);

  const [docType, setDocType] = useState('Study Notes');
  const [length, setLength] = useState('Medium');
  const [tone, setTone] = useState('Professional');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<SavedDocument[]>([]);

  // Settings & LNA diagnostics state
  const [config, setConfig] = useState<ApiConfig>({
    backendUrl: 'http://localhost:8080',
    directApiKey: '',
    useDirectMode: false
  });
  const [healthStatus, setHealthStatus] = useState<{ checked: boolean; ok: boolean; message: string }>({
    checked: false,
    ok: false,
    message: ''
  });
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    // Get current tab and extract content
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const active = tabs[0];
      if (active?.id) {
        chrome.tabs.sendMessage(active.id, { action: 'EXTRACT_CONTENT' }, (response) => {
          if (chrome.runtime.lastError) {
            console.log(chrome.runtime.lastError);
            setError('Please refresh the page to use Docify here.');
          } else if (response) {
            setPageInfo(response);
            if (response.hasSelection) {
              setUseSelectionOnly(true);
            }
          }
        });
      }
    });

    loadHistory();
    loadSettings();
    loadWindowTabs();
  }, []);

  const loadWindowTabs = () => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const items: TabItem[] = tabs
        .filter(t => t.id && t.url && !t.url.startsWith('chrome://'))
        .map((t, idx) => ({
          id: t.id!,
          title: t.title || 'Tab',
          url: t.url || '',
          checked: idx === 0 // default first / active tab checked
        }));
      setWindowTabs(items);
    });
  };

  const loadHistory = async () => {
    const items = await getDocumentHistory();
    setHistory(items);
  };

  const loadSettings = async () => {
    const cfg = await getApiConfig();
    setConfig(cfg);
  };

  const handleCheckHealth = async () => {
    setHealthStatus({ checked: false, ok: false, message: 'Checking...' });
    const res = await checkBackendHealth(config.backendUrl);
    setHealthStatus({ checked: true, ok: res.ok, message: res.message });
  };

  const handleSaveSettings = async () => {
    setSavingConfig(true);
    await saveApiConfig(config);
    setTimeout(() => setSavingConfig(false), 500);
  };

  const toggleTabCheckbox = (tabId: number) => {
    setWindowTabs(prev => prev.map(t => t.id === tabId ? { ...t, checked: !t.checked } : t));
  };

  const handleCreate = async () => {
    setLoading(true);
    setError('');

    try {
      let finalContent = '';
      let finalTitle = pageInfo?.title || 'Multi-Source Document';
      let finalSourceUrl = pageInfo?.url || 'Multiple Web Sources';

      if (multiTabMode) {
        const selectedTabs = windowTabs.filter(t => t.checked);
        if (selectedTabs.length === 0) {
          throw new Error('Please select at least one tab for multi-source synthesis.');
        }

        finalTitle = `Synthesized Dossier (${selectedTabs.length} Sources)`;
        finalSourceUrl = selectedTabs.map(t => t.url).join('; ');

        // Gather content from selected tabs
        const tabContents: string[] = [];
        for (const tab of selectedTabs) {
          const tabData = await new Promise<{ title?: string; content?: string }>((resolve) => {
            chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_CONTENT' }, (res) => {
              if (chrome.runtime.lastError || !res) {
                resolve({ title: tab.title, content: '(Unable to read tab contents)' });
              } else {
                resolve(res);
              }
            });
          });

          tabContents.push(`=== SOURCE: ${tabData.title || tab.title} (${tab.url}) ===\n${tabData.content || ''}`);
        }

        finalContent = tabContents.join('\n\n');
      } else {
        if (!pageInfo) throw new Error('No page content available.');

        if (useSelectionOnly && pageInfo.selectedText) {
          finalContent = `[USER HIGHLIGHTED SELECTION]:\n${pageInfo.selectedText}`;
          finalTitle = `Focus: ${pageInfo.title}`;
        } else {
          finalContent = pageInfo.content;
          finalTitle = pageInfo.title;
        }
      }

      const payload = {
        documentType: docType,
        title: finalTitle,
        sourceUrl: finalSourceUrl,
        content: finalContent,
        length: length.toLowerCase(),
        tone: tone.toLowerCase()
      };

      const generatedData = await generateDocument(payload);

      // Store the result in local storage so the editor tab can pick it up
      chrome.storage.local.set({ docify_current_doc: generatedData }, () => {
        // Open the editor in a new tab
        chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
      });
    } catch (err: any) {
      setError(err.message || 'An error occurred during document generation.');
    } finally {
      setLoading(false);
    }
  };

  const openDocumentFromHistory = (item: SavedDocument) => {
    chrome.storage.local.set({ docify_current_doc: item.docData }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
    });
  };

  return (
    <div className="popup-container">
      <div className="header">
        <h1 className="brand">DOCIFY</h1>
        <p className="tagline">From web to work, instantly (Gemini AI Powered)</p>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
        <button 
          onClick={() => setActiveTab('create')}
          style={{
            flex: 1,
            padding: '6px',
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'create' ? '#6366f1' : 'transparent',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 600
          }}
        >
          New Doc
        </button>
        <button 
          onClick={() => { setActiveTab('history'); loadHistory(); }}
          style={{
            flex: 1,
            padding: '6px',
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'history' ? '#6366f1' : 'transparent',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 600
          }}
        >
          Recent ({history.length})
        </button>
        <button 
          onClick={() => { setActiveTab('settings'); handleCheckHealth(); }}
          style={{
            flex: 1,
            padding: '6px',
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'settings' ? '#6366f1' : 'transparent',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 600
          }}
        >
          LNA / Settings
        </button>
      </div>

      {error && (
        <div className="error-box" style={{marginBottom: '14px', fontSize: '12px', lineHeight: '1.4'}}>
          {error}
        </div>
      )}

      {activeTab === 'settings' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
          <div style={{ padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid #334155' }}>
            <div style={{ fontWeight: 600, color: '#f8fafc', marginBottom: '6px' }}>Local Network Access (LNA) Status</div>
            <div style={{ color: '#94a3b8', marginBottom: '8px', fontSize: '11px' }}>
              Chrome LNA Phase 3 checks extension access to local servers.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <button
                onClick={handleCheckHealth}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: '1px solid #6366f1',
                  background: '#6366f1',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                Test Connection
              </button>
              {healthStatus.checked && (
                <span style={{ color: healthStatus.ok ? '#4ade80' : '#f87171', fontWeight: 600, fontSize: '11px' }}>
                  {healthStatus.ok ? '🟢 Online & LNA Ready' : '🔴 Server Unavailable'}
                </span>
              )}
            </div>
            {healthStatus.message && (
              <div style={{ fontSize: '11px', color: healthStatus.ok ? '#94a3b8' : '#fca5a5' }}>
                {healthStatus.message}
              </div>
            )}
          </div>

          <div style={{ padding: '10px', borderRadius: '8px', background: '#1e293b', border: '1px solid #334155' }}>
            <div style={{ fontWeight: 600, color: '#f8fafc', marginBottom: '6px' }}>Zero-Backend Direct Mode</div>
            <div style={{ color: '#94a3b8', marginBottom: '8px', fontSize: '11px' }}>
              Bypass local network calls completely by using your Gemini API Key directly.
            </div>
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '4px', fontSize: '11px' }}>
                Gemini API Key:
              </label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={config.directApiKey}
                onChange={(e) => setConfig({ ...config, directApiKey: e.target.value })}
                style={{
                  width: '100%',
                  padding: '6px',
                  borderRadius: '4px',
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: '#fff',
                  fontSize: '11px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#cbd5e1', cursor: 'pointer', fontSize: '11px' }}>
              <input
                type="checkbox"
                checked={config.useDirectMode}
                onChange={(e) => setConfig({ ...config, useDirectMode: e.target.checked })}
              />
              Force Direct Client Mode (Serverless)
            </label>
          </div>

          <button
            onClick={handleSaveSettings}
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: 'none',
              background: '#22c55e',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px'
            }}
          >
            {savingConfig ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      ) : activeTab === 'history' ? (
        <div className="history-box" style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {history.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '16px' }}>
              No recent documents saved yet.
            </div>
          ) : (
            history.map((item) => (
              <div 
                key={item.id} 
                onClick={() => openDocumentFromHistory(item)}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  background: '#1e293b',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  border: '1px solid #334155',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '13px' }}>{item.title}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  <span>{item.documentType}</span>
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {/* Mode Switcher: Single Page vs Multi-Tab Research */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <button
              onClick={() => setMultiTabMode(false)}
              style={{
                flex: 1,
                padding: '5px',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: !multiTabMode ? '#6366f1' : '#334155',
                background: !multiTabMode ? '#312e81' : '#1e293b',
                color: '#fff',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              📄 Current Page
            </button>
            <button
              onClick={() => { setMultiTabMode(true); loadWindowTabs(); }}
              style={{
                flex: 1,
                padding: '5px',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: multiTabMode ? '#6366f1' : '#334155',
                background: multiTabMode ? '#312e81' : '#1e293b',
                color: '#fff',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              📑 Multi-Tab Dossier
            </button>
          </div>

          {!multiTabMode ? (
            !pageInfo && !error ? (
              <div className="loading">Reading webpage...</div>
            ) : pageInfo ? (
              <div className="content-box">
                <div className="current-page">
                  <span className="label">Current Source</span>
                  <hr />
                  <div className="page-title">{pageInfo.title || 'Unknown Title'}</div>
                  <div className="page-domain">{pageInfo.domain || 'unknown.domain'}</div>
                </div>

                {/* Highlight Selection Badge */}
                {pageInfo.hasSelection && (
                  <div style={{
                    margin: '8px 0',
                    padding: '8px',
                    borderRadius: '6px',
                    background: '#312e81',
                    border: '1px solid #6366f1',
                    fontSize: '11px'
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#e0e7ff', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={useSelectionOnly}
                        onChange={(e) => setUseSelectionOnly(e.target.checked)}
                      />
                      <span>✨ Use Highlighted Selection Only</span>
                    </label>
                    <div style={{ color: '#c7d2fe', fontSize: '10px', marginTop: '3px' }}>
                      "{pageInfo.selectedText?.substring(0, 80)}..."
                    </div>
                  </div>
                )}
              </div>
            ) : null
          ) : (
            /* Multi-Tab Selector View */
            <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px', marginBottom: '12px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', marginBottom: '6px' }}>
                Select Tabs to Synthesize ({windowTabs.filter(t => t.checked).length} selected)
              </div>
              <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {windowTabs.map((tab) => (
                  <label key={tab.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#cbd5e1', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={tab.checked}
                      onChange={() => toggleTabCheckbox(tab.id)}
                    />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '280px' }}>
                      {tab.title}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Form Options */}
          <div className="content-box" style={{ marginTop: '4px' }}>
            <div className="form-group">
              <label>Document Template / Type</label>
              <select value={docType} onChange={e => setDocType(e.target.value)}>
                <option value="Research Report">Research Report</option>
                <option value="Product Requirements (PRD)">Product Requirements (PRD)</option>
                <option value="Study Notes">Study Notes</option>
                <option value="Executive Briefing">Executive Briefing</option>
                <option value="Assignment">Assignment</option>
                <option value="SWOT Analysis">SWOT Analysis</option>
                <option value="Business Report">Business Report</option>
                <option value="Article">Article</option>
                <option value="Proposal">Proposal</option>
                <option value="Technical Documentation">Technical Documentation</option>
              </select>
            </div>

            <div className="row">
              <div className="form-group half">
                <label>Length:</label>
                <select value={length} onChange={e => setLength(e.target.value)}>
                  <option value="Short">Short</option>
                  <option value="Medium">Medium</option>
                  <option value="Long">Long</option>
                </select>
              </div>
              <div className="form-group half">
                <label>Tone:</label>
                <select value={tone} onChange={e => setTone(e.target.value)}>
                  <option value="Professional">Professional</option>
                  <option value="Academic">Academic</option>
                  <option value="Executive">Executive</option>
                  <option value="Casual">Casual</option>
                </select>
              </div>
            </div>

            <button 
              className="create-btn" 
              onClick={handleCreate} 
              disabled={loading || (!pageInfo && !multiTabMode)}
            >
              {loading ? 'Synthesizing with Gemini...' : multiTabMode ? 'Synthesize Multi-Tab Dossier' : 'Create with Docify'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
