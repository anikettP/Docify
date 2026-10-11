# Docify 📄✨
> *From web to work, instantly.*

Docify is an intelligent document generation and editing suite that transforms any webpage, highlighted snippet, or multi-tab research session into structured, publication-ready documents using **Google Gemini AI**.

Docify pairs a **Manifest V3 Google Chrome Extension** with a high-performance **Spring Boot** intelligence engine, fully compliant with Chromium's **Local Network Access (LNA) Phase 3** security standards.

---

## 🌟 Key Features

- **⚡ Instant Ingestion**:
  - **Single Page Extraction**: Clean article parsing stripping ads, sidebars, cookie banners, and navigation.
  - **Highlighted Snippets**: Generate focused notes directly from selected web text (or via right-click context menu).
  - **Multi-Tab Dossier**: Synthesize comprehensive reports combining 2–5 open browser tabs simultaneously.
- **🧠 AI-Powered Document Synthesis**:
  - Generates structured documents: *Research Reports, PRDs, Study Notes, Executive Briefings, Assignments, SWOT Analyses, Business Reports, and Technical Docs*.
  - Configurable length (*Short, Medium, Long*) and tone (*Professional, Academic, Executive, Casual*).
- **✍️ TipTap Document Studio**:
  - Dedicated rich text editing studio opening in a standalone tab.
  - Heading toggles, bold, italic, lists, blockquotes, and link management.
  - **Floating Bubble Assistant**: In-line AI writing transformations (*Rewrite, Make Professional, Shorten, Expand, Custom Prompts*).
  - **Docify Copilot Sidebar**: Interactive chat panel to query the document, verify claims, or generate new sections with one-click insertion.
- **🛡️ Chrome Local Network Access (LNA) Phase 3 Compliant**:
  - Preflight filter handling `Access-Control-Allow-Private-Network: true`.
  - Hardened Manifest V3 host permissions and CSP.
  - Integrated connectivity diagnostics and zero-backend direct Gemini client fallback mode.
- **📤 Multi-Format Export**:
  - Export to styled PDF (`.pdf`), Markdown (`.md`), and Plain Text (`.txt`).
  - Autosave and document history stored in local browser storage.

---

## 🏗️ Architecture

```
Docify/
├── backend/                  # Spring Boot Intelligence Engine (Java 17)
│   ├── src/main/java/com/docify/
│   │   ├── config/           # LocalNetworkAccessFilter (LNA / PNA preflight)
│   │   ├── health/           # HealthController (/api/health diagnostics)
│   │   ├── ai/               # Gemini AI & PromptTemplateService
│   │   └── document/         # DocumentController (/generate, /rewrite, /chat)
│   ├── src/main/resources/   # application.yml
│   └── pom.xml
│
├── extension/                # Google Chrome Extension (Manifest V3)
│   ├── public/manifest.json  # Manifest V3 permissions & host permissions
│   ├── src/
│   │   ├── background/       # service-worker.ts (context menus)
│   │   ├── content/          # content.ts (clean article DOM parsing)
│   │   ├── popup/            # Popup.tsx (generation UI & LNA settings)
│   │   ├── editor/           # TipTap Editor & Docify Copilot sidebar
│   │   └── utils/            # apiClient.ts, pdfExporter.ts, storage.ts
│   ├── package.json
│   └── vite.config.ts
│
└── ROADMAP.md                # Strategic Phased Roadmap
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Java 17+**
- **Node.js 18+** & npm
- **Google Chrome** (or Chromium-based browser)
- **Google Gemini API Key** (from [Google AI Studio](https://aistudio.google.com/))

### 2. Run the Spring Boot Backend
```bash
cd backend

# On Windows:
./mvnw.cmd spring-boot:run -Dspring-boot.run.arguments="--docify.ai.api-key=YOUR_GEMINI_API_KEY"

# On Linux / macOS:
./mvnw spring-boot:run -Dspring-boot.run.arguments="--docify.ai.api-key=YOUR_GEMINI_API_KEY"
```
The backend starts on `http://localhost:8080`. You can verify connectivity at `http://localhost:8080/api/health`.

### 3. Build & Load the Chrome Extension
```bash
cd extension
npm install
npm run build
```
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `Docify/extension/dist` folder.
4. Pin the Docify extension and start creating documents from any web page!

---

## 🔒 Chrome Local Network Access (LNA) Phase 3 Details

Chromium's Local Network Access policy requires explicit preflight consent (`Access-Control-Allow-Private-Network: true`) when extensions or public web pages communicate with local servers (`localhost:8080`).

Docify includes:
1. `LocalNetworkAccessFilter` in Spring Boot returning `Access-Control-Allow-Private-Network: true` on `OPTIONS` preflights.
2. `host_permissions` in `manifest.json` for `localhost` and `127.0.0.1`.
3. An interactive diagnostic status check in the extension popup.
4. An optional **Zero-Backend Direct Mode**: Users can configure their Gemini API Key in the extension popup to run 100% serverless without a local backend.

---

## 📄 License
MIT License.
