"""Local paths and settings. Everything is stored in a single data folder."""
import json
import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("READITFORME_DATA", Path.home() / ".readitforme")).expanduser()
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "app.db"
CHROMA_DIR = DATA_DIR / "chroma"
FILES_DIR = DATA_DIR / "files"
MODELS_DIR = DATA_DIR / "models"
SETTINGS_PATH = DATA_DIR / "settings.json"
for d in (CHROMA_DIR, FILES_DIR, MODELS_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Lightweight multilingual embedding model (~220 MB), downloaded automatically on first launch.
EMBEDDING_MODEL = os.environ.get(
    "READITFORME_EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
)

# Upload limits, per conversation.
MAX_DOCUMENTS_PER_CONVERSATION = int(os.environ.get("READITFORME_MAX_DOCUMENTS", "5"))
MAX_TOTAL_MB_PER_CONVERSATION = int(os.environ.get("READITFORME_MAX_TOTAL_MB", "200"))
MAX_TOTAL_BYTES_PER_CONVERSATION = MAX_TOTAL_MB_PER_CONVERSATION * 1024 * 1024


def load_settings() -> dict:
    if SETTINGS_PATH.exists():
        return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    return {}


def save_settings(settings: dict) -> None:
    SETTINGS_PATH.write_text(json.dumps(settings, indent=2), encoding="utf-8")
    try:
        os.chmod(SETTINGS_PATH, 0o600)  # the API key must only be readable by the user
    except OSError:
        pass
