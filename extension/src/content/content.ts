// Enhanced Content Script with Clean Article Extraction & Selection Detection (Phase 3B)

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

  // 1. Identify primary article container if present
  const articleContainer = document.querySelector('article, [role="main"], main, .article-content, .post-content, #content, .entry-content');
  const root = articleContainer || document.body;

  // Clone so we don't mutate the live page DOM
  const clone = root.cloneNode(true) as HTMLElement;

  // 2. Remove ads, navigation, footers, scripts, comments, and sidebars
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

  // 3. Extract structured headings and paragraphs
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

  // Fallback if structured selectors yielded empty text
  if (!contentText.trim()) {
    contentText = clone.innerText || '';
  }

  return {
    content: contentText.substring(0, 25000).trim(), // 25k character safety boundary
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
