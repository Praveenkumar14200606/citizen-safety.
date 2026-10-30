"""
Raksha Multilingual Emergency Classifier Training Script
Downloads pretrained multilingual Transformer (distilbert-base-multilingual-cased)
and fine-tunes it on Raksha incident data across English, Hindi, and Kannada.
"""

import os
import sys
import json
import torch

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from torch.optim import AdamW
from sklearn.model_selection import train_test_split

# Output directory for the trained weights
MODEL_DIR = os.path.join(os.path.dirname(__file__), "backend", "models", "raksha_emergency_distilbert")
os.makedirs(MODEL_DIR, exist_ok=True)

# 6 Canonical Raksha incident classes
LABEL_LIST = ["MEDICAL", "HARASSMENT", "VIOLENCE", "ACCIDENT", "FIRE", "OTHER"]
LABEL2ID = {label: i for i, label in enumerate(LABEL_LIST)}
ID2LABEL = {i: label for i, label in enumerate(LABEL_LIST)}

class EmergencyDataset(Dataset):
    def __init__(self, texts, labels, severities, tokenizer, max_length=128):
        self.texts = texts
        self.labels = labels
        self.severities = severities
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        text = str(self.texts[idx])
        label = self.labels[idx]
        
        encoding = self.tokenizer(
            text,
            truncation=True,
            padding="max_length",
            max_length=self.max_length,
            return_tensors="pt"
        )
        
        return {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
            "label": torch.tensor(label, dtype=torch.long),
            "severity": torch.tensor(self.severities[idx], dtype=torch.long)
        }

def train():
    print("=" * 60)
    print("[*] Starting Raksha Emergency Transformer Model Training")
    print("=" * 60)
    
    # 1. Load data
    data_path = os.path.join(os.path.dirname(__file__), "training_data.json")
    with open(data_path, "r", encoding="utf-8") as f:
        samples = json.load(f)
        
    texts = [s["text"] for s in samples]
    labels = [LABEL2ID[s["incident_type"]] for s in samples]
    severities = [s.get("severity", 3) for s in samples]
    
    print(f"Loaded {len(texts)} training samples.")
    
    # Train / validation split
    train_texts, val_texts, train_labels, val_labels, train_sev, val_sev = train_test_split(
        texts, labels, severities, test_size=0.15, random_state=42, stratify=labels
    )
    
    # 2. Download Pretrained Tokenizer & Model
    pretrained_name = "distilbert-base-multilingual-cased"
    print(f"\n[+] Step 1: Downloading pretrained '{pretrained_name}' from Hugging Face...")
    tokenizer = AutoTokenizer.from_pretrained(pretrained_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        pretrained_name,
        num_labels=len(LABEL_LIST),
        id2label=ID2LABEL,
        label2id=LABEL2ID
    )
    
    # 3. Prepare DataLoaders
    train_dataset = EmergencyDataset(train_texts, train_labels, train_sev, tokenizer)
    val_dataset = EmergencyDataset(val_texts, val_labels, val_sev, tokenizer)
    
    train_loader = DataLoader(train_dataset, batch_size=8, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=8, shuffle=False)
    
    # 4. Training configuration
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Compute Device: {device}")
    model.to(device)
    
    optimizer = AdamW(model.parameters(), lr=3e-5, weight_decay=0.01)
    criterion = nn.CrossEntropyLoss()
    
    epochs = 4
    print(f"\n[+] Step 2: Fine-tuning model for {epochs} epochs...")
    
    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0.0
        correct = 0
        total = 0
        
        for batch in train_loader:
            optimizer.zero_grad()
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            targets = batch["label"].to(device)
            
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            logits = outputs.logits
            loss = criterion(logits, targets)
            
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            preds = torch.argmax(logits, dim=1)
            correct += (preds == targets).sum().item()
            total += targets.size(0)
            
        train_acc = (correct / total) * 100
        avg_loss = total_loss / len(train_loader)
        
        # Validation
        model.eval()
        val_correct = 0
        val_total = 0
        with torch.no_grad():
            for batch in val_loader:
                input_ids = batch["input_ids"].to(device)
                attention_mask = batch["attention_mask"].to(device)
                targets = batch["label"].to(device)
                
                outputs = model(input_ids=input_ids, attention_mask=attention_mask)
                preds = torch.argmax(outputs.logits, dim=1)
                val_correct += (preds == targets).sum().item()
                val_total += targets.size(0)
                
        val_acc = (val_correct / val_total) * 100
        print(f"  Epoch {epoch}/{epochs} | Loss: {avg_loss:.4f} | Train Acc: {train_acc:.1f}% | Val Acc: {val_acc:.1f}%")

    # 5. Save model weights and tokenizer
    print(f"\n[+] Step 3: Saving trained model to {MODEL_DIR}...")
    model.save_pretrained(MODEL_DIR)
    tokenizer.save_pretrained(MODEL_DIR)
    
    # Save metadata
    meta = {
        "model_type": "distilbert-base-multilingual-cased",
        "labels": LABEL_LIST,
        "classes": ID2LABEL,
        "val_accuracy": val_acc
    }
    with open(os.path.join(MODEL_DIR, "raksha_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
        
    print("=" * 60)
    print("[SUCCESS] Training complete! Model saved and ready for local inference.")
    print("=" * 60)

if __name__ == "__main__":
    train()
