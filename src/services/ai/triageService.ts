/**
 * Server-side AI Triage Service in TypeScript.
 * Enforces bounded timeouts, strict schema validation, multilingual comprehension,
 * and deterministic safe fallbacks.
 */

import { IncidentType, TriageRequest, TriageResult } from "../../types/ai.js";
import { TRIAGE_SYSTEM_PROMPT } from "./triageSchema.js";
import { validateTriageOutput } from "./triageValidation.js";
import { getSafeFallbackTriage } from "./fallback.js";

interface KeywordMapping {
  kn: string[];
  hi: string[];
  en: string[];
}

export class MockMultilingualClassifier {
  private static readonly KEYWORDS: Record<IncidentType, KeywordMapping> = {
    FIRE: {
      kn: ["ಬೆಂಕಿ", "ಹೊಗೆ", "ಸುಡುತ್ತಿದೆ", "ಜ್ವಾಲೆ", "benki", "hoge", "suduttide"],
      hi: ["आग", "धुआं", "धुआँ", "जल रहा", "लपटें", "aag", "dhuan", "dhuwan", "jal raha"],
      en: ["fire", "blaze", "smoke", "flames", "burning", "explosion"],
    },
    ACCIDENT: {
      kn: ["ಅಪಘಾತ", "ಡಿಕ್ಕಿ", "ರಕ್ತ", "ವಾಹನ ಪಲ್ಟಿ", "ಗುದ್ದಿದೆ", "apaghatha", "accident", "dikkki", "palti"],
      hi: ["दुर्घटना", "एक्सीडेंट", "टक्कर", "खून", "गाड़ी पलट गई", "durghatna", "takkar", "khoon", "gaadi gir"],
      en: ["accident", "crash", "collision", "hit and run", "run over", "bike fall"],
    },
    MEDICAL: {
      kn: ["ಹೃದಯಾಘಾತ", "ಉಸಿರಾಟ", "ಪ್ರಜ್ಞೆ ತಪ್ಪಿದೆ", "ಆಸ್ಪತ್ರೆ", "ನೋವು", "ಆಂಬ್ಯುಲೆನ್ಸ್", "hrudayaghatha", "ambulance", "usirata"],
      hi: ["दिल का दौरा", "सांस", "बेहोश", "अस्पताल", "दर्द", "एम्बुलेंस", "हार्ट अटैक", "behoshi", "saans", "aspatal"],
      en: ["medical", "heart attack", "unconscious", "breathing", "ambulance", "bleeding", "stroke", "collapsed", "cpr"],
    },
    VIOLENCE: {
      kn: ["ಹಲ್ಲೆ", "ಹೊಡೆದಾಟ", "ಚಾಕು", "ಬಂದೂಕು", "ದರೋಡೆ", "ಕೊಲೆ", "halle", "hodedata", "chaku", "kole"],
      hi: ["हमला", "मारपीट", "चाकू", "बंदूक", "डकैती", "लड़ाई", "खूनखराबा", "hamla", "marpeet", "ladai", "chaku"],
      en: ["violence", "assault", "fight", "attack", "knife", "gun", "stabbing", "robbery", "weapon"],
    },
    HARASSMENT: {
      kn: ["ಕಿರುಕುಳ", "ಹಿಂಬಾಲಿಸುವುದು", "ಚುಡಾಯಿಸುವುದು", "ಬೆದರಿಕೆ", "kirukula", "himbalisuvudu", "bedarike"],
      hi: ["छेड़छाड़", "पीछा", "परेशान", "धमकी", "बदसलूकी", "chhedchhad", "peecha", "pareshan", "dhamki"],
      en: ["harassment", "stalking", "eve teasing", "following me", "molestation", "threat"],
    },
    OTHER: { kn: [], hi: [], en: [] },
  };

  private static readonly SPAM_PATTERNS = [
    /^(test|testing|haha|lol|asdf|qwerty|foo|bar|12345)$/i,
    /^just checking$/i,
    /^[a-zA-Z\s]{1,4}$/,
    /(test.*test|testing.*lol|haha.*haha|asdf.*qwerty)/i,
    /^(\s*lol\s*)+$/i,
  ];

  public static classify(text: string): Record<string, unknown> {
    const textLower = text.toLowerCase().trim();

    // Check for spam patterns
    const isSpam = this.SPAM_PATTERNS.some((p) => p.test(textLower));
    if (isSpam) {
      return {
        incident_type: "OTHER",
        severity: 1,
        confidence: 0.95,
        possible_duplicate: false,
        spam_flag: true,
        reason: "Input matches synthetic or superficial test pattern",
        detected_language: "en",
      };
    }

    // Keyword matching
    let detectedLang = "en";
    const entries = Object.entries(this.KEYWORDS) as [IncidentType, KeywordMapping][];

    for (const [incType, langDict] of entries) {
      for (const [lang, words] of Object.entries(langDict) as [string, string[]][]) {
        for (const word of words) {
          const isAscii = /^[\x00-\x7F]*$/.test(word);
          let matched = false;

          if (isAscii) {
            const regex = new RegExp(`\\b${word}\\b`, "i");
            matched = regex.test(textLower);
          } else {
            matched = textLower.includes(word.toLowerCase());
          }

          if (matched) {
            detectedLang = lang;
            let severity = 4;
            if (incType === "MEDICAL" || incType === "FIRE") {
              severity = 5;
            } else if (incType === "HARASSMENT") {
              severity = 3;
            }

            return {
              incident_type: incType,
              severity,
              confidence: 0.88,
              possible_duplicate: false,
              spam_flag: false,
              reason: `Emergency keyword match (${incType}) detected in ${lang}`,
              detected_language: detectedLang,
            };
          }
        }
      }
    }

    // Character script check
    if (/[\u0C80-\u0CFF]/.test(text)) {
      detectedLang = "kn";
    } else if (/[\u0900-\u097F]/.test(text)) {
      detectedLang = "hi";
    }

    return {
      incident_type: "OTHER",
      severity: 3,
      confidence: 0.5,
      possible_duplicate: false,
      spam_flag: false,
      reason: "Unspecified emergency incident reported by citizen",
      detected_language: detectedLang,
    };
  }
}

export class AITriageService {
  private readonly timeoutMs: number;
  private readonly provider: string;
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl?: string;

  constructor(options?: {
    timeoutMs?: number;
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  }) {
    this.timeoutMs = options?.timeoutMs ?? 5000;
    this.provider = options?.provider ?? process.env.LLM_PROVIDER ?? "mock";
    this.apiKey = options?.apiKey ?? process.env.LLM_API_KEY;
    this.model = options?.model ?? process.env.LLM_MODEL ?? "gemini-2.5-flash";
    this.baseUrl = options?.baseUrl ?? process.env.LLM_BASE_URL;
  }

  public async triageIncident(request: TriageRequest): Promise<TriageResult> {
    const description = request.description?.trim();
    if (!description) {
      return getSafeFallbackTriage(
        "Empty incident description provided",
        "Description was missing or whitespace",
        request.language_hint
      );
    }

    try {
      // Enforce bounded timeout
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const rawOutput = await this.dispatchProvider(description, request.language_hint, controller.signal);
        clearTimeout(timer);

        const validated = validateTriageOutput(rawOutput);
        if (validated.valid && validated.data) {
          return validated.data;
        }

        return getSafeFallbackTriage(
          "LLM response failed schema validation",
          validated.error ?? "Schema validation error",
          request.language_hint
        );
      } catch (err: unknown) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === "AbortError") {
          return getSafeFallbackTriage(
            "AI provider timed out",
            `Timeout exceeded ${this.timeoutMs}ms`,
            request.language_hint
          );
        }
        throw err;
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return getSafeFallbackTriage("AI triage service failure", errorMsg, request.language_hint);
    }
  }

  private async dispatchProvider(
    text: string,
    languageHint?: string,
    signal?: AbortSignal
  ): Promise<unknown> {
    if (this.provider === "mock" || !this.apiKey) {
      const raw = MockMultilingualClassifier.classify(text);
      if (languageHint && !raw.detected_language) {
        raw.detected_language = languageHint;
      }
      return raw;
    }

    if (this.provider === "gemini") {
      return this.callGeminiApi(text, languageHint, signal);
    } else if (this.provider === "openai" || this.provider === "custom") {
      return this.callOpenAiApi(text, languageHint, signal);
    }

    return MockMultilingualClassifier.classify(text);
  }

  private async callGeminiApi(text: string, languageHint?: string, signal?: AbortSignal): Promise<unknown> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const prompt = `${TRIAGE_SYSTEM_PROMPT}\n\nLanguage hint: ${languageHint || "auto"}\nCitizen Emergency Report:\n"""${text}"""`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (response.status === 429) {
      throw new Error("Gemini API rate limit exceeded (HTTP 429)");
    }
    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!contentText) {
      throw new Error("Empty candidate text in Gemini response");
    }

    return this.parseJsonSafely(contentText);
  }

  private async callOpenAiApi(text: string, languageHint?: string, signal?: AbortSignal): Promise<unknown> {
    const baseUrl = this.baseUrl || "https://api.openai.com/v1";
    const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal,
      body: JSON.stringify({
        model: this.model || "gpt-4o-mini",
        messages: [
          { role: "system", content: TRIAGE_SYSTEM_PROMPT },
          { role: "user", content: `Language hint: ${languageHint || "auto"}\nEmergency Report:\n"""${text}"""` },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (response.status === 429) {
      throw new Error("OpenAI API rate limit exceeded (HTTP 429)");
    }
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const contentText = data.choices?.[0]?.message?.content;
    if (!contentText) {
      throw new Error("Empty content in OpenAI response");
    }

    return this.parseJsonSafely(contentText);
  }

  public parseJsonSafely(text: string): unknown {
    const cleaned = text.trim();

    // 1. Check markdown code fence
    const fenceMatch = cleaned.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (fenceMatch?.[1]) {
      return JSON.parse(fenceMatch[1].trim());
    }

    // 2. Extract first matching outer JSON object {...}
    const jsonMatch = cleaned.match(/(\{[\s\S]*\})/);
    if (jsonMatch?.[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // Fall through to direct parse
      }
    }

    return JSON.parse(cleaned);
  }
}

export const triageService = new AITriageService();
