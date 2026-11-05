"""LLM provider selection through LangChain: an API key is all it takes."""
from langchain.chat_models import init_chat_model

# Supported providers, each with a default model (can be changed in the settings).
PROVIDERS = {
    "openai": {"label": "OpenAI", "default_model": "gpt-5-mini", "env": "api_key"},
    "anthropic": {"label": "Anthropic (Claude)", "default_model": "claude-haiku-5-5", "env": "api_key"},
    "google_genai": {"label": "Google (Gemini)", "default_model": "gemini-2.5-flash", "env": "google_api_key"},
    "mistralai": {"label": "Mistral AI", "default_model": "mistral-small-latest", "env": "api_key"},
}


def guess_provider(api_key: str) -> str | None:
    """Guess the provider from the key prefix."""
    key = api_key.strip()
    if key.startswith("sk-ant-"):
        return "anthropic"
    if key.startswith("AIza"):
        return "google_genai"
    if key.startswith("sk-"):
        return "openai"
    return None


def get_chat_model(settings: dict):
    provider = settings.get("provider")
    api_key = settings.get("api_key")
    if provider not in PROVIDERS or not api_key:
        raise ValueError("Renseignez un fournisseur et une clé d'API dans les réglages.")
    model = settings.get("model") or PROVIDERS[provider]["default_model"]
    key_arg = PROVIDERS[provider]["env"]
    return init_chat_model(model, model_provider=provider, temperature=0.2, **{key_arg: api_key})
