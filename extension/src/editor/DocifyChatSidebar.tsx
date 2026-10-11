import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Sparkles, X, PlusCircle, Copy, Check, Loader2 } from 'lucide-react';
import { chatWithDocument } from '../utils/apiClient';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface DocifyChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  getDocumentText: () => string;
  onInsertContent: (content: string) => void;
}

const QUICK_PROMPTS = [
  'Summarize 3 key takeaways',
  'Add a SWOT analysis section',
  'Generate 5 study questions & answers',
  'Check for missing background context'
];

export default function DocifyChatSidebar({
  isOpen,
  onClose,
  documentTitle,
  getDocumentText,
  onInsertContent
}: DocifyChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content: `Hello! I'm your Docify Copilot. You can ask me questions about **${documentTitle || 'your document'}**, ask for new sections, or request improvements.`,
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend.trim(),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    if (!queryText) setInput('');
    setLoading(true);

    try {
      const documentText = getDocumentText();
      const reply = await chatWithDocument({
        query: textToSend.trim(),
        documentTitle: documentTitle || 'Document',
        documentText: documentText.substring(0, 30000) // Reasonable context boundary
      });

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ ${err.message || 'Failed to get response. Please check backend or API settings.'}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar-header">
        <div className="chat-sidebar-title">
          <MessageSquare size={16} color="#6366f1" />
          <span>Docify Copilot</span>
        </div>
        <button className="chat-close-btn" onClick={onClose} title="Close sidebar">
          <X size={16} />
        </button>
      </div>

      <div className="chat-quick-chips">
        {QUICK_PROMPTS.map((prompt, idx) => (
          <button
            key={idx}
            className="chat-chip"
            onClick={() => handleSend(prompt)}
            disabled={loading}
          >
            <Sparkles size={11} />
            <span>{prompt}</span>
          </button>
        ))}
      </div>

      <div className="chat-messages-container">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            <div className="chat-message-bubble">
              <div className="chat-message-text">{msg.content}</div>
              {msg.role === 'assistant' && msg.id !== 'init-1' && (
                <div className="chat-message-actions">
                  <button
                    className="chat-action-btn"
                    onClick={() => onInsertContent(msg.content)}
                    title="Insert directly into document at cursor"
                  >
                    <PlusCircle size={12} />
                    <span>Insert in Doc</span>
                  </button>
                  <button
                    className="chat-action-btn"
                    onClick={() => handleCopy(msg.id, msg.content)}
                    title="Copy response"
                  >
                    {copiedId === msg.id ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
                    <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-message assistant">
            <div className="chat-message-bubble chat-loading-bubble">
              <Loader2 className="animate-spin" size={14} color="#6366f1" />
              <span>Analyzing document...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-bar">
        <input
          type="text"
          placeholder="Ask a question or request a section..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          disabled={loading}
        />
        <button
          className="chat-send-btn"
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          title="Send message"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
