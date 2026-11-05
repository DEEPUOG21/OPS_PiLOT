import re

DOCUMENTS = [
    {'id': 'refunds', 'title': 'Refund policy', 'text': 'You can request a refund within 30 days of purchase. Contact support with your order number. Refunds are returned to the original payment method within 5 business days.'},
    {'id': 'password', 'title': 'Reset your password', 'text': 'To reset your password, select Forgot password on the sign-in page. Enter your account email and follow the reset link. The link expires after 60 minutes.'},
    {'id': 'plans', 'title': 'Team plans', 'text': 'The Team plan includes shared projects, role-based access, and priority support. You can upgrade your plan from Settings, then Billing.'},
    {'id': 'export', 'title': 'Export telemetry', 'text': 'You can export telemetry as JSON from the trace detail page. Each export includes spans, attributes, and captured events. Protect exports because prompts may contain sensitive information.'},
    {'id': 'security', 'title': 'API keys', 'text': 'Create an API key in Settings. Store API keys in environment variables on your server. Rotate a compromised key immediately. Never embed a provider key in a frontend application.'},
]


def words(text):
    return set(re.findall(r'[a-z0-9]+', text.lower())) - {'a', 'an', 'the', 'is', 'are', 'to', 'of', 'and', 'in', 'on', 'it', 'i', 'my', 'can', 'you', 'your', 'how', 'do', 'what', 'with', 'for'}


def retrieve(question, k):
    query = words(question)
    ranked = sorted(DOCUMENTS, key=lambda d: len(query & words(d['title'] + ' ' + d['text'])), reverse=True)
    return ranked[:k]
