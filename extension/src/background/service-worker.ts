// Docify Background Service Worker (Manifest V3)
// Handles context menus and background tab communication

chrome.runtime.onInstalled.addListener(() => {
  console.log('Docify extension installed / updated');

  // Register right-click context menu for selected text
  chrome.contextMenus.create({
    id: 'docify-selection',
    title: 'Docify: Create Document from Selection',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'docify-selection' && info.selectionText) {
    const selectionData = {
      title: tab?.title ? `Research: ${tab.title}` : 'Selected Web Snippet',
      sourceUrl: tab?.url || '',
      content: info.selectionText,
      timestamp: Date.now()
    };

    // Save selection payload to storage so the editor tab can immediately consume it
    chrome.storage.local.set({ docify_pending_selection: selectionData }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('editor.html?from=selection') });
    });
  }
});

// Handle messages from content script (floating badge)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'OPEN_POPUP') {
    // chrome.action.openPopup() works in MV3 service workers (Chrome 99+)
    if (typeof chrome.action?.openPopup === 'function') {
      chrome.action.openPopup().catch(() => {
        // Fallback: open popup page as a new tab if openPopup fails
        chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
      });
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    }
    sendResponse({ ok: true });
  }
  return true;
});
