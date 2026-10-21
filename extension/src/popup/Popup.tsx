import React, { useEffect, useRef, useState } from 'react';
import { getDocumentHistory, type SavedDocument } from '../utils/storage';
import {
  generateDocument,
  checkBackendHealth,
  getApiConfig,
  saveApiConfig,
  type ApiConfig
} from '../utils/apiClient';
import { DEFAULT_LANGUAGE_CODE, SUPPORTED_LANGUAGES } from '../utils/languages';
import './popup.css';

interface TabItem {
  id: number;
  title: string;
  url: string;
  checked: boolean;
}

// Inline doc icon matching the floating badge — purple gradient box + white document SVG
const DocIcon = () => (
  <div style={{
    width: 32, height: 32, borderRadius: 11,
    background: 'linear-gradient(135deg, #7c3aed, #8b5cf6, #6366f1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    boxShadow: '0 3px 10px rgba(99,60,220,0.32), inset 0 1px 0 rgba(255,255,255,0.22)'
  }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  </div>
);

// Document type metadata: short description + tag
const DOC_TYPE_META: Record<string, { desc: string; tag: string }> = {
  'Study Notes':                { desc: 'Key concepts, bullet definitions & quick-review points', tag: 'Academic' },
  'Research Report':            { desc: 'Formal findings, data analysis & methodology', tag: 'Academic' },
  'Executive Briefing':         { desc: 'Concise situational summary for senior leadership', tag: 'Business' },
  'Product Requirements (PRD)': { desc: 'Features, user stories & functional requirements', tag: 'Product' },
  'Assignment':                 { desc: 'Thesis-driven academic essay with critical analysis', tag: 'Academic' },
  'SWOT Analysis':              { desc: 'Strengths, Weaknesses, Opportunities & Threats', tag: 'Strategy' },
  'Business Report':            { desc: 'Situation analysis, findings & recommendations', tag: 'Business' },
  'Article':                    { desc: 'Engaging publication-ready article with hook & narrative', tag: 'Media' },
  'Proposal':                   { desc: 'Persuasive proposal with solution & timeline', tag: 'Business' },
  'Technical Documentation':    { desc: 'Architecture, setup guide & API/feature reference', tag: 'Tech' },
  'Legal Documentation':        { desc: 'Formal legal clauses, provisions & disclaimers', tag: 'Legal' },
  'Contract Draft':             { desc: 'Binding contract with parties, terms & obligations', tag: 'Legal' },
  'Terms & Conditions':         { desc: 'User obligations, IP rights & liability limits', tag: 'Legal' },
  'Privacy Policy':             { desc: 'GDPR/CCPA-aligned data collection & rights policy', tag: 'Legal' },
};

const SparkleIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/>
  </svg>
);

const HistoryIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

// ──────────────────────────────────────────────────────────
// Main Popup
// ──────────────────────────────────────────────────────────
export default function Popup() {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [topic, setTopic] = useState('');

  const [pageInfo, setPageInfo] = useState<{
    title: string; url: string; domain: string; content: string;
    hasSelection?: boolean; selectedText?: string;
  } | null>(null);
  const [useSelectionOnly, setUseSelectionOnly] = useState(false);
  const [multiTabMode, setMultiTabMode] = useState(false);
  const [windowTabs, setWindowTabs] = useState<TabItem[]>([]);
  const [docType, setDocType] = useState('Study Notes');
  const [length, setLength] = useState('Medium');
  const [tone, setTone] = useState('Professional');
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE_CODE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<SavedDocument[]>([]);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const active = tabs[0];
      if (active?.id) {
        chrome.tabs.sendMessage(active.id, { action: 'EXTRACT_CONTENT' }, (response) => {
          if (chrome.runtime.lastError) {
            setError('Please refresh the page to use Docify here.');
          } else if (response) {
            setPageInfo(response);
            if (response.hasSelection) setUseSelectionOnly(true);
          }
        });
      }
    });
    loadHistory();
    loadWindowTabs();
  }, []);

  const loadWindowTabs = () => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const items: TabItem[] = tabs
        .filter(t => t.id && t.url && !t.url.startsWith('chrome://'))
        .map((t, idx) => ({ id: t.id!, title: t.title || 'Tab', url: t.url || '', checked: idx === 0 }));
      setWindowTabs(items);
    });
  };

  const loadHistory = async () => {
    const items = await getDocumentHistory();
    setHistory(items);
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
        if (selectedTabs.length === 0) throw new Error('Please select at least one tab.');
        finalTitle = `Synthesized Dossier (${selectedTabs.length} Sources)`;
        finalSourceUrl = selectedTabs.map(t => t.url).join('; ');
        const tabContents: string[] = [];
        for (const tab of selectedTabs) {
          const tabData = await new Promise<{ title?: string; content?: string }>((resolve) => {
            chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_CONTENT' }, (res) => {
              if (chrome.runtime.lastError || !res) resolve({ title: tab.title, content: '(Unable to read tab contents)' });
              else resolve(res);
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

      const generatedData = await generateDocument({
        documentType: docType,
        title: finalTitle,
        sourceUrl: finalSourceUrl,
        content: finalContent,
        length: length.toLowerCase(),
        tone: tone.toLowerCase(),
        topic: topic.trim() || undefined,
        language: SUPPORTED_LANGUAGES.find(item => item.code === language)?.name || 'English'
      });

      chrome.storage.local.set({ docify_current_doc: generatedData }, () => {
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

  // ── Main UI ──
  return (
    <div className="popup-container">
      {/* Ambient blobs — position:absolute via inline style to prevent flex override */}
      <div style={{ position: 'absolute', top: '45%', right: -40, width: 170, height: 170, background: 'radial-gradient(circle at center, rgba(249,168,212,0.28) 0%, rgba(253,200,230,0.14) 45%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none', zIndex: 0, animation: 'floatBlob3 12s ease-in-out infinite' }} />

      {/* Header */}
      <div className="header">
        <DocIcon />
        <div className="header-text">
          <div className="brand">DOCIFY</div>
          <div className="tagline">From web to work, instantly</div>
        </div>
      </div>

      {/* Source card — shown ABOVE tabs always */}
      {!multiTabMode ? (
        !pageInfo && !error ? (
          <div className="source-mini-loading">
            <span className="pulse-dot" />
            Reading page...
          </div>
        ) : pageInfo ? (
          <div className="source-banner">
            <div className="source-banner-left">
              <span className="pulse-dot" />
              <div>
                <div className="source-banner-title">{pageInfo.title || 'Unknown Title'}</div>
                <div className="source-banner-domain">{pageInfo.domain || 'unknown.domain'}</div>
              </div>
            </div>
            {pageInfo.hasSelection && (
              <label className="source-selection-toggle">
                <input
                  type="checkbox"
                  checked={useSelectionOnly}
                  onChange={e => setUseSelectionOnly(e.target.checked)}
                />
                <span>Selection</span>
              </label>
            )}
          </div>
        ) : null
      ) : (
        <div className="source-banner source-banner-multi">
          <span className="pulse-dot pulse-dot-blue" />
          <span className="source-banner-title">
            {windowTabs.filter(t => t.checked).length} tabs selected
          </span>
        </div>
      )}

      {/* Tabs — only Create + History */}
      <div className="tabs">
        <button
          id="tab-create"
          className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
          onClick={() => setActiveTab('create')}
        >
          <SparkleIcon size={12} /> Create
        </button>
        <button
          id="tab-history"
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => { setActiveTab('history'); loadHistory(); }}
        >
          <HistoryIcon /> Recent ({history.length})
        </button>
      </div>

      {/* Error */}
      {error && <div className="error-box">{error}</div>}

      {/* ── HISTORY TAB ── */}
      {activeTab === 'history' && (
        <div className="history-box">
          {history.length === 0 ? (
            <div className="loading">No documents yet. Create your first one!</div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="history-item" onClick={() => openDocumentFromHistory(item)}>
                <div className="history-item-title">{item.title}</div>
                <div className="history-item-meta">
                  <span>{item.documentType}</span>
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── CREATE TAB ── */}
      {activeTab === 'create' && (
        <>
          {/* Multi-tab checklist — only in multi-tab mode */}
          {multiTabMode && (
            <div className="glass-card" style={{ marginBottom: 10 }}>
              <div className="label" style={{ marginBottom: 8 }}>
                Select Tabs ({windowTabs.filter(t => t.checked).length} selected)
              </div>
              <div className="multitab-list">
                {windowTabs.map(tab => (
                  <label key={tab.id} className="multitab-item">
                    <input type="checkbox" checked={tab.checked} onChange={() => toggleTabCheckbox(tab.id)} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}>
                      {tab.title}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="mode-switcher">
            <button
              id="mode-single-page"
              className={`mode-btn ${!multiTabMode ? 'active' : ''}`}
              onClick={() => setMultiTabMode(false)}
            >
              Current Page
            </button>
            <button
              id="mode-multi-tab"
              className={`mode-btn ${multiTabMode ? 'active' : ''}`}
              onClick={() => { setMultiTabMode(true); loadWindowTabs(); }}
            >
              Multi-Tab Document
            </button>
          </div>


          {/* Form: Document Type with description preview */}
          <div className="glass-card" style={{ marginBottom: 0 }}>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Document Type</label>
              <select id="doc-type-select" value={docType} onChange={e => setDocType(e.target.value)}>
                <option value="Study Notes">Study Notes</option>
                <option value="Research Report">Research Report</option>
                <option value="Assignment">Assignment</option>
                <option value="Executive Briefing">Executive Briefing</option>
                <option value="Business Report">Business Report</option>
                <option value="SWOT Analysis">SWOT Analysis</option>
                <option value="Proposal">Proposal</option>
                <option value="Product Requirements (PRD)">Product Requirements (PRD)</option>
                <option value="Technical Documentation">Technical Documentation</option>
                <option value="Article">Article</option>
                <option value="Legal Documentation">Legal Documentation</option>
                <option value="Contract Draft">Contract Draft</option>
                <option value="Terms & Conditions">Terms &amp; Conditions</option>
                <option value="Privacy Policy">Privacy Policy</option>
              </select>
            </div>

            {/* Type description pill */}
            {DOC_TYPE_META[docType] && (
              <div className="type-desc-pill">
                <span className="type-tag">{DOC_TYPE_META[docType].tag}</span>
                <span className="type-desc">{DOC_TYPE_META[docType].desc}</span>
              </div>
            )}

            <div className="row">
              <div className="form-group half">
                <label>Length</label>
                <select id="length-select" value={length} onChange={e => setLength(e.target.value)}>
                  <option value="Short">Short</option>
                  <option value="Medium">Medium</option>
                  <option value="Long">Long</option>
                </select>
              </div>
              <div className="form-group half">
                <label>Tone</label>
                <select id="tone-select" value={tone} onChange={e => setTone(e.target.value)}>
                  <option value="Professional">Professional</option>
                  <option value="Academic">Academic</option>
                  <option value="Executive">Executive</option>
                  <option value="Casual">Casual</option>
                </select>
              </div>
            </div>

            <div className="form-group language-group">
              <label htmlFor="language-select">Generate in</label>
              <select
                id="language-select"
                value={language}
                onChange={e => setLanguage(e.target.value)}
              >
                <optgroup label="Popular">
                  {SUPPORTED_LANGUAGES.filter(item => item.group === 'Popular').map(item => (
                    <option key={item.code} value={item.code}>{item.name} · {item.nativeName}</option>
                  ))}
                </optgroup>
                <optgroup label="Indian languages">
                  {SUPPORTED_LANGUAGES.filter(item => item.group === 'Indian languages').map(item => (
                    <option key={item.code} value={item.code}>{item.name} · {item.nativeName}</option>
                  ))}
                </optgroup>
                <optgroup label="More languages">
                  {SUPPORTED_LANGUAGES.filter(item => item.group === 'All languages').map(item => (
                    <option key={item.code} value={item.code}>{item.name} · {item.nativeName}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <button
              id="create-doc-btn"
              className="create-btn"
              onClick={handleCreate}
              disabled={loading || (!pageInfo && !multiTabMode)}
            >
              {loading ? (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.9s linear infinite', flexShrink: 0 }}><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg> Synthesizing…</>
              ) : (
                <><SparkleIcon size={13} /> {multiTabMode ? 'Create Document' : 'Create Document'}</>
              )}
            </button>
          </div>
        </>
      )}
    <footer className="popup-footer">
      <div className="footer-brand">
        <img src="/favicon.svg" alt="Docify" className="footer-favicon" />
        <span className="footer-version">Docify v1.1</span>
      </div>
      <div className="footer-links">
        <a href="https://github.com/anikettP/Docify/issues/new?template=bug_report.md&title=Bug%3A%20" target="_blank" rel="noopener noreferrer" className="footer-link" id="report-bug-btn" aria-label="Report a bug on GitHub">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Report Bug
        </a>
        <span className="footer-sep">&middot;</span>
        <a href="https://buymeacoffee.com/aniketpate1" target="_blank" rel="noopener noreferrer" className="footer-link" id="sponsor-btn">
          &#9749; Sponsor
        </a>
      </div>
    </footer>
    </div>
  );
}

