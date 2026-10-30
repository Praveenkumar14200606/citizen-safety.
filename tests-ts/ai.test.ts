/**
 * Unit Tests for AI Emergency Triage (TypeScript).
 */

import test from "node:test";
import assert from "node:assert";
import { AITriageService } from "../dist/services/ai/triageService.js";
import { validateTriageOutput } from "../dist/services/ai/triageValidation.js";
import { getSafeFallbackTriage } from "../dist/services/ai/fallback.js";

test("AI Triage - Kannada Accident Classification", async () => {
  const service = new AITriageService({ provider: "mock" });
  const result = await service.triageIncident({
    description: "ಇಲ್ಲಿ ತೀವ್ರವಾದ ಅಪಘಾತವಾಗಿದೆ, ರಸ್ತೆಯಲ್ಲಿ ರಕ್ತ ಸುರಿಯುತ್ತಿದೆ",
    language_hint: "kn",
  });

  assert.strictEqual(result.incident_type, "ACCIDENT");
  assert.ok(result.severity >= 4);
  assert.ok(result.confidence >= 0.8);
  assert.strictEqual(result.spam_flag, false);
  assert.strictEqual(result.is_fallback, false);
  assert.strictEqual(result.detected_language, "kn");
  assert.ok(result.medical_disclaimer.toLowerCase().includes("advisory"));
});

test("AI Triage - Kannada Medical Emergency (Cardiac)", async () => {
  const service = new AITriageService({ provider: "mock" });
  const result = await service.triageIncident({
    description: "ಒಬ್ಬ ವ್ಯಕ್ತಿಗೆ ಹೃದಯಾಘಾತವಾಗಿದೆ, ಉಸಿರಾಟ ನಿಂತಿದೆ, ಆಂಬ್ಯುಲೆನ್ಸ್ ಬೇಕು",
    language_hint: "kn",
  });

  assert.strictEqual(result.incident_type, "MEDICAL");
  assert.strictEqual(result.severity, 5);
  assert.ok(result.confidence >= 0.8);
});

test("AI Triage - Hindi Harassment Classification", async () => {
  const service = new AITriageService({ provider: "mock" });
  const result = await service.triageIncident({
    description: "यहाँ एक महिला के साथ छेड़छाड़ हो रही है, कोई पीछा कर रहा है",
    language_hint: "hi",
  });

  assert.strictEqual(result.incident_type, "HARASSMENT");
  assert.ok(result.severity >= 3);
  assert.strictEqual(result.spam_flag, false);
  assert.strictEqual(result.detected_language, "hi");
});

test("AI Triage - Hindi Fire Emergency", async () => {
  const service = new AITriageService({ provider: "mock" });
  const result = await service.triageIncident({
    description: "इमारत में भयानक आग लग गई है, चारों तरफ धुआं है",
    language_hint: "hi",
  });

  assert.strictEqual(result.incident_type, "FIRE");
  assert.strictEqual(result.severity, 5);
});

test("AI Triage - English Fire Emergency", async () => {
  const service = new AITriageService({ provider: "mock" });
  const result = await service.triageIncident({
    description: "Fire broke out on the second floor, smoke everywhere and people trapped",
    language_hint: "en",
  });

  assert.strictEqual(result.incident_type, "FIRE");
  assert.strictEqual(result.severity, 5);
  assert.strictEqual(result.is_fallback, false);
});

test("AI Triage - Transliterated Kanglish & Hinglish", async () => {
  const service = new AITriageService({ provider: "mock" });

  // Kanglish
  const resKn = await service.triageIncident({
    description: "gaadi accident aagide rasteyalli",
  });
  assert.strictEqual(resKn.incident_type, "ACCIDENT");
  assert.ok(resKn.severity >= 4);

  // Hinglish
  const resHi = await service.triageIncident({
    description: "shop me aag lagi hai jal raha hai",
  });
  assert.strictEqual(resHi.incident_type, "FIRE");
  assert.strictEqual(resHi.severity, 5);
});

test("AI Triage - Empty Description Safe Fallback", async () => {
  const service = new AITriageService({ provider: "mock" });
  const result = await service.triageIncident({ description: "   " });

  assert.strictEqual(result.incident_type, "OTHER");
  assert.strictEqual(result.severity, 3);
  assert.strictEqual(result.confidence, 0.0);
  assert.strictEqual(result.is_fallback, true);
});

test("AI Triage - Strict Schema Validation Rejects Illegal Fields", () => {
  // Invalid enum
  const resInvalidEnum = validateTriageOutput({
    incident_type: "BURGLARY_THEFT",
    severity: 2,
    confidence: 0.8,
    reason: "Stolen cycle",
  });
  assert.strictEqual(resInvalidEnum.valid, false);
  assert.ok(resInvalidEnum.error?.includes("Invalid incident_type"));

  // Out of range severity
  const resInvalidSev = validateTriageOutput({
    incident_type: "FIRE",
    severity: 10,
    confidence: 0.8,
    reason: "Big fire",
  });
  assert.strictEqual(resInvalidSev.valid, false);
  assert.ok(resInvalidSev.error?.includes("range [1, 5]"));

  // Out of range confidence
  const resInvalidConf = validateTriageOutput({
    incident_type: "FIRE",
    severity: 4,
    confidence: 1.5,
    reason: "Fire",
  });
  assert.strictEqual(resInvalidConf.valid, false);
  assert.ok(resInvalidConf.error?.includes("range [0.0, 1.0]"));
});

test("AI Triage - Conversational JSON Extraction", () => {
  const service = new AITriageService();
  const rawText = `
  Here is your triage evaluation:
  \`\`\`json
  {
    "incident_type": "ACCIDENT",
    "severity": 4,
    "confidence": 0.91,
    "possible_duplicate": false,
    "spam_flag": false,
    "reason": "Collision on outer ring road"
  }
  \`\`\`
  Please dispatch nearby units.
  `;

  const parsed = service.parseJsonSafely(rawText);
  const validated = validateTriageOutput(parsed);
  assert.strictEqual(validated.valid, true);
  assert.strictEqual(validated.data?.incident_type, "ACCIDENT");
  assert.strictEqual(validated.data?.severity, 4);
});

test("AI Triage - Spam Flag Policy (Never Suppresses SOS)", async () => {
  const service = new AITriageService({ provider: "mock" });
  const result = await service.triageIncident({ description: "test test testing lol" });

  assert.strictEqual(result.spam_flag, true);
  assert.strictEqual(result.severity, 1);
  assert.strictEqual(result.is_fallback, false);
  assert.ok(result.medical_disclaimer.length > 0);
});
