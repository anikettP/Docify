// Enhanced Content Script — Content Extraction + Persistent Floating Badge

interface ExtractedMetadata {
  title: string;
  url: string;
  domain: string;
  description?: string;
  author?: string;
  publishedDate?: string;
  content: string;
  selectedText?: string;
  hasSelection: boolean;
  headings: string[];
}

function extractMetadata(): { description: string; author: string; publishedDate: string } {
  let description = '';
  let author = '';
  let publishedDate = '';

  const metaDesc = document.querySelector('meta[name="description"], meta[property="og:description"]');
  if (metaDesc) {
    description = metaDesc.getAttribute('content') || '';
  }

  const metaAuthor = document.querySelector('meta[name="author"], meta[property="article:author"], [rel="author"]');
  if (metaAuthor) {
    author = metaAuthor.getAttribute('content') || metaAuthor.textContent?.trim() || '';
  }

  const metaDate = document.querySelector('meta[property="article:published_time"], time[datetime]');
  if (metaDate) {
    publishedDate = metaDate.getAttribute('content') || metaDate.getAttribute('datetime') || '';
  }

  return { description, author, publishedDate };
}

function extractCleanArticleContent(): { content: string; headings: string[] } {
  const headings: string[] = [];

  const articleContainer = document.querySelector('article, [role="main"], main, .article-content, .post-content, #content, .entry-content');
  const root = articleContainer || document.body;

  const clone = root.cloneNode(true) as HTMLElement;

  const boilerplateSelectors = [
    'script', 'style', 'noscript', 'iframe',
    'nav', 'header', 'footer', 'aside',
    '.advertisement', '.ad', '.ads', '.sponsor',
    '.social-share', '.share-buttons', '.share-bar',
    '.cookie-banner', '.gdpr-banner', '#consent-banner',
    '.comments', '#comments', '.disqus',
    '[aria-hidden="true"]', '.hidden'
  ];

  boilerplateSelectors.forEach(selector => {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  });

  const textNodes = Array.from(clone.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, table, blockquote'));
  let contentText = '';

  textNodes.forEach(node => {
    const text = node.textContent?.trim() || '';
    if (!text) return;

    const tagName = node.tagName.toLowerCase();
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      headings.push(text);
      contentText += `\n### ${text}\n\n`;
    } else if (tagName === 'blockquote') {
      contentText += `> ${text}\n\n`;
    } else if (tagName === 'li') {
      contentText += `- ${text}\n`;
    } else {
      contentText += `${text}\n\n`;
    }
  });

  if (!contentText.trim()) {
    contentText = clone.innerText || '';
  }

  return {
    content: contentText.substring(0, 25000).trim(),
    headings: headings.slice(0, 15)
  };
}

function extractFullPageData(): ExtractedMetadata {
  const selection = window.getSelection()?.toString().trim() || '';
  const meta = extractMetadata();
  const { content, headings } = extractCleanArticleContent();

  return {
    title: document.title || 'Untitled Web Page',
    url: window.location.href,
    domain: window.location.hostname,
    description: meta.description,
    author: meta.author,
    publishedDate: meta.publishedDate,
    content,
    selectedText: selection || undefined,
    hasSelection: selection.length > 0,
    headings
  };
}

// ─────────────────────────────────────────────
// Persistent Floating Badge — always visible
// ─────────────────────────────────────────────
function injectFloatingBadge(): void {
  // Don't inject on extension's own pages or if already injected
  if (
    document.getElementById('docify-float-badge') ||
    window.location.protocol === 'chrome-extension:' ||
    window.location.protocol === 'chrome:'
  ) return;

  // ── Styles ──
  const style = document.createElement('style');
  style.textContent = `
    #docify-float-badge {
      position: fixed;
      bottom: 28px;
      right: 24px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px 10px 12px;
      background: rgba(255, 255, 255, 0.72);
      backdrop-filter: blur(28px) saturate(200%);
      -webkit-backdrop-filter: blur(28px) saturate(200%);
      border: 1.5px solid rgba(255, 255, 255, 0.90);
      border-radius: 50px;
      box-shadow:
        0 0 0 0.5px rgba(167, 139, 250, 0.22),
        0 8px 32px rgba(100, 60, 220, 0.18),
        0 2px 8px rgba(0, 0, 0, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 1);
      cursor: pointer;
      transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
      user-select: none;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      animation: docifySlideIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }

    @keyframes docifySlideIn {
      0% { transform: translateY(80px) scale(0.8); opacity: 0; }
      100% { transform: translateY(0) scale(1); opacity: 1; }
    }

    #docify-float-badge:hover {
      transform: translateY(-3px) scale(1.04);
      box-shadow:
        0 0 0 0.5px rgba(167, 139, 250, 0.35),
        0 14px 44px rgba(100, 60, 220, 0.28),
        0 4px 14px rgba(0, 0, 0, 0.10),
        inset 0 1px 0 rgba(255, 255, 255, 1);
    }

    #docify-float-badge:active {
      transform: translateY(0) scale(0.97);
    }

    #docify-float-badge-icon {
      width: 28px;
      height: 28px;
      border-radius: 10px;
      background: linear-gradient(135deg, #7c3aed, #8b5cf6, #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow:
        0 3px 10px rgba(99, 60, 220, 0.30),
        inset 0 1px 0 rgba(255,255,255,0.25);
    }

    #docify-float-badge-icon svg {
      display: block;
    }

    #docify-float-badge-label {
      font-size: 12.5px;
      font-weight: 800;
      letter-spacing: 0.8px;
      background: linear-gradient(135deg, #7c3aed, #6366f1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      line-height: 1;
    }

    /* Ambient glow behind badge */
    #docify-float-badge::before {
      content: '';
      position: absolute;
      inset: -8px;
      border-radius: 60px;
      background: radial-gradient(circle at center,
        rgba(167, 139, 250, 0.18) 0%,
        transparent 70%);
      pointer-events: none;
      z-index: -1;
    }

    /* Pulse ring on the icon */
    #docify-pulse-ring {
      position: absolute;
      top: 50%;
      left: 12px;
      transform: translate(-50%, -50%);
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 1.5px solid rgba(139, 92, 246, 0.40);
      animation: docifyPulse 2.5s ease-out infinite;
      pointer-events: none;
    }

    @keyframes docifyPulse {
      0% { transform: translate(-50%, -50%) scale(1); opacity: 0.7; }
      100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
    }

    /* Dismiss button */
    #docify-float-dismiss {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(255,255,255,0.92);
      border: 1px solid rgba(167,139,250,0.25);
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: #9ca3af;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.10);
      line-height: 1;
    }

    #docify-float-badge:hover #docify-float-dismiss {
      display: flex;
    }
  `;
  document.head.appendChild(style);

  // ── Badge element ──
  const badge = document.createElement('div');
  badge.id = 'docify-float-badge';
  badge.setAttribute('role', 'button');
  badge.setAttribute('aria-label', 'Open Docify — convert this page to a document');
  badge.setAttribute('title', 'Create a document from this page with Docify');

  // Pulse ring
  const pulse = document.createElement('div');
  pulse.id = 'docify-pulse-ring';

  // Icon wrapper
  const iconWrap = document.createElement('div');
  iconWrap.id = 'docify-float-badge-icon';
  iconWrap.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
         stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>`;

  // Label
  const label = document.createElement('span');
  label.id = 'docify-float-badge-label';
  label.textContent = 'DOCIFY';

  // Dismiss button
  const dismiss = document.createElement('div');
  dismiss.id = 'docify-float-dismiss';
  dismiss.innerHTML = '✕';
  dismiss.addEventListener('click', (e) => {
    e.stopPropagation();
    badge.style.animation = 'none';
    badge.style.transform = 'translateY(80px) scale(0.8)';
    badge.style.opacity = '0';
    badge.style.transition = 'all 0.3s ease';
    setTimeout(() => badge.remove(), 300);
  });

  badge.appendChild(pulse);
  badge.appendChild(iconWrap);
  badge.appendChild(label);
  badge.appendChild(dismiss);

  // ── Badge click → directly open the extension popup ──
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ action: 'OPEN_POPUP' });
  });

  document.body.appendChild(badge);
}

// Inject badge after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectFloatingBadge);
} else {
  injectFloatingBadge();
}

// Message handler for Popup and Service Worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'EXTRACT_CONTENT') {
    const data = extractFullPageData();
    sendResponse(data);
  } else if (request.action === 'GET_SELECTION') {
    const selection = window.getSelection()?.toString().trim() || '';
    sendResponse({
      hasSelection: selection.length > 0,
      selectedText: selection,
      title: document.title,
      url: window.location.href
    });
  }
  return true;
});
