import React, { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import EditorToolbar from './EditorToolbar';
import AIAssistant from './AIAssistant';
import DocifyChatSidebar from './DocifyChatSidebar';
import { exportToPDF, exportToMarkdown, exportToText, exportToWord } from '../utils/pdfExporter';
import { saveDocumentToHistory } from '../utils/storage';
import { Download, Check, MessageSquare } from 'lucide-react';
import './editor.css';

// Inline doc icon — matches popup badge
const EditorDocIcon = () => (
  <div style={{
    width: 30, height: 30, borderRadius: 10,
    background: 'linear-gradient(135deg, #7c3aed, #8b5cf6, #6366f1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    boxShadow: '0 3px 10px rgba(99,60,220,0.32), inset 0 1px 0 rgba(255,255,255,0.22)'
  }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  </div>
);

function generateHtmlFromDoc(doc: any, docType?: string): string {
  if (!doc) return '';
  if (typeof doc === 'string') return doc;
  if (doc.contentHtml) return doc.contentHtml;

  const stripMarkdown = (text: string) =>
    text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1');

  // Use docType as h1 headline if available, fallback to title
  const headline = docType || doc.documentType || doc.title || 'Untitled Document';
  let html = `<h1>${headline}</h1>`;

  if (doc.summary) {
    html += `<h2>Executive Summary</h2><p>${stripMarkdown(doc.summary)}</p>`;
  }

  if (doc.sections) {
    doc.sections.forEach((section: any) => {
      if (section.heading) html += `<h2>${stripMarkdown(section.heading)}</h2>`;
      if (section.paragraphs) {
        section.paragraphs.forEach((p: string) => {
          html += `<p>${stripMarkdown(p)}</p>`;
        });
      }
      if (section.bullets && section.bullets.length > 0) {
        html += `<ul>`;
        section.bullets.forEach((b: string) => {
          html += `<li><p>${stripMarkdown(b)}</p></li>`;
        });
        html += `</ul>`;
      }
    });
  }

  if (doc.conclusion) {
    html += `<h2>Conclusion</h2><p>${stripMarkdown(doc.conclusion)}</p>`;
  }

  if (doc.references && doc.references.length > 0) {
    html += `<h2>References</h2><ol>`;
    doc.references.forEach((ref: any) => {
      if (ref.url) {
        html += `<li><p><a href="${ref.url}">${ref.title}</a></p></li>`;
      } else {
        html += `<li><p>${ref.title}</p></li>`;
      }
    });
    html += `</ol>`;
  }

  return html;
}

export default function Editor() {
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState('Untitled Document');
  const [docType, setDocType] = useState<string>('');
  const [wordCount, setWordCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'docx' | 'md' | 'txt'>('pdf');
  const [saveStatus, setSaveStatus] = useState('Saved');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const documentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chrome.storage.local.get(['docify_pending_selection', 'docify_current_doc'], (result: { [key: string]: any }) => {
      if (result.docify_pending_selection) {
        const sel = result.docify_pending_selection;
        const html = `<h1>${sel.title}</h1><blockquote><p><strong>Source:</strong> <a href="${sel.sourceUrl}">${sel.sourceUrl}</a></p></blockquote><p>${sel.content.replace(/\n\n/g, '</p><p>')}</p>`;
        setInitialContent(html);
        const title = sel.title || 'Selected Web Research';
        setDocTitle(title);
        saveDocumentToHistory(sel, html);
        chrome.storage.local.remove('docify_pending_selection');
      } else if (result.docify_current_doc) {
        const rawDoc = result.docify_current_doc;
        const type = rawDoc.documentType || rawDoc.docType || '';
        setDocType(type);
        const html = generateHtmlFromDoc(rawDoc, type);
        setInitialContent(html);
        const title = rawDoc.title || type || 'Untitled Document';
        setDocTitle(title);
        saveDocumentToHistory(rawDoc, html);
      } else {
        setInitialContent('<h1>Docify Editor</h1><p>Start editing your document here...</p>');
      }
    });
  }, []);

  const countWords = (text: string) =>
    text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
    ],
    content: initialContent,
    onCreate: ({ editor }) => {
      // Initialise word count as soon as content is loaded
      setWordCount(countWords(editor.getText()));
    },
    onUpdate: ({ editor }) => {
      setWordCount(countWords(editor.getText()));

      setSaveStatus('Saving...');
      const html = editor.getHTML();
      chrome.storage.local.set({ docify_autosave: html }, () => {
        setTimeout(() => setSaveStatus('Saved'), 500);
      });
    }
  }, [initialContent]);

  // Re-sync word count if editor becomes ready after initialContent is set
  useEffect(() => {
    if (editor) setWordCount(countWords(editor.getText()));
  }, [editor]);

  const handleExport = async () => {
    if (!editor) return;
    setIsExporting(true);

    try {
      if (exportFormat === 'pdf') {
        const element = documentRef.current;
        if (element) await exportToPDF(element, docTitle);
      } else if (exportFormat === 'docx') {
        exportToWord(editor.getHTML(), docTitle);
      } else if (exportFormat === 'md') {
        exportToMarkdown(editor.getHTML(), docTitle);
      } else if (exportFormat === 'txt') {
        exportToText(editor.getHTML(), docTitle);
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export document. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleInsertChatContent = (content: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(`<p>${content.replace(/\n\n/g, '</p><p>')}</p>`).run();
  };

  if (!initialContent) {
    return <div className="loading">Loading document...</div>;
  }

  return (
    <div className="editor-layout">
      <div className="editor-topbar">
        <div className="topbar-left">
          {/* Brand — matching popup header */}
          <div className="editor-brand">
            <EditorDocIcon />
            <span className="editor-brand-text">DOCIFY</span>
          </div>

          {/* Doc type badge */}
          {docType && (
            <div className="doc-type-badge">{docType}</div>
          )}

          <input
            type="text"
            className="doc-title-input"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Document Title"
          />
        </div>

        <div className="topbar-actions">
          <button
            className={`copilot-toggle-btn ${isChatOpen ? 'active' : ''}`}
            onClick={() => setIsChatOpen(!isChatOpen)}
            title="Toggle Docify Copilot Chat Sidebar"
          >
            <MessageSquare size={14} />
            <span>Copilot</span>
          </button>

          <span className="save-status">
            <Check size={14} /> {saveStatus}
          </span>

          <div className="export-group">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as any)}
              className="export-select"
            >
              <option value="pdf">PDF (.pdf)</option>
              <option value="docx">Word (.doc)</option>
              <option value="md">Markdown (.md)</option>
              <option value="txt">Plain Text (.txt)</option>
            </select>

            <button
              className="export-btn"
              onClick={handleExport}
              disabled={isExporting}
            >
              <Download size={15} />
              {isExporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>
      </div>

      <div className="editor-content-area">
        <div className="editor-workspace">
          <div className="editor-main">
            <EditorToolbar editor={editor} />

            <div className="tiptap-container" ref={documentRef}>
              <AIAssistant editor={editor} />
              <EditorContent editor={editor} />
            </div>

            <div className="editor-footer">
              <span>Words: {wordCount}</span>
              <span>Characters: {editor?.getText().length || 0}</span>
              {docType && <span className="footer-doctype">{docType}</span>}
            </div>
          </div>
        </div>

        <DocifyChatSidebar
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          documentTitle={docTitle}
          getDocumentText={() => editor?.getText() || ''}
          onInsertContent={handleInsertChatContent}
        />
      </div>
    </div>
  );
}
