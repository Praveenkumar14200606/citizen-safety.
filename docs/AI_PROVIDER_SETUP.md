# AI Provider Setup & Configuration Guide

This document describes how to configure, test, and deploy the server-side AI Triage engine for the **Raksha Citizen Safety & Emergency Response Platform**.

---

## 1. Architecture & Design Principles

The Raksha AI Triage engine analyzes citizen emergency reports in **Kannada (ಕನ್ನಡ)**, **Hindi (हिन्दी)**, and **English** natively. It enforces the following core safety principles:

1. **Non-blocking Immediate SOS**: SOS creation and dispatch must **never wait for AI completion**. The incident is immediately persisted and broadcast to nearby responders. AI triage enriches the record asynchronously or runs with a strict bounded timeout.
2. **Strict Schema Validation**: LLM responses are parsed and validated via Pydantic V2. Any out-of-range severity (must be 1–5), invalid confidence (must be 0.0–1.0), or unknown incident category is rejected.
3. **Deterministic Safe Fallback**: If the LLM provider experiences network errors, timeouts (> 5.0s), rate limits (HTTP 429), or outputs malformed JSON, the system applies an immediate safe fallback (`incident_type="OTHER"`, `severity=3`, `confidence=0.0`, `is_fallback=True`). The incident remains fully operational.
4. **Never Suppress or Cancel SOS**: An incident with `spam_flag=true` or low confidence is flagged for human operator review but is **never suppressed, dropped, or cancelled**.
5. **Medical Assessment Disclaimer**: AI severity scores are prioritization advisories and must never be presented as verified medical assessments. Every response includes `medical_disclaimer`.

---

## 2. Environment Variables

Configure the following environment variables in your server's `.env` file or cloud secrets manager:

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `LLM_PROVIDER` | string | `mock` | Selected provider: `gemini`, `openai`, `custom`, or `mock`. |
| `LLM_API_KEY` | string | `None` | Private API key for the chosen LLM provider. **Never expose to frontend.** |
| `LLM_MODEL` | string | `gemini-2.5-flash` | Model identifier (e.g., `gemini-2.5-flash`, `gpt-4o-mini`). |
| `LLM_BASE_URL` | string | `None` | Custom base URL if using local vLLM, Ollama, or OpenAI-compatible proxies. |
| `LLM_TIMEOUT_SECONDS` | float | `5.0` | Bounded execution timeout. Enforces fallback if exceeded. |
| `LLM_MAX_RETRIES` | int | `1` | Maximum retry count before invoking safe fallback. |

---

## 3. Supported Providers

### Option A: Google Gemini (Recommended for Bengaluru Hackathon)

Google Gemini natively supports Kannada, Hindi, and English with high semantic accuracy.

1. Obtain an API key from [Google AI Studio](https://aistudio.google.com/).
2. In `.env`:
   ```env
   LLM_PROVIDER=gemini
   LLM_API_KEY=your_gemini_api_key_here
   LLM_MODEL=gemini-2.5-flash
   LLM_TIMEOUT_SECONDS=5.0
   ```

### Option B: OpenAI / Groq / Ollama (OpenAI-Compatible Endpoint)

1. For OpenAI:
   ```env
   LLM_PROVIDER=openai
   LLM_API_KEY=your_openai_api_key_here
   LLM_MODEL=gpt-4o-mini
   LLM_TIMEOUT_SECONDS=5.0
   ```
2. For local Ollama / vLLM:
   ```env
   LLM_PROVIDER=custom
   LLM_API_KEY=dummy
   LLM_BASE_URL=http://localhost:11434/v1
   LLM_MODEL=llama3.2
   LLM_TIMEOUT_SECONDS=5.0
   ```

### Option C: Mock / Offline Engine (Zero Configuration)

If no API key is provided or `LLM_PROVIDER=mock`, the system automatically utilizes the built-in `MockLLMClassifier`.
- Accurately classifies Kannada, Hindi, and English emergency keywords deterministically.
- Requires no external internet access, ensuring offline resilience during hackathon judging.

---

## 4. Triage Output Schema

Every triage invocation returns a validated JSON structure:

```json
{
  "incident_type": "ACCIDENT",
  "severity": 5,
  "confidence": 0.88,
  "possible_duplicate": false,
  "spam_flag": false,
  "reason": "Emergency keyword match (ACCIDENT) detected in kn",
  "is_fallback": false,
  "triage_error": null,
  "detected_language": "kn",
  "medical_disclaimer": "AI severity is an advisory prioritization score and NOT a certified medical assessment.",
  "triaged_at": "2026-10-30T07:21:04.317824Z"
}
```

### Incident Types
- `MEDICAL`: Cardiac arrest, respiratory failure, unconsciousness, severe injuries.
- `HARASSMENT`: Eve teasing, stalking, intimidation, inappropriate physical conduct.
- `VIOLENCE`: Armed assault, physical fights, robberies, weapons reported.
- `ACCIDENT`: Road traffic collisions, vehicular rollovers, pedestrian hit-and-run.
- `FIRE`: Structural fires, LPG cylinder leaks, vehicle fires, chemical blazes.
- `OTHER`: Unspecified emergencies or ambiguous reports.
