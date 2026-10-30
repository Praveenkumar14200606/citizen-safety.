"""
Core Configuration for Raksha AI & Location-Logic Engine.
Manages environment variables, timeouts, LLM settings, and dispatch thresholds.
"""

from typing import Literal, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Project metadata
    PROJECT_NAME: str = "Raksha Citizen Safety Engine"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False

    # AI Triage settings
    # Providers: "gemini" | "openai" | "groq" | "ollama" | "custom" | "mock"
    LLM_PROVIDER: Literal["gemini", "openai", "groq", "ollama", "custom", "mock"] = "mock"
    LLM_API_KEY: Optional[str] = None
    LLM_MODEL: str = "llama-3.1-8b-instant"   # default: Groq free-tier model
    LLM_BASE_URL: Optional[str] = None         # Ollama: http://localhost:11434
    LLM_TIMEOUT_SECONDS: float = 10.0          # Raised slightly for local Ollama cold starts
    LLM_MAX_RETRIES: int = 1

    # Location & Dispatch defaults (MVP Rules)
    INITIAL_SEARCH_RADIUS_METERS: int = 300
    EXPANDED_SEARCH_RADIUS_METERS: int = 500
    RADIUS_EXPANSION_THRESHOLD_SECONDS: int = 30

    # Candidate Duplicate Detection defaults
    DUPLICATE_DISTANCE_THRESHOLD_METERS: float = 200.0
    DUPLICATE_TIME_WINDOW_SECONDS: int = 1800  # 30 minutes
    DUPLICATE_TEXT_SIMILARITY_THRESHOLD: float = 0.45

    # Responder Freshness & Scoring
    MAX_LOCATION_AGE_SECONDS: int = 1800  # Responders with pings > 30m are considered stale
    TRUST_LEVEL_WEIGHT: float = 0.35
    DISTANCE_WEIGHT: float = 0.45
    FRESHNESS_WEIGHT: float = 0.20


settings = Settings()
