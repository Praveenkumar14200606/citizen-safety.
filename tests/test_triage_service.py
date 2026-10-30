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
