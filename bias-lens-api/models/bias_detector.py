from transformers import pipeline


class BiasDetector:
    def __init__(self):
        # Zero-shot NLI classifier — no task-specific fine-tuning required,
        # works out of the box with any candidate labels.
        self.bias_pipeline = pipeline(
            "zero-shot-classification",
            model="typeform/distilbert-base-uncased-mnli",
        )
        self.sentiment_pipeline = pipeline(
            "sentiment-analysis",
            model="cardiffnlp/twitter-roberta-base-sentiment-latest",
            truncation=True,
            max_length=512,
        )

    def detect(self, text: str) -> dict:
        bias_result = self.bias_pipeline(
            text[:512],  # zero-shot is slower; truncate hard for speed
            candidate_labels=["biased", "unbiased"],
        )
        # bias_result["labels"][0] is the highest-scoring label
        top_label = bias_result["labels"][0]
        top_score = bias_result["scores"][0]

        sentiment_result = self.sentiment_pipeline(text)[0]
        emotional_intensity = (
            sentiment_result["score"] if sentiment_result["label"] != "neutral" else 0.1
        )

        top_phrases = list(dict.fromkeys(w for w in text.split() if len(w) > 6))[:5]

        return {
            "label": top_label,           # "biased" | "unbiased"
            "score": round(top_score, 4),
            "emotional_intensity": round(emotional_intensity, 4),
            "top_phrases": top_phrases,
        }
