import React, { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import EditorToolbar from './EditorToolbar';
import AIAssistant from './AIAssistant';
import DocifyChatSidebar from './DocifyChatSidebar';
import { exportToPDF, exportToMarkdown, exportToText } from '../utils/pdfExporter';
import { saveDocumentToHistory } from '../utils/storage';
import { Download, Check, MessageSquare } from 'lucide-react';
import './editor.css';

function generateHtmlFromDoc(doc: any): string {
  if (!doc) return '';
  // If doc is already HTML string
  if (typeof doc === 'string') return doc;
  if (doc.contentHtml) return doc.contentHtml;

  let html = `<h1>${doc.title || 'Untitled Document'}</h1>`;
  
  if (doc.summary) {
    html += `<h2>Executive Summary</h2><p>${doc.summary}</p>`;
  }

  if (doc.sections) {
    doc.sections.forEach((section: any) => {
      if (section.heading) html += `<h2>${section.heading}</h2>`;
      if (section.paragraphs) {
        section.paragraphs.forEach((p: string) => {
          html += `<p>${p}</p>`;
        });
      }
      if (section.bullets && section.bullets.length > 0) {
        html += `<ul>`;
        section.bullets.forEach((b: string) => {
          html += `<li><p>${b}</p></li>`;
        });
        html += `</ul>`;
      }
    });
  }

  if (doc.conclusion) {
    html += `<h2>Conclusion</h2><p>${doc.conclusion}</p>`;
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
  const [wordCount, setWordCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'md' | 'txt'>('pdf');
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
        const html = generateHtmlFromDoc(rawDoc);
        setInitialContent(html);
        const title = rawDoc.title || 'Untitled Document';
        setDocTitle(title);
        // Save to document history
        saveDocumentToHistory(rawDoc, html);
      } else {
        setInitialContent('<h1>Docify Editor</h1><p>Start editing your document here...</p>');
      }
    });
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      const words = text.split(/\s+/).filter(word => word.length > 0).length;
      setWordCount(words);
      
      setSaveStatus('Saving...');
      const html = editor.getHTML();
      chrome.storage.local.set({ docify_autosave: html }, () => {
        setTimeout(() => setSaveStatus('Saved'), 500);
      });
    }
  }, [initialContent]);

  const handleExport = async () => {
    if (!editor) return;
    setIsExporting(true);

    try {
      if (exportFormat === 'pdf') {
        const element = documentRef.current;
        if (element) {
          await exportToPDF(element, docTitle);
        }
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
          <div className="logo">Docify</div>
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
              <option value="pdf">PDF Document (.pdf)</option>
              <option value="md">Markdown (.md)</option>
              <option value="txt">Text File (.txt)</option>
            </select>

            <button 
              className="export-btn" 
              onClick={handleExport}
              disabled={isExporting}
            >
              <Download size={16} />
              {isExporting ? 'Exporting...' : `Export ${exportFormat.toUpperCase()}`}
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
              <span>Model: Google Gemini</span>
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
