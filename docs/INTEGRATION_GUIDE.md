# Raksha Team Integration Guide
### AI Triage & Location-Logic Coordination Contract

This document provides clear integration instructions for coordinating the AI Triage & Location-Logic engine across all four team roles in the **Citizen Safety & Emergency Response PWA**.

```
                           ┌────────────────────────────┐
                           │   Member 1: Citizen PWA    │
                           └─────────────┬──────────────┘
                                         │ 1. Immediate SOS POST (lat, lon, desc)
                                         ▼
                           ┌────────────────────────────┐
                           │  Member 2: Backend Owner   │
                           │     (FastAPI Core & DB)    │
                           └─────────────┬──────────────┘
                                         │
            ┌────────────────────────────┴───────────────────────────┐
            │                                                        │
            ▼                                                        ▼
┌──────────────────────────────────────┐         ┌──────────────────────────────────────┐
│ Member 3 (Our Module): AI & Location │         │    Member 4: Responder & Police      │
│ - Triage Service (Kannada/Hindi/En)  │         │               Dashboard              │
│ - Candidate Duplicate Detector       │         │ - Live map with radius circles       │
│ - Deterministic Responder Ranking    │         │ - Verified badge vs Community badge  │
│ - Radius Escalation (300m -> 500m)   │         │ - Unestimated ETA / Telemetry ETA    │
└──────────────────────────────────────┘         └──────────────────────────────────────┘
```

---

## 1. Member 1: Citizen PWA Integration

### A. Non-blocking Immediate SOS
The citizen interface must send an immediate POST to create the incident.
- **Endpoint**: `POST /api/incidents`
- **Payload**:
  ```json
  {
    "citizen_id": "user_98765",
    "description": "ಇಲ್ಲಿ ತೀವ್ರವಾದ ಅಪಘಾತವಾಗಿದೆ, ರಸ್ತೆಯಲ್ಲಿ ರಕ್ತ ಸುರಿಯುತ್ತಿದೆ",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "accuracy_meters": 12.5,
    "language": "kn"
  }
  ```
- **Guaranteed Behavior**:
  - The client receives an immediate `201 Created` response with the `incident_id` and initial status `RAISED`.
  - The citizen does **NOT** wait for AI triage before receiving confirmation.

---

## 2. Member 2: Backend Owner Integration

Member 2 maintains the primary database, authentication, migrations, and claim endpoints. Our module integrates into Member 2's FastAPI app cleanly via Python module imports or mounting `ai_location_router`.

### A. Mounting the Router
In Member 2's `main.py`:
```python
from fastapi import FastAPI
from backend.app.api.routes import ai_location_router

app = FastAPI(title="Raksha Emergency Backend")
app.include_router(ai_location_router)
```

### B. Calling Triage from the Incident Creation Lifecycle
Member 2 can enrich newly created incidents in a background task without blocking the client response:

```python
from backend.app.services.triage_service import triage_service
from backend.app.schemas.triage import TriageRequest

# Inside Member 2's POST /api/incidents handler:
@app.post("/api/incidents", status_code=201)
async def create_incident(payload: IncidentCreate, background_tasks: BackgroundTasks):
    incident = db.create_incident_record(payload)  # Status: RAISED
    
    # Broadcast immediate notification to Ring 1 (300m) responders
    background_tasks.add_task(dispatch_initial_ring, incident)
    
    # Enrich with AI triage in background
    background_tasks.add_task(run_triage_and_save, incident)
    
    return incident

async def run_triage_and_save(incident):
    triage_req = TriageRequest(
        incident_id=incident.id,
        description=incident.description or "",
        latitude=incident.latitude,
        longitude=incident.longitude
    )
    result = await triage_service.triage_incident(triage_req)
    # Persist triage results in database
    db.update_incident_triage(incident.id, result)
```

### C. Running the Radius Escalation Check (MVP Rule)
Member 2 can evaluate radius escalation either on a periodic worker (e.g. every 5–10s) or on responder polling:

```python
from backend.app.services.radius_expansion import radius_expansion_service
from backend.app.schemas.dispatch import IncidentDispatchQuery

query = IncidentDispatchQuery(
    incident_id=incident.id,
    latitude=incident.latitude,
    longitude=incident.longitude,
    created_at=incident.created_at,
    claimed_at=incident.claimed_at,
    status=incident.status,
    responders=active_responders_list,
    already_notified_responder_ids=incident.already_notified_ids
)

decision = radius_expansion_service.evaluate_dispatch(query)

# Send alerts ONLY to newly qualified responders (Worker-Safe & Deduplicated)
for responder_id in decision.newly_notified_responder_ids:
    send_push_notification(responder_id, incident)

# Update cumulative notified list
db.update_notified_responders(incident.id, decision.all_notified_responder_ids)
```

### D. Rules for Member 2
- **Do NOT overwrite migrations**: Our module introduces no custom database tables or migrations.
- **Do NOT alter claim endpoint**: Responders claim via Member 2's claim endpoint (`POST /api/incidents/{id}/claim`). When `claimed_at` is set, `radius_expansion_service` automatically halts further radius expansion.

---

## 3. Member 4: Responder & Police Dashboard Integration

### A. Triage Display & Medical Disclaimer
- Displays classified incident type (`ACCIDENT`, `FIRE`, `MEDICAL`, `HARASSMENT`, `VIOLENCE`, `OTHER`) and severity (1–5).
- Displays the mandatory disclaimer banner: *"AI severity is an advisory prioritization score and NOT a certified medical assessment."*
- If `spam_flag: true` or `possible_duplicate: true`, shows an advisory badge for operator review.

### B. Responder Badge Distinction
- **Verified Responders** (`responder_type="VERIFIED"`): Display a verified checkmark badge (`is_verified=True`).
- **Community Volunteers** (`responder_type="COMMUNITY"`): Display a citizen volunteer badge.

### C. Non-Fabricated ETA Display Rule
- If `eta_seconds` is provided (e.g. from telemetry): Display calculated travel time (e.g. "3 mins").
- If `eta_seconds` is `null` (`eta_source="UNESTIMATED"`): Display *"ETA unestimated - live distance 250m"*. **Never fabricate travel times.**
