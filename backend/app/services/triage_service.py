"""
Server-side LLM Triage Service for Raksha.
Classifies emergency incident descriptions across Kannada, Hindi, and English.
Validates outputs against strict schemas, enforces bounded timeouts, and provides
deterministic safe fallbacks during outages or parsing failures.
"""

import json
import re
import asyncio
import inspect
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import httpx

from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.schemas.triage import IncidentType, TriageResult, TriageRequest


TRIAGE_SYSTEM_PROMPT = """You are the Emergency Triage AI for Raksha, an emergency response platform in Bengaluru, Karnataka, India.
Your task is to analyze emergency descriptions provided by citizens in Kannada (ಕನ್ನಡ), Hindi (हिन्दी), or English.

You MUST extract and classify the incident into a valid JSON object with the following fields:
1. "incident_type": Must be EXACTLY one of: "MEDICAL", "HARASSMENT", "VIOLENCE", "ACCIDENT", "FIRE", "OTHER".
2. "severity": Integer from 1 (minor/informational) to 5 (critical/life-threatening emergency).
3. "confidence": Float between 0.0 and 1.0 indicating your certainty.
4. "possible_duplicate": Boolean (true if text suggests an ongoing or previously reported event, otherwise false).
5. "spam_flag": Boolean (true ONLY if the text is clearly gibberish, an obvious joke, or malicious test input; otherwise false).
6. "reason": A short factual explanation (maximum 200 characters) in English describing the emergency and justifying the severity.
7. "detected_language": Detected language ("kn" for Kannada, "hi" for Hindi, "en" for English, or "other").

GUIDELINES:
- Understand Kannada, Hindi, and English natively without requiring prior translation.
- Never downgrade a life-threatening emergency (e.g., cardiac arrest, major fire, severe road crash, armed violence) below severity 4 or 5.
- If uncertain, default incident_type to "OTHER" with an appropriate confidence score.
- Output ONLY a raw, valid JSON object. Do not include markdown codeblocks, preamble, or commentary.
"""


class SafeFallbackTriage:
    """Provides a safe, non-blocking deterministic classification when AI fails."""

    @staticmethod
    def get_fallback(
        reason_detail: str = "AI triage unavailable",
        error_detail: Optional[str] = None,
        detected_language: Optional[str] = None
    ) -> TriageResult:
        logger.warning(
            f"Applying safe triage fallback: {reason_detail} | Error: {error_detail}"
        )
        return TriageResult(
            incident_type=IncidentType.OTHER,
            severity=3,  # Safe median triage level ensuring standard responder attention
            confidence=0.0,  # Explicit low-confidence indicator
            possible_duplicate=False,
            spam_flag=False,  # Never suppress on failure
            reason=f"Fallback triage: {reason_detail}",
            is_fallback=True,
            triage_error=error_detail,
            detected_language=detected_language,
            medical_disclaimer="AI severity is an advisory prioritization score and NOT a certified medical assessment.",
            triaged_at=datetime.now(timezone.utc)
        )


class MockLLMClassifier:
    """
    Intelligent local multilingual triage engine used for tests and offline development.
    Understands Kannada, Hindi, and English keywords deterministically.
    """

    KEYWORD_MAPPINGS = {
        IncidentType.FIRE: {
            "kn": ["ಬೆಂಕಿ", "ಹೊಗೆ", "ಸುಡುತ್ತಿದೆ", "ಜ್ವಾಲೆ", "benki", "hoge", "suduttide"],
            "hi": ["आग", "धुआं", "धुआँ", "जल रहा", "लपटें", "aag", "dhuan", "dhuwan", "jal raha"],
            "en": ["fire", "blaze", "smoke", "flames", "burning", "explosion"]
        },
        IncidentType.ACCIDENT: {
            "kn": ["ಅಪಘಾತ", "ಡಿಕ್ಕಿ", "ರಕ್ತ", "ವಾಹನ ಪಲ್ಟಿ", "ಗುದ್ದಿದೆ", "apaghatha", "accident", "dikkki", "palti"],
            "hi": ["दुर्घटना", "एक्सीडेंट", "टक्कर", "खून", "गाड़ी पलट गई", "durghatna", "takkar", "khoon", "gaadi gir"],
            "en": ["accident", "crash", "collision", "hit and run", "run over", "bike fall"]
        },
        IncidentType.MEDICAL: {
            "kn": ["ಹೃದಯಾಘಾತ", "ಉಸಿರಾಟ", "ಪ್ರಜ್ಞೆ ತಪ್ಪಿದೆ", "ಆಸ್ಪತ್ರೆ", "ನೋವು", "ಆಂಬ್ಯುಲೆನ್ಸ್", "hrudayaghatha", "ambulance", "usirata"],
            "hi": ["दिल का दौरा", "सांस", "बेहोश", "अस्पताल", "दर्द", "एम्बुलेंस", "हार्ट अटैक", "behoshi", "saans", "aspatal"],
            "en": ["medical", "heart attack", "unconscious", "breathing", "ambulance", "bleeding", "stroke", "collapsed", "cpr"]
        },
        IncidentType.VIOLENCE: {
            "kn": ["ಹಲ್ಲೆ", "ಹೊಡೆದಾಟ", "ಚಾಕು", "ಬಂದೂಕು", "ದರೋಡೆ", "ಕೊಲೆ", "halle", "hodedata", "chaku", "kole"],
            "hi": ["हमला", "मारपीट", "चाकू", "बंदूक", "डकैती", "लड़ाई", "खूनखराबा", "hamla", "marpeet", "ladai", "chaku"],
            "en": ["violence", "assault", "fight", "attack", "knife", "gun", "stabbing", "robbery", "weapon"]
        },
        IncidentType.HARASSMENT: {
            "kn": ["ಕಿರುಕುಳ", "ಹಿಂಬಾಲಿಸುವುದು", "ಚುಡಾಯಿಸುವುದು", "ಬೆದರಿಕೆ", "kirukula", "himbalisuvudu", "bedarike"],
            "hi": ["छेड़छाड़", "पीछा", "परेशान", "धमकी", "बदसलूकी", "chhedchhad", "peecha", "pareshan", "dhamki"],
            "en": ["harassment", "stalking", "eve teasing", "following me", "molestation", "threat"]
        }
    }

    SPAM_PATTERNS = [
        r"^(test|testing|haha|lol|asdf|qwerty|foo|bar|12345)$",
        r"^just checking$",
        r"^[a-zA-Z\s]{1,4}$",
        r"^(test\s*)+",
        r"(test.*test|testing.*lol|haha.*haha|asdf.*qwerty)",
        r"^(\s*lol\s*)+$"
    ]

    @classmethod
    def classify(cls, text: str) -> Dict[str, Any]:
        text_lower = text.lower().strip()

        # Check for obvious spam/test strings
        is_spam = any(re.search(p, text_lower, re.IGNORECASE) for p in cls.SPAM_PATTERNS)
        if is_spam:
            return {
                "incident_type": "OTHER",
                "severity": 1,
                "confidence": 0.95,
                "possible_duplicate": False,
                "spam_flag": True,
                "reason": "Input matches synthetic or superficial test pattern",
                "detected_language": "en"
            }

        # Match multilingual emergency keywords
        detected_lang = "en"
        for inc_type, lang_dict in cls.KEYWORD_MAPPINGS.items():
            for lang, words in lang_dict.items():
                for word in words:
                    # Use whole-word boundary for ASCII words to prevent substring confusion (e.g. 'aag' in 'aagide')
                    if word.isascii():
                        is_match = bool(re.search(r'\b' + re.escape(word.lower()) + r'\b', text_lower))
                    else:
                        is_match = (word.lower() in text_lower)

                    if is_match:
                        detected_lang = lang
                        severity = 4
                        if inc_type in (IncidentType.MEDICAL, IncidentType.FIRE):
                            severity = 5
                        elif inc_type == IncidentType.HARASSMENT:
                            severity = 3

                        return {
                            "incident_type": inc_type.value,
                            "severity": severity,
                            "confidence": 0.88,
                            "possible_duplicate": False,
                            "spam_flag": False,
                            "reason": f"Emergency keyword match ({inc_type.value}) detected in {lang}",
                            "detected_language": detected_lang
                        }

        # Check script characters for language detection
        if any('\u0C80' <= c <= '\u0CFF' for c in text):
            detected_lang = "kn"
        elif any('\u0900' <= c <= '\u097F' for c in text):
            detected_lang = "hi"

        # Default classification
        return {
            "incident_type": "OTHER",
            "severity": 3,
            "confidence": 0.50,
            "possible_duplicate": False,
            "spam_flag": False,
            "reason": "Unspecified emergency incident reported by citizen",
            "detected_language": detected_lang
        }


class AITriageService:
    """
    Production-grade AI triage engine.
    Connects to configured LLM (Gemini, OpenAI, or Mock), enforces bounded timeout,
    validates JSON output with Pydantic, and guarantees safe fallback.
    """

    def __init__(
        self,
        provider: Optional[str] = None,
        timeout: Optional[float] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None
    ):
        self.provider = provider or settings.LLM_PROVIDER
        self.timeout = timeout or settings.LLM_TIMEOUT_SECONDS
        self.api_key = api_key or settings.LLM_API_KEY
        self.base_url = base_url or settings.LLM_BASE_URL
        self.model = model or settings.LLM_MODEL

    async def triage_incident(self, request: TriageRequest) -> TriageResult:
        """
        Main entry point for incident triage.
        Accepts TriageRequest and returns validated TriageResult.
        Guaranteed NEVER to raise unhandled exceptions to callers.
        """
        description = request.description.strip()
        if not description:
            return SafeFallbackTriage.get_fallback(
                reason_detail="Empty incident description provided",
                detected_language=request.language_hint
            )

        try:
            # Wrap the classification inside a strict bounded timeout
            result = await asyncio.wait_for(
                self._dispatch_classification(description, request.language_hint),
                timeout=self.timeout
            )
            return result
        except asyncio.TimeoutError:
            logger.error(f"AI Triage timed out after {self.timeout}s for text: {description[:50]}...")
            return SafeFallbackTriage.get_fallback(
                reason_detail="AI provider timed out",
                error_detail=f"Timeout after {self.timeout} seconds",
                detected_language=request.language_hint
            )
        except Exception as exc:
            logger.error(f"AI Triage exception: {type(exc).__name__}: {str(exc)}", exc_info=True)
            return SafeFallbackTriage.get_fallback(
                reason_detail="AI triage service failure",
                error_detail=f"{type(exc).__name__}: {str(exc)}",
                detected_language=request.language_hint
            )

    async def _dispatch_classification(self, text: str, language_hint: Optional[str]) -> TriageResult:
        """Routes call to mock, Gemini, Groq, Ollama, or OpenAI provider based on configuration."""
        if self.provider == "distilbert":
            # Locally trained Multilingual DistilBERT (no API key, offline)
            return self._classify_distilbert(text, language_hint)

        if self.provider == "ollama":
            # Ollama runs locally — no API key required
            return await self._call_ollama_api(text, language_hint)

        if self.provider == "mock" or not self.api_key:
            if not self.api_key and self.provider not in ("mock", "ollama"):
                logger.warning("No LLM_API_KEY configured; falling back to local multilingual mock classifier.")
            return self._classify_mock(text, language_hint)

        if self.provider == "gemini":
            return await self._call_gemini_api(text, language_hint)
        elif self.provider == "groq":
            return await self._call_groq_api(text, language_hint)
        elif self.provider in ("openai", "custom"):
            return await self._call_openai_api(text, language_hint)
        else:
            return self._classify_mock(text, language_hint)


    def _classify_distilbert(self, text: str, language_hint: Optional[str]) -> TriageResult:
        """
        Runs local inference using fine-tuned Multilingual DistilBERT.
        Zero API keys required, runs 100% offline on CPU.
        """
        import os
        import torch
        from transformers import AutoTokenizer, AutoModelForSequenceClassification

        model_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "models", "raksha_emergency_distilbert"))
        if not os.path.exists(model_dir):
            logger.warning(f"DistilBERT model directory not found at {model_dir}. Falling back to mock.")
            return self._classify_mock(text, language_hint)

        if not hasattr(self, "_distilbert_model") or self._distilbert_model is None:
            self._distilbert_tokenizer = AutoTokenizer.from_pretrained(model_dir)
            self._distilbert_model = AutoModelForSequenceClassification.from_pretrained(model_dir)
            self._distilbert_model.eval()

        inputs = self._distilbert_tokenizer(text, return_tensors="pt", truncation=True, max_length=128)
        with torch.no_grad():
            logits = self._distilbert_model(**inputs).logits
            probs = torch.softmax(logits, dim=1)
            pred_id = torch.argmax(probs, dim=1).item()
            confidence = round(float(probs[0][pred_id].item()), 2)

        pred_label = self._distilbert_model.config.id2label.get(pred_id, "OTHER")
        
        # Severity estimation heuristic based on emergency type
        severity_map = {
            "FIRE": 5,
            "MEDICAL": 5,
            "VIOLENCE": 5,
            "ACCIDENT": 4,
            "HARASSMENT": 3,
            "OTHER": 2
        }
        severity = severity_map.get(pred_label, 3)

        detected_lang = language_hint or "en"
        if any('\u0C80' <= c <= '\u0CFF' for c in text):
            detected_lang = "kn"
        elif any('\u0900' <= c <= '\u097F' for c in text):
            detected_lang = "hi"

        return self._validate_and_build({
            "incident_type": pred_label,
            "severity": severity,
            "confidence": confidence,
            "possible_duplicate": False,
            "spam_flag": False,
            "reason": f"Classified by local fine-tuned Multilingual DistilBERT ({confidence*100:.0f}% confidence)",
            "detected_language": detected_lang
        })

    def _classify_mock(self, text: str, language_hint: Optional[str]) -> TriageResult:
        """Runs fast in-memory classifier."""
        raw_dict = MockLLMClassifier.classify(text)
        if language_hint and not raw_dict.get("detected_language"):
            raw_dict["detected_language"] = language_hint
        return self._validate_and_build(raw_dict)

    async def _call_gemini_api(self, text: str, language_hint: Optional[str]) -> TriageResult:
        """
        Calls Google Gemini API via REST endpoint with bounded timeout.
        Uses gemini-2.5-flash or configured model.
        """
        model_name = self.model or "gemini-2.5-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={self.api_key}"

        prompt = f"{TRIAGE_SYSTEM_PROMPT}\n\nLanguage hint: {language_hint or 'auto'}\nCitizen Emergency Report:\n\"\"\"{text}\"\"\""

        payload = {
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json"
            }
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 429:
                raise RuntimeError("Gemini API rate limit exceeded (HTTP 429)")
            resp.raise_for_status()
            data = resp.json()

        try:
            content_text = data["candidates"][0]["content"]["parts"][0]["text"]
            parsed_json = self._parse_json_safely(content_text)
            return self._validate_and_build(parsed_json)
        except (KeyError, IndexError) as err:
            raise ValueError(f"Unexpected response structure from Gemini API: {err}")

    async def _call_openai_api(self, text: str, language_hint: Optional[str]) -> TriageResult:
        """
        Calls OpenAI or OpenAI-compatible endpoint (Groq, vLLM, Ollama) via REST.
        """
        base_url = self.base_url or "https://api.openai.com/v1"
        url = f"{base_url.rstrip('/')}/chat/completions"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": self.model or "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": TRIAGE_SYSTEM_PROMPT},
                {"role": "user", "content": f"Language hint: {language_hint or 'auto'}\nEmergency Report:\n\"\"\"{text}\"\"\""}
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code == 429:
                raise RuntimeError("LLM API rate limit exceeded (HTTP 429)")
            resp.raise_for_status()
            data = resp.json()

        try:
            content_text = data["choices"][0]["message"]["content"]
            parsed_json = self._parse_json_safely(content_text)
            return self._validate_and_build(parsed_json)
        except (KeyError, IndexError) as err:
            raise ValueError(f"Unexpected response structure from OpenAI API: {err}")

    async def _call_groq_api(self, text: str, language_hint: Optional[str]) -> TriageResult:
        """
        Calls Groq Cloud API using the OpenAI-compatible /chat/completions endpoint.
        Groq provides free, ultra-fast inference for open-source models:
          - llama-3.1-8b-instant   (fastest, default)
          - llama-3.3-70b-versatile (best quality)
          - mixtral-8x7b-32768     (large context)
          - gemma2-9b-it           (Google Gemma 2)

        Get a free API key at: https://console.groq.com/keys
        Set: LLM_PROVIDER=groq  LLM_API_KEY=gsk_...  LLM_MODEL=llama-3.1-8b-instant
        """
        model_name = self.model or "llama-3.1-8b-instant"
        url = "https://api.groq.com/openai/v1/chat/completions"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": TRIAGE_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Language hint: {language_hint or 'auto'}\n"
                        f"Emergency Report:\n\"\"\"{text}\"\"\""
                    )
                }
            ],
            "temperature": 0.1,
            "max_tokens": 300,
            "response_format": {"type": "json_object"}   # Groq supports JSON mode
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code == 429:
                raise RuntimeError("Groq API rate limit exceeded (HTTP 429). Retry after a moment.")
            if resp.status_code == 401:
                raise RuntimeError("Groq API key is invalid or missing. Check LLM_API_KEY.")
            resp.raise_for_status()
            data = resp.json()

        try:
            content_text = data["choices"][0]["message"]["content"]
            parsed_json = self._parse_json_safely(content_text)
            return self._validate_and_build(parsed_json)
        except (KeyError, IndexError) as err:
            raise ValueError(f"Unexpected response structure from Groq API: {err}")

    async def _call_ollama_api(self, text: str, language_hint: Optional[str]) -> TriageResult:
        """
        Calls a locally running Ollama server (no API key required).
        Ollama runs open-source models 100% on-device for free.

        Install Ollama: https://ollama.com/download
        Pull a model:  ollama pull llama3.2   (or mistral, phi3, gemma2, etc.)
        Start server:  ollama serve            (runs on http://localhost:11434)

        Set: LLM_PROVIDER=ollama  LLM_MODEL=llama3.2
        Optionally set: LLM_BASE_URL=http://localhost:11434  (if non-default port)
        """
        base_url = (self.base_url or "http://localhost:11434").rstrip("/")
        model_name = self.model or "llama3.2"
        url = f"{base_url}/api/chat"

        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": TRIAGE_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Language hint: {language_hint or 'auto'}\n"
                        f"Emergency Report:\n\"\"\"{text}\"\"\""
                    )
                }
            ],
            "stream": False,
            "format": "json",   # Ollama native JSON mode
            "options": {
                "temperature": 0.1,
                "num_predict": 300
            }
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 404:
                    raise RuntimeError(
                        f"Ollama model '{model_name}' not found. "
                        f"Run: ollama pull {model_name}"
                    )
                resp.raise_for_status()
                data = resp.json()
        except httpx.ConnectError:
            raise RuntimeError(
                "Cannot connect to Ollama server at "
                f"{base_url}. Is 'ollama serve' running?"
            )

        try:
            content_text = data["message"]["content"]
            parsed_json = self._parse_json_safely(content_text)
            return self._validate_and_build(parsed_json)
        except (KeyError, IndexError) as err:
            raise ValueError(f"Unexpected response structure from Ollama API: {err}")

    def _parse_json_safely(self, text: str) -> Dict[str, Any]:
        """
        Strips markdown fences and extracts raw JSON object.
        Robust against LLM conversational preamble or thought markers.
        """
        cleaned = text.strip()
        # 1. Try stripping markdown code fences
        if "```" in cleaned:
            # Extract content between markdown fences if present
            fence_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", cleaned, re.DOTALL)
            if fence_match:
                return json.loads(fence_match.group(1).strip())

        # 2. Try extracting the first valid JSON object block {...}
        json_obj_match = re.search(r"(\{[\s\S]*\})", cleaned, re.DOTALL)
        if json_obj_match:
            try:
                return json.loads(json_obj_match.group(1).strip())
            except json.JSONDecodeError:
                pass

        # 3. Direct parse fallback
        return json.loads(cleaned)

    async def run_triage_in_background(
        self,
        incident_id: str,
        description: str,
        update_callback=None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None
    ) -> TriageResult:
        """
        Convenience runner for Member 2 to execute triage asynchronously
        without blocking SOS creation or initial responder dispatch.
        """
        request = TriageRequest(
            incident_id=incident_id,
            description=description,
            latitude=latitude,
            longitude=longitude
        )
        result = await self.triage_incident(request)
        if update_callback and callable(update_callback):
            try:
                if inspect.iscoroutinefunction(update_callback):
                    await update_callback(incident_id, result)
                else:
                    update_callback(incident_id, result)
            except Exception as cb_err:
                logger.error(f"Callback failed in run_triage_in_background: {cb_err}")
        return result

    def _validate_and_build(self, raw_data: Dict[str, Any]) -> TriageResult:
        """
        Validates raw dictionary strictly against TriageResult schema.
        Rejects invalid enum values and out-of-range numbers.
        """
        return TriageResult(
            incident_type=raw_data["incident_type"],
            severity=raw_data["severity"],
            confidence=raw_data["confidence"],
            possible_duplicate=bool(raw_data.get("possible_duplicate", False)),
            spam_flag=bool(raw_data.get("spam_flag", False)),
            reason=str(raw_data.get("reason", "Classified by triage engine")),
            detected_language=raw_data.get("detected_language"),
            is_fallback=False,
            triage_error=None
        )


# Global singleton instance
triage_service = AITriageService()
