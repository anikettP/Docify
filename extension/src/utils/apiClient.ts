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
 * Helper to call Direct Gemini API with multi-model fallback.
 */
async function callGeminiDirectWithFallback(apiKey: string, body: any): Promise<any> {
  const models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest'];
  let lastErrText = '';

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        return await res.json();
      }

      lastErrText = await res.text();
      console.warn(`Direct Gemini model ${model} responded with ${res.status}: ${lastErrText}`);
      // If 503 or 429, fall through to next model
    } catch (e: any) {
      lastErrText = e.message || String(e);
      console.warn(`Direct Gemini call failed on ${model}:`, e);
    }
  }

  throw new Error(`Direct Gemini API calls failed across all models. Details: ${lastErrText}`);
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
  let response: Response | null = null;
  let networkFailed = false;

  try {
    response = await fetch(`${config.backendUrl.replace(/\/$/, '')}/api/documents/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (networkError: any) {
    console.warn('Network call to backend failed:', networkError);
    networkFailed = true;
  }

  if (networkFailed || !response || !response.ok) {
    // Check if we can seamlessly failover to direct Gemini API
    if (config.directApiKey) {
      console.info('Backend request unavailable or returned error; seamlessly falling back to Direct Gemini API...');
      return generateWithDirectGemini(payload, config.directApiKey);
    }

    if (networkFailed || !response) {
      throw new Error(
        `Cannot connect to Docify backend at ${config.backendUrl}. ` +
        `Ensure Spring Boot is running and Chrome Local Network Access (LNA) is permitted, ` +
        `or enter a Gemini API Key in Settings to run in Zero-Backend mode.`
      );
    }

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

  let response: Response | null = null;
  let networkFailed = false;

  try {
    response = await fetch(`${config.backendUrl.replace(/\/$/, '')}/api/documents/ai/rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (networkError: any) {
    console.warn('Network call to backend failed:', networkError);
    networkFailed = true;
  }

  if (networkFailed || !response || !response.ok) {
    if (config.directApiKey) {
      console.info('Falling back to direct Gemini API rewrite...');
      return rewriteWithDirectGemini(payload, config.directApiKey);
    }

    if (networkFailed || !response) {
      throw new Error(
        `Cannot connect to Docify backend for rewrite. Please check backend status or configure a Gemini API key in Settings.`
      );
    }

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

  let response: Response | null = null;
  let networkFailed = false;

  try {
    response = await fetch(`${config.backendUrl.replace(/\/$/, '')}/api/documents/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (networkError: any) {
    console.warn('Network call to backend failed:', networkError);
    networkFailed = true;
  }

  if (networkFailed || !response || !response.ok) {
    if (config.directApiKey) {
      console.info('Falling back to direct Gemini API chat...');
      return chatWithDirectGemini(payload, config.directApiKey);
    }

    if (networkFailed || !response) {
      throw new Error(
        `Cannot connect to Docify backend for chat. Please check backend status or configure a Gemini API key in Settings.`
      );
    }

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
${payload.content.length > 25000 ? payload.content.substring(0, 25000) + '...' : payload.content}

INSTRUCTIONS:
1. Do not invent facts, statistics, or citations.
2. Preserve important source information.
3. Use only supported information.
4. Return ONLY a valid JSON object matching the requested schema.
5. The JSON must contain: title (string), summary (string), sections (array of {heading: string, paragraphs: string[], bullets: string[]}), conclusion (string), references (array of {title: string, url: string}).`;

  const body = {
    contents: [{ parts: [{ text: "You are a helpful assistant that outputs strictly in JSON.\n\n" + prompt }] }],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  const data = await callGeminiDirectWithFallback(apiKey, body);
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('Gemini API returned empty response');
  }

  // Strip code fences if present
  let clean = textContent.trim();
  if (clean.startsWith('```json')) clean = clean.substring(7);
  else if (clean.startsWith('```')) clean = clean.substring(3);
  if (clean.endsWith('```')) clean = clean.substring(0, clean.length() - 3);

  return JSON.parse(clean.trim());
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

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "text/plain"
    }
  };

  const data = await callGeminiDirectWithFallback(apiKey, body);
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

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "text/plain"
    }
  };

  const data = await callGeminiDirectWithFallback(apiKey, body);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
}
