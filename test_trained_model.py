import sys
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

model_path = "backend/models/raksha_emergency_distilbert"
print(f"Loading local trained model from {model_path}...")
tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForSequenceClassification.from_pretrained(model_path)
model.eval()

test_cases = [
    ("Building is on fire, smoke everywhere, need fire engine", "en"),
    ("Kisi ko chaku ghonpa gaya hai, khoon bahut aa raha hai", "hi"),
    ("ಯಾರೋ ನನ್ನನ್ನು ಹಿಂಬಾಲಿಸುತ್ತಿದ್ದಾರೆ, ನನಗೆ ಭಯ ಆಗುತ್ತಿದೆ", "kn"),
    ("Serious road accident, car overturned on highway", "en"),
    ("ಹೃದಯಾಘಾತ ಆಗಿದೆ, ತಕ್ಷಣ ಆಂಬ್ಯುಲೆನ್ಸ್ ಕಳಿಸಿ", "kn"),
    ("Water pipe burst flooding the entire street", "en")
]

id2label = model.config.id2label

print("\n" + "="*65)
print("🎯 LIVE PREDICTIONS FROM LOCALLY TRAINED RAKSHA TRANSFORMER")
print("="*65)
for text, lang in test_cases:
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=128)
    with torch.no_grad():
        logits = model(**inputs).logits
        probs = torch.softmax(logits, dim=1)
        pred_id = torch.argmax(probs, dim=1).item()
        confidence = probs[0][pred_id].item()
    print(f"[{lang.upper()}] \"{text[:40]}...\"")
    print(f"      👉 Predicted: {id2label[pred_id]} (Confidence: {confidence*100:.1f}%)\n")
print("="*65)
