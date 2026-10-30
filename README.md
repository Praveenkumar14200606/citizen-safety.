# Raksha: AI Triage & Location-Logic Engine

Raksha is an AI-powered Citizen Safety and Emergency Response platform designed for Bengaluru, India.
This repository module implements the **server-side AI triage service**, **candidate duplicate detection**, **deterministic responder ranking**, and **dynamic radius escalation logic**.

---

## Key Capabilities

1. **Server-Side Multilingual AI Triage**:
   - Supports **Kannada (ಕನ್ನಡ)**, **Hindi (हिन्दी)**, and **English** natively without pre-translation.
   - Extracts structured fields: `incident_type` (MEDICAL, HARASSMENT, VIOLENCE, ACCIDENT, FIRE, OTHER), `severity` (1–5), `confidence` (0.0–1.0), `possible_duplicate` (boolean), `spam_flag` (boolean), and `reason`.
   - Strict schema validation with Pydantic V2 (rejects illegal enums, out-of-range numbers, malformed JSON).
   - Bounded timeout with deterministic safe fallback (`OTHER`, severity 3, low confidence, logged error).
   - Safety guarantee: Never cancels or suppresses an SOS on low confidence or spam flag.
   - Explicit medical disclaimer included in all outputs.

2. **Lightweight Candidate Duplicate Detection**:
   - Compares incoming incidents against active/recent incidents via Haversine geographic proximity, recent time window (30m), category compatibility, and token-based text similarity.
   - Strictly non-destructive: flags candidate IDs and reasons without auto-merging or closing original reports.

3. **Deterministic Responder Ranking**:
   - Ranks available and active responders based on distance from incident, trust level, and location freshness.
   - Authorized verified responders are clearly distinguished from community volunteers and receive an explicit priority tier.
   - **No fabricated travel times**: ETAs are only provided when reliable speed telemetry exists.

4. **Radius Escalation Logic (MVP Rule)**:
   - Initial search radius: **300 metres**.
   - Expansion threshold: **30 seconds** after incident creation if unclaimed.
   - Expanded search radius: **500 metres**.
   - Halts immediately when the incident is claimed or no longer active.
   - Calculated strictly from backend timestamps.
   - Multi-worker deduplication prevents redundant alerts.

---

## Directory Layout

```
Raksha/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py              # Environment configuration & thresholds
│   │   │   └── logging.py             # Structured logging setup
│   │   ├── schemas/
│   │   │   ├── triage.py              # Strict Pydantic models for AI triage
│   │   │   ├── duplicate.py           # Schemas for candidate duplicate detection
│   │   │   ├── dispatch.py            # Responders, ranking, and radius state
│   │   │   └── incident.py            # Shared contracts with Member 2
│   │   ├── services/
│   │   │   ├── triage_service.py      # LLM integration (Gemini, OpenAI, Mock) & fallback
│   │   │   ├── duplicate_detector.py  # Geo, time, category, and text duplicate matcher
│   │   │   ├── ranking_service.py     # Deterministic responder ranker
│   │   │   └── radius_expansion.py    # Radius expansion & worker deduplication
│   │   └── api/
│   │       └── routes.py              # FastAPI router mountable by Member 2
├── tests/
│   ├── conftest.py                    # Shared test fixtures & locations
│   ├── test_triage_service.py         # Multilingual, schema, timeout, spam tests
│   ├── test_duplicate_detector.py     # Geo, time, category, text, non-destructive tests
│   ├── test_ranking_service.py        # Distance, verified vs community, ETA tests
│   ├── test_radius_expansion.py       # 300m->30s->500m, claim stop, deduplication tests
│   └── test_api_routes.py             # FastAPI HTTP integration tests
├── docs/
│   ├── AI_PROVIDER_SETUP.md           # LLM configuration and environment keys
│   └── INTEGRATION_GUIDE.md           # Coordination guide for Members 1, 2, and 4
└── README.md
```

---

## Running Tests

Execute the comprehensive test suite with:

```bash
python -m pytest tests/ -v
```
