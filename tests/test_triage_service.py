"""
Unit tests for AI Triage Service.
Validates multilingual classification (Kannada, Hindi, English), strict schema
enforcement, timeout handling, spam policy compliance, and safe fallbacks.
"""

import pytest
import asyncio
from unittest.mock import patch, AsyncMock
from datetime import datetime, timezone

from backend.app.schemas.triage import IncidentType, TriageRequest, TriageResult
from backend.app.services.triage_service import (
    AITriageService,
    SafeFallbackTriage,
    MockLLMClassifier
)


@pytest.mark.asyncio
async def test_kannada_accident_triage():
    """Validates Kannada text classification without requiring pre-translation."""
    service = AITriageService(provider="mock")
    request = TriageRequest(
        description="ಇಲ್ಲಿ ತೀವ್ರವಾದ ಅಪಘಾತವಾಗಿದೆ, ರಸ್ತೆಯಲ್ಲಿ ರಕ್ತ ಸುರಿಯುತ್ತಿದೆ",
        language_hint="kn"
    )
    result = await service.triage_incident(request)

    assert result.incident_type == IncidentType.ACCIDENT
    assert result.severity in (4, 5)
    assert result.confidence >= 0.8
    assert result.spam_flag is False
    assert result.is_fallback is False
    assert result.detected_language == "kn"
    assert "advisory" in result.medical_disclaimer.lower()


@pytest.mark.asyncio
async def test_kannada_medical_heart_attack():
    """Validates Kannada medical emergency."""
    service = AITriageService(provider="mock")
    request = TriageRequest(
        description="ಒಬ್ಬ ವ್ಯಕ್ತಿಗೆ ಹೃದಯಾಘಾತವಾಗಿದೆ, ಉಸಿರಾಟ ನಿಂತಿದೆ, ಆಂಬ್ಯುಲೆನ್ಸ್ ಬೇಕು",
        language_hint="kn"
    )
    result = await service.triage_incident(request)

    assert result.incident_type == IncidentType.MEDICAL
    assert result.severity == 5
    assert result.confidence >= 0.8
    assert result.spam_flag is False


@pytest.mark.asyncio
async def test_hindi_harassment_triage():
    """Validates Hindi text classification directly."""
    service = AITriageService(provider="mock")
    request = TriageRequest(
        description="यहाँ एक महिला के साथ छेड़छाड़ हो रही है, कोई पीछा कर रहा है",
        language_hint="hi"
    )
    result = await service.triage_incident(request)

    assert result.incident_type == IncidentType.HARASSMENT
    assert result.severity in (3, 4)
    assert result.confidence >= 0.8
    assert result.spam_flag is False
    assert result.detected_language == "hi"


@pytest.mark.asyncio
async def test_hindi_fire_emergency():
    """Validates Hindi fire emergency."""
    service = AITriageService(provider="mock")
    request = TriageRequest(
        description="इमारत में भयानक आग लग गई है, चारों तरफ धुआं है",
        language_hint="hi"
    )
    result = await service.triage_incident(request)

    assert result.incident_type == IncidentType.FIRE
    assert result.severity == 5
    assert result.confidence >= 0.8


@pytest.mark.asyncio
async def test_english_fire_triage():
    """Validates English fire emergency classification."""
    service = AITriageService(provider="mock")
    request = TriageRequest(
        description="Massive fire and heavy smoke on the 3rd floor, people trapped",
        language_hint="en"
    )
    result = await service.triage_incident(request)

    assert result.incident_type == IncidentType.FIRE
    assert result.severity == 5
    assert result.confidence >= 0.8
    assert result.is_fallback is False


@pytest.mark.asyncio
async def test_empty_description_safe_fallback():
    """Empty descriptions safely fall back to OTHER without crashing."""
    service = AITriageService(provider="mock")
    request = TriageRequest(description="   ")
    result = await service.triage_incident(request)

    assert result.incident_type == IncidentType.OTHER
    assert result.severity == 3
    assert result.confidence == 0.0
    assert result.is_fallback is True
    assert "empty" in result.triage_error.lower() if result.triage_error else True


@pytest.mark.asyncio
async def test_ai_timeout_triggers_safe_fallback():
    """Simulates an AI timeout (> timeout threshold) and ensures safe fallback is returned."""
    # Set ultra-short timeout for test
    service = AITriageService(provider="openai", timeout=0.05, api_key="test-key")

    async def fake_slow_call(*args, **kwargs):
        await asyncio.sleep(0.2)
        return None

    with patch.object(service, "_dispatch_classification", side_effect=fake_slow_call):
        request = TriageRequest(description="Man collapsed on the pavement")
        result = await service.triage_incident(request)

        assert result.incident_type == IncidentType.OTHER
        assert result.severity == 3
        assert result.confidence == 0.0
        assert result.is_fallback is True
        assert "timeout" in (result.triage_error or "").lower()
        assert result.spam_flag is False


@pytest.mark.asyncio
async def test_malformed_json_fallback():
    """Verifies that invalid or non-JSON responses from LLM trigger safe fallback."""
    service = AITriageService(provider="gemini", api_key="dummy_key")

    with patch.object(service, "_call_gemini_api", side_effect=ValueError("Invalid JSON syntax")):
        request = TriageRequest(description="There is smoke coming from the shop")
        result = await service.triage_incident(request)

        assert result.incident_type == IncidentType.OTHER
        assert result.severity == 3
        assert result.is_fallback is True
        assert "Invalid JSON" in (result.triage_error or "")


@pytest.mark.asyncio
async def test_invalid_enum_rejected():
    """Verifies that unapproved enum values from LLM are rejected by schema validator."""
    service = AITriageService(provider="mock")

    # Raw dictionary with illegal incident type
    bad_data = {
        "incident_type": "BURGLARY_NON_VIOLENT",
        "severity": 2,
        "confidence": 0.9,
        "possible_duplicate": False,
        "spam_flag": False,
        "reason": "Someone stole a cycle"
    }

    with pytest.raises(ValueError) as exc_info:
        service._validate_and_build(bad_data)
    assert "Invalid incident_type" in str(exc_info.value)


@pytest.mark.asyncio
async def test_out_of_range_severity_rejected():
    """Severity must be strictly 1 to 5."""
    service = AITriageService(provider="mock")

    bad_data_high = {
        "incident_type": "FIRE",
        "severity": 10,
        "confidence": 0.9,
        "reason": "Fire"
    }
    with pytest.raises(ValueError):
        service._validate_and_build(bad_data_high)

    bad_data_low = {
        "incident_type": "FIRE",
        "severity": 0,
        "confidence": 0.9,
        "reason": "Fire"
    }
    with pytest.raises(ValueError):
        service._validate_and_build(bad_data_low)


@pytest.mark.asyncio
async def test_out_of_range_confidence_rejected():
    """Confidence must be between 0.0 and 1.0."""
    service = AITriageService(provider="mock")

    bad_conf = {
        "incident_type": "FIRE",
        "severity": 4,
        "confidence": 1.5,
        "reason": "Fire"
    }
    with pytest.raises(ValueError):
        service._validate_and_build(bad_conf)


@pytest.mark.asyncio
async def test_rate_limit_429_handled_safely():
    """Simulates HTTP 429 rate limit from provider."""
    service = AITriageService(provider="openai", api_key="dummy")

    with patch.object(service, "_call_openai_api", side_effect=RuntimeError("LLM API rate limit exceeded (HTTP 429)")):
        request = TriageRequest(description="Two bikes crashed")
        result = await service.triage_incident(request)

        assert result.is_fallback is True
        assert "429" in (result.triage_error or "")
        assert result.incident_type == IncidentType.OTHER


@pytest.mark.asyncio
async def test_spam_flag_and_sos_never_suppressed_policy():
    """
    CRITICAL POLICY TEST:
    A spam flag must be recorded when appropriate, BUT an SOS is NEVER cancelled or suppressed.
    """
    service = AITriageService(provider="mock")
    request = TriageRequest(description="test test testing lol")
    result = await service.triage_incident(request)

    assert result.spam_flag is True
    assert result.severity == 1

    # Verify policy: incident retains full data, is valid TriageResult,
    # and caller must treat it as advisory rather than suppressing the SOS.
    assert isinstance(result, TriageResult)
    assert result.medical_disclaimer is not None


def test_conversational_json_extraction():
    """
    Ensures that LLM responses with conversational preambles or thoughts
    are parsed cleanly without triggering false fallbacks.
    """
    service = AITriageService()
    raw_llm_output = """
    Here is the structured emergency assessment for the incident:
    ```json
    {
        "incident_type": "ACCIDENT",
        "severity": 4,
        "confidence": 0.92,
        "possible_duplicate": false,
        "spam_flag": false,
        "reason": "Collision between bus and car with injuries",
        "detected_language": "en"
    }
    ```
    Please dispatch assistance immediately.
    """
    parsed = service._parse_json_safely(raw_llm_output)
    result = service._validate_and_build(parsed)

    assert result.incident_type == IncidentType.ACCIDENT
    assert result.severity == 4
    assert result.confidence == 0.92
    assert result.is_fallback is False


@pytest.mark.asyncio
async def test_transliterated_kanglish_and_hinglish():
    """
    Validates romanized Indian languages frequently typed on smartphone keyboards in Bengaluru.
    """
    service = AITriageService(provider="mock")

    # Kanglish accident
    res_kn = await service.triage_incident(TriageRequest(description="gaadi accident aagide rasteyalli"))
    assert res_kn.incident_type == IncidentType.ACCIDENT
    assert res_kn.severity >= 4

    # Hinglish fire
    res_hi = await service.triage_incident(TriageRequest(description="shop me aag lagi hai jal raha hai"))
    assert res_hi.incident_type == IncidentType.FIRE
    assert res_hi.severity == 5


@pytest.mark.asyncio
async def test_run_triage_in_background_callback():
    """
    Validates asynchronous background execution for Member 2 without blocking caller.
    """
    service = AITriageService(provider="mock")
    saved_records = {}

    async def mock_db_update(inc_id, triage_res):
        saved_records[inc_id] = triage_res

    res = await service.run_triage_in_background(
        incident_id="inc_bg_123",
        description="Massive building fire",
        update_callback=mock_db_update
    )

    assert res.incident_type == IncidentType.FIRE
    assert "inc_bg_123" in saved_records
    assert saved_records["inc_bg_123"].incident_type == IncidentType.FIRE


# ─────────────────────────────────────────────────────────────
# Groq Provider Tests
# ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_groq_provider_happy_path():
    """Groq returns valid JSON → TriageResult produced correctly."""
    groq_response = {
        "choices": [{
            "message": {
                "content": (
                    '{"incident_type":"FIRE","severity":5,"confidence":0.95,'
                    '"possible_duplicate":false,"spam_flag":false,'
                    '"reason":"Building fire reported","detected_language":"en"}'
                )
            }
        }]
    }
    service = AITriageService(provider="groq", api_key="gsk_test_key", model="llama-3.1-8b-instant")

    from unittest.mock import MagicMock
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = groq_response
    mock_resp.raise_for_status = lambda: None

    async def fake_post(*args, **kwargs):
        return mock_resp

    import httpx as _httpx
    with patch.object(_httpx.AsyncClient, "post", new=fake_post):
        result = await service.triage_incident(
            TriageRequest(description="Building on fire, smoke everywhere")
        )

    assert result.incident_type == IncidentType.FIRE
    assert result.severity == 5
    assert result.confidence == 0.95
    assert result.is_fallback is False


@pytest.mark.asyncio
async def test_groq_rate_limit_falls_back_safely():
    """Groq HTTP 429 triggers safe fallback — SOS is never cancelled."""
    service = AITriageService(provider="groq", api_key="gsk_test_key")

    import httpx as _httpx
    from unittest.mock import MagicMock
    mock_resp = MagicMock()
    mock_resp.status_code = 429
    mock_resp.json.return_value = {}
    mock_resp.raise_for_status = lambda: None

    async def fake_post(*args, **kwargs):
        return mock_resp

    with patch.object(_httpx.AsyncClient, "post", new=fake_post):
        result = await service.triage_incident(
            TriageRequest(description="Help there is a fire!")
        )

    assert result.is_fallback is True
    assert result.spam_flag is False
    assert result.incident_type == IncidentType.OTHER


@pytest.mark.asyncio
async def test_groq_invalid_json_falls_back():
    """Groq returns malformed JSON → fallback, never crash."""
    groq_response = {
        "choices": [{"message": {"content": "Sorry, I cannot classify this."}}]
    }
    service = AITriageService(provider="groq", api_key="gsk_test_key")
    from unittest.mock import MagicMock
    import httpx as _httpx
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = groq_response
    mock_resp.raise_for_status = lambda: None

    async def fake_post(*args, **kwargs):
        return mock_resp

    with patch.object(_httpx.AsyncClient, "post", new=fake_post):
        result = await service.triage_incident(
            TriageRequest(description="Some emergency description")
        )

    assert result.is_fallback is True
    assert result.triage_error is not None


@pytest.mark.asyncio
async def test_groq_multilingual_hindi_payload():
    """Groq provider receives the correct Hindi prompt — no pre-translation required."""
    service = AITriageService(provider="groq", api_key="gsk_test_key", model="llama-3.1-8b-instant")
    captured_payload: dict = {}

    groq_response = {
        "choices": [{
            "message": {
                "content": (
                    '{"incident_type":"HARASSMENT","severity":3,"confidence":0.85,'
                    '"possible_duplicate":false,"spam_flag":false,'
                    '"reason":"Stalking reported in Hindi","detected_language":"hi"}'
                )
            }
        }]
    }

    from unittest.mock import MagicMock
    import httpx as _httpx

    async def fake_post(*args, json=None, headers=None, **kwargs):
        captured_payload.update(json or {})
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = groq_response
        mock_resp.raise_for_status = lambda: None
        return mock_resp

    with patch.object(_httpx.AsyncClient, "post", new=fake_post):
        result = await service.triage_incident(
            TriageRequest(description="Koi mujhe peeche kar raha hai, help karo", language_hint="hi")
        )

    # Verify Hindi text is sent directly (no translation step)
    user_msg = captured_payload["messages"][1]["content"]
    assert "peeche kar raha" in user_msg
    assert "language hint" in user_msg.lower()
    assert result.incident_type == IncidentType.HARASSMENT
    assert result.is_fallback is False


# ─────────────────────────────────────────────────────────────
# Ollama Provider Tests
# ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ollama_provider_happy_path():
    """Ollama returns valid JSON → TriageResult produced without API key."""
    ollama_response = {
        "message": {
            "content": (
                '{"incident_type":"VIOLENCE","severity":4,"confidence":0.90,'
                '"possible_duplicate":false,"spam_flag":false,'
                '"reason":"Armed attack reported","detected_language":"en"}'
            )
        }
    }
    # Ollama needs NO api_key
    service = AITriageService(
        provider="ollama",
        api_key=None,
        model="llama3.2",
        base_url="http://localhost:11434"
    )
    from unittest.mock import MagicMock
    import httpx as _httpx
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = ollama_response
    mock_resp.raise_for_status = lambda: None

    async def fake_post(*args, **kwargs):
        return mock_resp

    with patch.object(_httpx.AsyncClient, "post", new=fake_post):
        result = await service.triage_incident(
            TriageRequest(description="Man with knife attacking people on MG Road")
        )

    assert result.incident_type == IncidentType.VIOLENCE
    assert result.severity == 4
    assert result.is_fallback is False


@pytest.mark.asyncio
async def test_ollama_server_offline_falls_back():
    """Ollama server unreachable → ConnectError → safe fallback, never crash."""
    import httpx as _httpx
    service = AITriageService(provider="ollama", api_key=None, model="llama3.2")

    with patch.object(
        _httpx.AsyncClient, "post",
        side_effect=_httpx.ConnectError("Connection refused")
    ):
        result = await service.triage_incident(
            TriageRequest(description="Car crash near Silk Board")
        )

    assert result.is_fallback is True
    assert "ollama" in result.triage_error.lower() or "connect" in result.triage_error.lower()
    assert result.spam_flag is False
    assert result.incident_type == IncidentType.OTHER


@pytest.mark.asyncio
async def test_ollama_model_not_found_falls_back():
    """Ollama 404 (model not pulled) → fallback with helpful error."""
    import httpx as _httpx
    from unittest.mock import MagicMock

    async def fake_post(*args, **kwargs):
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_resp.json.return_value = {"error": "model not found"}
        mock_resp.raise_for_status = lambda: None
        return mock_resp

    service = AITriageService(provider="ollama", api_key=None, model="nonexistent-model")
    with patch.object(_httpx.AsyncClient, "post", new=fake_post):
        result = await service.triage_incident(
            TriageRequest(description="Building fire on Residency Road")
        )

    assert result.is_fallback is True


@pytest.mark.asyncio
async def test_ollama_kannada_text_no_translation():
    """Ollama receives raw Kannada — system confirms no pre-translation."""
    ollama_response = {
        "message": {
            "content": (
                '{"incident_type":"ACCIDENT","severity":4,"confidence":0.88,'
                '"possible_duplicate":false,"spam_flag":false,'
                '"reason":"Road accident with injuries","detected_language":"kn"}'
            )
        }
    }
    captured: dict = {}

    from unittest.mock import MagicMock
    import httpx as _httpx

    async def fake_post(*args, json=None, **kwargs):
        captured.update(json or {})
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = ollama_response
        mock_resp.raise_for_status = lambda: None
        return mock_resp

    service = AITriageService(provider="ollama", api_key=None, model="llama3.2")
    with patch.object(_httpx.AsyncClient, "post", new=fake_post):
        result = await service.triage_incident(
            TriageRequest(
                description="ಅಪಘಾತವಾಗಿದೆ, ಒಬ್ಬರಿಗೆ ತೀವ್ರ ಗಾಯವಾಗಿದೆ",
                language_hint="kn"
            )
        )

    # Kannada text arrives untranslated in the request body
    user_msg = captured["messages"][1]["content"]
    assert "ಅಪಘಾತ" in user_msg
    assert result.incident_type == IncidentType.ACCIDENT
    assert result.is_fallback is False
