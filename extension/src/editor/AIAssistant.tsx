import React, { useState } from 'react';
import { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Sparkles, Wand2, Scissors, Expand, Check, Loader2 } from 'lucide-react';
import { rewriteText } from '../utils/apiClient';
import { DEFAULT_LANGUAGE_CODE, SUPPORTED_LANGUAGES } from '../utils/languages';

interface AIAssistantProps {
  editor: Editor | null;
}

export default function AIAssistant({ editor }: AIAssistantProps) {
  const [loading, setLoading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [targetLanguage, setTargetLanguage] = useState(DEFAULT_LANGUAGE_CODE);

  if (!editor) {
    return null;
  }

  const handleAIAction = async (action: string, instruction?: string) => {
    const selectedText = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      ' '
    );

    if (!selectedText) return;

    setLoading(true);

    try {
      const resultText = await rewriteText({
        operation: action,
        selectedText,
        instruction: instruction || '',
        documentContext: editor.getText().substring(0, 500), // snippet context
        targetLanguage: action === 'translate' ? SUPPORTED_LANGUAGES.find(item => item.code === targetLanguage)?.name : undefined
      });
      
      // Replace selected text with AI result
      editor.chain().focus().insertContent(resultText).run();
      
    } catch (error: any) {
      console.error('AI operation error:', error);
      alert(error.message || 'Failed to apply AI transformation. Please check backend or API settings.');
    } finally {
      setLoading(false);
      setCustomPrompt('');
    }
  };

  return (
    <BubbleMenu editor={editor} className="bubble-menu-container">
      {loading ? (
        <div className="ai-loading">
          <Loader2 className="animate-spin" size={16} />
          <span>Docify is thinking...</span>
        </div>
      ) : (
        <div className="ai-menu">
          <div className="ai-menu-header">
            <Sparkles size={14} />
            <span>Ask Docify</span>
          </div>
          <div className="ai-actions">
            <button onClick={() => handleAIAction('rewrite')}>
              <Wand2 size={14} /> Rewrite
            </button>
            <button onClick={() => handleAIAction('professional')}>
              <Check size={14} /> Professional
            </button>
            <button onClick={() => handleAIAction('shorten')}>
              <Scissors size={14} /> Shorten
            </button>
            <button onClick={() => handleAIAction('expand')}>
              <Expand size={14} /> Expand
            </button>
            <button onClick={() => handleAIAction('translate')}>
              <Sparkles size={14} /> Translate
            </button>
          </div>
          <div className="ai-language-picker">
            <label htmlFor="translate-language">Translate to</label>
            <select
              id="translate-language"
              value={targetLanguage}
              onChange={e => setTargetLanguage(e.target.value)}
            >
              {SUPPORTED_LANGUAGES.map(language => (
                <option key={language.code} value={language.code}>{language.name} · {language.nativeName}</option>
              ))}
            </select>
          </div>
          <div className="ai-custom-prompt">
            <input 
              type="text" 
              placeholder="Custom instruction..." 
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customPrompt) {
                  handleAIAction('custom', customPrompt);
                }
              }}
            />
            <button onClick={() => customPrompt && handleAIAction('custom', customPrompt)}>
              Apply
            </button>
          </div>
        </div>
      )}
    </BubbleMenu>
  );
}
