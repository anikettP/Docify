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
  topic?: string;  // Optional: write document about this topic using the page as source
  language?: string;
}

export interface GeneratedDocumentResponse {
  title: string;
  summary: string;
  language?: string;
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
  targetLanguage?: string;
}

export interface ApiConfig {
  backendUrl: string;
  directApiKey: string;
  useDirectMode: boolean;
}

// Your Gemini API key — baked in at build time from .env file.
// Users never need to enter a key. This is YOUR key powering the extension.
const BUILT_IN_API_KEY: string = import.meta.env.VITE_GEMINI_API_KEY || '';

const DEFAULT_CONFIG: ApiConfig = {
  backendUrl: 'http://localhost:8080',
  directApiKey: BUILT_IN_API_KEY,
  useDirectMode: true
};

export async function getApiConfig(): Promise<ApiConfig> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['docify_config'], (result: { [key: string]: any }) => {
      const saved = result.docify_config as ApiConfig | undefined;
      if (saved) {
        // Always ensure the built-in key is used if user hasn't set their own
        if (!saved.directApiKey) saved.directApiKey = BUILT_IN_API_KEY;
        resolve(saved);
      } else {
        resolve(DEFAULT_CONFIG);
      }
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
  const models = ['gemini-flash-lite-latest', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
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

    // Friendly rate limit message
    if (response.status === 429) {
      throw new Error(`⏳ You've reached Docify's free daily limit. Please try again tomorrow, or add your own Gemini API key in Settings for unlimited use.`);
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

    if (response.status === 429) {
      throw new Error(`⏳ Daily free limit reached. Try again tomorrow or add your Gemini API key in Settings.`);
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

    if (response.status === 429) {
      throw new Error(`⏳ Daily free limit reached. Try again tomorrow or add your Gemini API key in Settings.`);
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
  const src = payload.content.length > 25000 ? payload.content.substring(0, 25000) + '...' : payload.content;
  const meta = `Source Title: ${payload.title}\nSource URL: ${payload.sourceUrl}\nLength: ${payload.length}\nTone: ${payload.tone}\nOutput Language: ${payload.language || 'English'}`;
  const schema = `Return ONLY a valid JSON object with: title (string), summary (string), sections (array of {heading: string, paragraphs: string[], bullets: string[]}), conclusion (string), references (array of {title: string, url: string}).`;

  // Per-type expert prompts
  const typePrompts: Record<string, string> = {
    'Study Notes': `You are an expert academic tutor creating concise STUDY NOTES.
${meta}
SOURCE: ${src}
Create structured study notes with: key concepts as clear headings, bullet-point definitions, examples from the source, memory-friendly summaries, and quick-review points. Use simple language. Group related ideas together. Highlight important terms in the bullets.
${schema}`,

    'Research Report': `You are a senior research analyst writing a formal RESEARCH REPORT.
${meta}
SOURCE: ${src}
Structure: Abstract/Overview, Background & Context, Key Findings (with data points), Analysis & Discussion, Methodology Notes, Conclusions & Implications, References. Use formal academic tone. Extract statistics, quotes, and specific claims from the source. Each section must have substantive paragraphs (3-5 sentences minimum).
${schema}`,

    'Executive Briefing': `You are a C-suite advisor creating a tight EXECUTIVE BRIEFING for senior leadership.
${meta}
SOURCE: ${src}
Structure: Situation Summary (2-3 sentences max), Key Issues, Strategic Implications, Recommended Actions (numbered), Risk Factors, Bottom Line. Be extremely concise. Every sentence must add value. Avoid jargon. Bullet points should be actionable. Title should reflect the core business issue.
${schema}`,

    'Product Requirements (PRD)': `You are a senior product manager writing a PRODUCT REQUIREMENTS DOCUMENT (PRD).
${meta}
SOURCE: ${src}
Structure: Product Overview, Problem Statement, Goals & Success Metrics, User Personas & Stories, Functional Requirements, Non-Functional Requirements, Out of Scope, Open Questions. Extract any product/feature/system details from the source. Use "Must have / Should have / Nice to have" language for requirements bullets.
${schema}`,

    'Assignment': `You are an academic writing expert creating a well-structured ASSIGNMENT submission.
${meta}
SOURCE: ${src}
Structure: Introduction (thesis statement), Background, Main Arguments (2-4 sections), Critical Analysis, Conclusion, References. Write in ${payload.tone} academic style. Support each argument with evidence from the source. Include counter-arguments where relevant. Conclusion must restate the thesis with insight gained.
${schema}`,

    'SWOT Analysis': `You are a business strategy consultant creating a professional SWOT ANALYSIS.
${meta}
SOURCE: ${src}
Structure: Overview (what is being analysed), Strengths (internal positives), Weaknesses (internal negatives), Opportunities (external positives), Threats (external negatives), Strategic Recommendations. Each SWOT section must have 4-6 specific, evidence-backed bullet points from the source. Recommendations should map strengths to opportunities and address weaknesses/threats.
${schema}`,

    'Business Report': `You are a management consultant writing a formal BUSINESS REPORT.
${meta}
SOURCE: ${src}
Structure: Executive Summary, Introduction & Scope, Current Situation Analysis, Key Findings, Financial/Performance Implications (if data available), Recommendations, Implementation Roadmap, Conclusion. Use ${payload.tone} business language. Extract numbers, metrics, and facts from the source to support findings.
${schema}`,

    'Article': `You are a professional journalist/writer creating an engaging ARTICLE for publication.
${meta}
SOURCE: ${src}
Structure: Compelling headline-style title, Hook/Lead paragraph (draws reader in), Background & Context, Main Story (3-4 sections with engaging subheadings), Expert Insights or Quotes (from source), Implications for readers, Conclusion with call-to-action or thought-provoking close. Write in a ${payload.tone} but readable style. Use active voice. Paragraphs max 4 sentences.
${schema}`,

    'Proposal': `You are a professional proposal writer creating a persuasive PROPOSAL document.
${meta}
SOURCE: ${src}
Structure: Executive Summary, Problem/Need Statement, Proposed Solution, Methodology & Approach, Timeline & Milestones, Expected Outcomes & Benefits, Budget Considerations (if applicable), Why Us/Qualifications, Call to Action. Be persuasive but evidence-based. Use the source to justify the need and solution.
${schema}`,

    'Technical Documentation': `You are a senior technical writer creating clear TECHNICAL DOCUMENTATION.
${meta}
SOURCE: ${src}
Structure: Overview & Purpose, System/Component Description, Prerequisites/Requirements, Architecture or How It Works, Step-by-Step Instructions or API/Feature Details, Configuration Options, Common Issues & Solutions, Examples & Use Cases, References. Use precise technical language. Bullets for lists/steps. Code concepts should be clearly explained.
${schema}`,

    'Legal Documentation': `You are a legal professional drafting formal LEGAL DOCUMENTATION.
${meta}
SOURCE: ${src}
Structure: Document Title & Parties (if applicable), Definitions & Interpretation, Background & Recitals, Main Provisions/Clauses, Rights & Obligations, Limitations & Disclaimers, Governing Law & Jurisdiction, Signatures/Execution. Extract all relevant legal concepts, rights, or obligations from the source. Use formal legal language. Add standard legal disclaimers in conclusion. Note: "This document is for informational purposes only and does not constitute legal advice."
${schema}`,

    'Contract Draft': `You are a contracts lawyer drafting a professional CONTRACT.
${meta}
SOURCE: ${src}
Structure: Contract Title, Parties & Date, Recitals/Background, Definitions, Scope of Work/Services, Payment Terms (if applicable), Intellectual Property, Confidentiality, Term & Termination, Representations & Warranties, Limitation of Liability, Governing Law, Signature Block. Use precise contractual language ("shall", "herein", "indemnify"). Extract relevant terms from source.
${schema}`,

    'Terms & Conditions': `You are a legal expert drafting TERMS & CONDITIONS for a product/service.
${meta}
SOURCE: ${src}
Structure: Introduction & Acceptance, Definitions, Use of Service/Product, User Obligations, Prohibited Activities, Intellectual Property Rights, Privacy & Data, Disclaimers & Warranties, Limitation of Liability, Indemnification, Changes to Terms, Contact Information. Make comprehensive but readable. Extract product/service details from the source.
${schema}`,

    'Privacy Policy': `You are a data privacy expert drafting a PRIVACY POLICY compliant with global standards.
${meta}
SOURCE: ${src}
Structure: Introduction & Scope, Information We Collect, How We Use Information, Information Sharing & Disclosure, Data Retention, Your Rights (GDPR/CCPA), Cookies & Tracking, Security Measures, Children's Privacy, Changes to Policy, Contact Us. Extract specific data practices from the source. Reference GDPR/CCPA compliance where appropriate.
${schema}`,
  };

  // Fallback for unknown types
  const typePrompt = typePrompts[payload.documentType] ?? `You are an expert document assistant generating a '${payload.documentType}'.
${meta}
SOURCE: ${src}
Create a well-structured, professional document appropriate for this type. Use clear headings, substantive paragraphs, and relevant bullet points.
${schema}`;

  const prompt = `${typePrompt}

STRICT RULES:
- Base content ONLY on the provided source. Do not invent facts.
- Write the complete document in ${payload.language || 'English'}, including the title, headings, summary, paragraphs, bullets, conclusion, and reference titles.
- Return ONLY the JSON object. No markdown fences, no explanation.
- Ensure all string values are properly escaped for JSON.`;

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
  if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3);

  return JSON.parse(clean.trim());
}

/**
 * Direct Client-Side Gemini Fallback: Rewrites text directly via Google Generative Language API.
 */
async function rewriteWithDirectGemini(payload: RewritePayload, apiKey: string): Promise<string> {
  const prompt = `You are Docify's professional editing assistant. You must modify the SELECTED TEXT based on the requested operation.

OPERATION: ${payload.operation}
${payload.targetLanguage ? `TARGET LANGUAGE: ${payload.targetLanguage}\n` : ''}
${payload.instruction ? `CUSTOM INSTRUCTION: ${payload.instruction}\n` : ''}
DOCUMENT CONTEXT (for reference only):
${payload.documentContext}

SELECTED TEXT TO MODIFY:
${payload.selectedText}

RULES:
- Return ONLY the modified text.
- If a target language is provided, write the complete result in that language.
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
