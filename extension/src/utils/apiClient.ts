// Centralized API Client for Docify
// Implements Chrome Local Network Access (LNA) Phase 3 resilience,
// health diagnostic checks, and Zero-Backend Direct Gemini API fallback.

export interface GeneratePayload {
  documentType: string;
  title: string;
  sourceUrl: string;
  content: string;
  length: string;
  tone: string;
}

export interface GeneratedDocumentResponse {
  title: string;
  summary: string;
  sections: Array<{
    heading: string;
    paragraphs: string[];
    bullets: string[];
  }>;
  conclusion: string;
  references: Array<{
    title: string;
    url: string;
  }>;
}

export interface RewritePayload {
  operation: string;
  selectedText: string;
  instruction?: string;
  documentContext: string;
}

export interface ApiConfig {
  backendUrl: string;
  directApiKey: string;
  useDirectMode: boolean;
}

const DEFAULT_CONFIG: ApiConfig = {
  backendUrl: 'http://localhost:8080',
  directApiKey: '',
  useDirectMode: false
};

export async function getApiConfig(): Promise<ApiConfig> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['docify_config'], (result: { [key: string]: any }) => {
      resolve((result.docify_config as ApiConfig) || DEFAULT_CONFIG);
    });
  });
}

export async function saveApiConfig(config: ApiConfig): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ docify_config: config }, () => {
      resolve();
    });
  });
}

/**
 * Checks health of the local Spring Boot backend.
 */
export async function checkBackendHealth(baseUrl?: string): Promise<{ ok: boolean; message: string; data?: any }> {
  const config = await getApiConfig();
  const url = (baseUrl || config.backendUrl).replace(/\/$/, '') + '/api/health';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      return { ok: true, message: 'Backend is healthy and LNA compliant', data };
    } else {
      return { ok: false, message: `Backend responded with HTTP status ${response.status}` };
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { ok: false, message: 'Connection to backend timed out (2.5s).' };
    }
    return {
      ok: false,
      message: 'Failed to connect to local server. Chrome Local Network Access (LNA) or offline server.'
    };
  }
}

/**
 * Generates a document using Spring Boot backend or Direct Gemini API fallback.
 */
export async function generateDocument(payload: GeneratePayload): Promise<GeneratedDocumentResponse> {
  const config = await getApiConfig();

  // If user explicitly configured direct client mode
  if (config.useDirectMode && config.directApiKey) {
    return generateWithDirectGemini(payload, config.directApiKey);
  }

  // Attempt local Spring Boot backend call
  let response: Response;
  try {
    response = await fetch(`${config.backendUrl.replace(/\/$/, '')}/api/documents/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (networkError: any) {
    console.warn('Network call to backend failed:', networkError);

    // Fallback: If user has a direct API key saved, seamlessly fall back
    if (config.directApiKey) {
      console.info('Falling back to direct Gemini API mode...');
      return generateWithDirectGemini(payload, config.directApiKey);
    }

    throw new Error(
      `Cannot connect to Docify backend at ${config.backendUrl}. ` +
      `Ensure Spring Boot is running and Chrome Local Network Access (LNA) is permitted, ` +
      `or enter a Gemini API Key in 'LNA / Settings' to run in Zero-Backend mode.`
    );
  }

  if (!response.ok) {
    let errMsg = `Backend error (${response.status})`;
    try {
      const errJson = await response.json();
      errMsg = errJson.error || errJson.message || errMsg;
    } catch {
      const errText = await response.text();
      if (errText) errMsg = errText;
    }
    throw new Error(errMsg);
  }

  return await response.json();
}

/**
 * Rewrites text using Spring Boot backend or Direct Gemini API fallback.
 */
export async function rewriteText(payload: RewritePayload): Promise<string> {
  const config = await getApiConfig();

  if (config.useDirectMode && config.directApiKey) {
    return rewriteWithDirectGemini(payload, config.directApiKey);
  }

  let response: Response;
  try {
    response = await fetch(`${config.backendUrl.replace(/\/$/, '')}/api/documents/ai/rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (networkError: any) {
    console.warn('Network call to backend failed:', networkError);

    if (config.directApiKey) {
      console.info('Falling back to direct Gemini API rewrite...');
      return rewriteWithDirectGemini(payload, config.directApiKey);
    }

    throw new Error(
      `Cannot connect to Docify backend for rewrite. Please check backend status or configure a Gemini API key in Settings.`
    );
  }

  if (!response.ok) {
    let errMsg = `Backend rewrite error (${response.status})`;
    try {
      const errJson = await response.json();
      errMsg = errJson.error || errJson.message || errMsg;
    } catch {
      const errText = await response.text();
      if (errText) errMsg = errText;
    }
    throw new Error(errMsg);
  }

  const data = await response.json();
  return data.result;
}

export interface ChatPayload {
  query: string;
  documentTitle: string;
  documentText: string;
}

/**
 * Chat with the document using Spring Boot backend or Direct Gemini API fallback.
 */
export async function chatWithDocument(payload: ChatPayload): Promise<string> {
  const config = await getApiConfig();

  if (config.useDirectMode && config.directApiKey) {
    return chatWithDirectGemini(payload, config.directApiKey);
  }

  let response: Response;
  try {
    response = await fetch(`${config.backendUrl.replace(/\/$/, '')}/api/documents/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (networkError: any) {
    console.warn('Network call to backend failed:', networkError);

    if (config.directApiKey) {
      console.info('Falling back to direct Gemini API chat...');
      return chatWithDirectGemini(payload, config.directApiKey);
    }

    throw new Error(
      `Cannot connect to Docify backend for chat. Please check backend status or configure a Gemini API key in Settings.`
    );
  }

  if (!response.ok) {
    let errMsg = `Backend chat error (${response.status})`;
    try {
      const errJson = await response.json();
      errMsg = errJson.error || errJson.message || errMsg;
    } catch {
      const errText = await response.text();
      if (errText) errMsg = errText;
    }
    throw new Error(errMsg);
  }

  const data = await response.json();
  return data.reply;
}

/**
 * Direct Client-Side Gemini Fallback: Generates document directly via Google Generative Language API.
 */
async function generateWithDirectGemini(payload: GeneratePayload, apiKey: string): Promise<GeneratedDocumentResponse> {
  const prompt = `You are an expert document assistant. Your task is to generate a structured '${payload.documentType}' based on the following web content.

Source Title: ${payload.title}
Source URL: ${payload.sourceUrl}
Requested Length: ${payload.length}
Requested Tone: ${payload.tone}

Content:
${payload.content}

INSTRUCTIONS:
1. Do not invent facts, statistics, or citations.
2. Preserve important source information.
3. Use only supported information.
4. Return ONLY a valid JSON object matching the requested schema.
5. The JSON must contain: title (string), summary (string), sections (array of {heading: string, paragraphs: string[], bullets: string[]}), conclusion (string), references (array of {title: string, url: string}).`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: "You are a helpful assistant that outputs strictly in JSON.\n\n" + prompt }] }],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Direct Gemini API failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('Gemini API returned empty response');
  }

  return JSON.parse(textContent);
}

/**
 * Direct Client-Side Gemini Fallback: Rewrites text directly via Google Generative Language API.
 */
async function rewriteWithDirectGemini(payload: RewritePayload, apiKey: string): Promise<string> {
  const prompt = `You are Docify's professional editing assistant. You must modify the SELECTED TEXT based on the requested operation.

OPERATION: ${payload.operation}
${payload.instruction ? `CUSTOM INSTRUCTION: ${payload.instruction}\n` : ''}
DOCUMENT CONTEXT (for reference only):
${payload.documentContext}

SELECTED TEXT TO MODIFY:
${payload.selectedText}

RULES:
- Return ONLY the modified text.
- Do not include explanations or markdown formatting like \`\`\` unless returning a code block.
- Preserve the core meaning but apply the requested style/operation.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "text/plain"
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Direct Gemini rewrite failed (${response.status})`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || payload.selectedText;
}

/**
 * Direct Client-Side Gemini Fallback: Converses with document directly via Google Generative Language API.
 */
async function chatWithDirectGemini(payload: ChatPayload, apiKey: string): Promise<string> {
  const prompt = `You are Docify's intelligent document assistant. Help the user understand, expand, refine, or query their document.

DOCUMENT TITLE: ${payload.documentTitle || 'Untitled Document'}

DOCUMENT CONTENT:
${payload.documentText}

USER INQUIRY / TASK:
${payload.query}

INSTRUCTIONS:
- Provide clear, concise, well-structured responses.
- If the user asks for a new section, draft, or additions, format them cleanly using standard Markdown so it can be easily inserted into the document.
- Cite claims based strictly on the document context.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "text/plain"
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Direct Gemini chat failed (${response.status})`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
}

