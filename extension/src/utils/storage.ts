export interface SavedDocument {
  id: string;
  title: string;
  documentType: string;
  createdAt: string;
  docData: any;
  contentHtml?: string;
}

export async function saveDocumentToHistory(docData: any, contentHtml?: string): Promise<SavedDocument> {
  return new Promise((resolve) => {
    const id = `doc_${Date.now()}`;
    const newDoc: SavedDocument = {
      id,
      title: docData?.title || 'Untitled Document',
      documentType: docData?.documentType || 'Document',
      createdAt: new Date().toISOString(),
      docData,
      contentHtml
    };

    chrome.storage.local.get(['docify_history'], (result: { [key: string]: any }) => {
      const history: SavedDocument[] = (result.docify_history as SavedDocument[]) || [];
      const updated = [newDoc, ...history].slice(0, 20);
      chrome.storage.local.set({ docify_history: updated }, () => {
        resolve(newDoc);
      });
    });
  });
}

export async function getDocumentHistory(): Promise<SavedDocument[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['docify_history'], (result: { [key: string]: any }) => {
      const history = (result.docify_history as SavedDocument[]) || [];
      resolve(history);
    });
  });
}

export async function deleteDocumentFromHistory(id: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['docify_history'], (result: { [key: string]: any }) => {
      const history: SavedDocument[] = (result.docify_history as SavedDocument[]) || [];
      const updated = history.filter(doc => doc.id !== id);
      chrome.storage.local.set({ docify_history: updated }, () => {
        resolve();
      });
    });
  });
}
