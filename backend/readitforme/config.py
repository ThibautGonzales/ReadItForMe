"""Chemins et réglages locaux. Tout est stocké dans un seul dossier de données."""
import json
import os
from pathlib import Path
from threading import Lock

DATA_DIR = Path(os.environ.get("READITFORME_DATA", Path.home() / ".readitforme")).expanduser()
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "app.db"
CHROMA_DIR = DATA_DIR / "chroma"
FILES_DIR = DATA_DIR / "files"
MODELS_DIR = DATA_DIR / "models"
SETTINGS_PATH = DATA_DIR / "settings.json"
for d in (CHROMA_DIR, FILES_DIR, MODELS_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Modèle d'embeddings multilingue léger (~220 Mo), téléchargé automatiquement au premier lancement.
EMBEDDING_MODEL = os.environ.get(
    "READITFORME_EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
)

_lock = Lock()


def load_settings() -> dict:
    with _lock:
        if SETTINGS_PATH.exists():
            return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        return {}


def save_settings(settings: dict) -> None:
    with _lock:
        SETTINGS_PATH.write_text(json.dumps(settings, indent=2), encoding="utf-8")
        try:
            os.chmod(SETTINGS_PATH, 0o600)  # la clé d'API ne doit être lisible que par l'utilisateur
        except OSError:
            pass
