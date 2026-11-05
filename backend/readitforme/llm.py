"""LLM provider selection through LangChain: an API key is all it takes."""
from langchain.chat_models import init_chat_model

# Supported providers, each with a default model (can be changed in the settings).
PROVIDERS = {
    "openai": {"label": "OpenAI", "default_model": "gpt-5-mini", "key_param": "api_key"},
    "anthropic": {"label": "Anthropic (Claude)", "default_model": "claude-haiku-5-5", "key_param": "api_key"},
    "google_genai": {"label": "Google (Gemini)", "default_model": "gemini-3.5-flash-lite", "key_param": "google_api_key"},
    "mistralai": {"label": "Mistral AI", "default_model": "mistral-small-latest", "key_param": "api_key"},
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
        raise ValueError("Set a provider and an API key in the settings.")
    model = settings.get("model") or PROVIDERS[provider]["default_model"]
    key_arg = PROVIDERS[provider]["key_param"]
    # Bounded timeout and retries so a bad model or quota error fails fast instead of hanging.
    return init_chat_model(
        model, model_provider=provider, temperature=0.2, timeout=60, max_retries=2, **{key_arg: api_key}
    )
