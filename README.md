# 🗿 Kerala AI English Coach Statue (FreeLLMAPI Multi-Provider Router)

An interactive, voice-driven **AI English Coach** for Kerala school students implementing the **[Tianmind Studio English Coach](https://github.com/tianmind-studio/english-coach)** dual-action coaching skill, powered by a built-in **FreeLLMAPI-style Multi-Provider & Multi-Key AI Router**.

---

## 🌟 Key Features

1. **Passkey-Protected Admin Page (`/admin` or `admin.html`)**:
   - Students using the statue cannot view or alter API keys.
   - Click **🔒 Admin** (or open `/admin`) and enter passkey **`8590584541`** to configure providers, keys, routing, and live telemetry.
2. **4 Cloud AI Providers Supported**:
   - **NVIDIA NIM** (`meta/llama-3.3-70b-instruct`, `meta/llama-3.1-8b-instruct`, Nemotron, Mistral Large)
   - **Groq Cloud** (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, Gemma 2, Mixtral)
   - **Google AI Studio** (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`)
   - **OpenRouter** (`meta-llama/llama-3.3-70b-instruct:free`, Gemini 2.0 Flash Free, DeepSeek R1 Free, Qwen 2.5 72B Free)
3. **Multiple Keys Per Provider & FreeLLMAPI Rotation / Failover**:
   - Add unlimited API keys under the same provider (individually or bulk-paste one per line).
   - **Per-Provider Round-Robin**: Automatically cycles across all keys of a provider (Key #1 → Key #2 → Key #3) to multiply your free rate limits.
   - **Automatic Failover & Cooldown Ledger**: If any key hits a `429` rate limit, `5xx` server error, auth error, or timeout, it is placed into cooldown and the router instantly retries with the next key or next provider in the same spoken turn.
   - **Routing Strategies**: `auto:balanced`, `auto:fast`, `auto:smart`, `round-robin`, or pinned primary provider.
   - **CORS-Free Proxy Included**: Both Vercel (`api/proxy.js`) and Windows (`launcher.py`) include an allowlisted `/api/proxy` endpoint so NVIDIA NIM and all providers work reliably without CORS issues.
4. **7-Viseme Phonetic Lip-Sync + 24/7 Always Awake**:
   - Real-time phonetic mouth shapes synced to speech words and syllables.
   - Windows `SetThreadExecutionState` + HTML5 WakeLock keep the PC awake indefinitely.

---

## 🚀 How to Run

### Option 1: Windows Desktop Kiosk (Recommended — Includes CORS Proxy + Disk Key Storage)
1. Double-click **`run_coach_kiosk.bat`** (or run `python launcher.py`).
2. Opens the talking statue at `http://127.0.0.1:8686`.
3. Click **🔒 Admin** (or visit `http://127.0.0.1:8686/admin`), enter passkey **`8590584541`**, and add your NVIDIA NIM / Groq / Google AI Studio / OpenRouter keys.
4. Keys are saved both in browser storage and locally to `config.json`.

### Option 2: Zero-Install Standalone Windows (No Python Needed)
1. Double-click **`run_coach_standalone.bat`**.
2. Uses native Windows PowerShell keep-awake + Microsoft Edge App Mode. *(Note: In direct `file://` mode without a server, Groq, Google AI Studio, and OpenRouter work directly from the browser; for NVIDIA NIM CORS proxying, use Option 1 or Vercel).*

### Option 3: Deploy to Vercel
1. Deploy the `kerala-english-coach` folder directly to Vercel (`npx vercel` or via GitHub).
2. Vercel automatically hosts `index.html`, `/admin` (`admin.html`), `llm-router.js`, and the serverless proxy `/api/proxy` (`api/proxy.js`).
