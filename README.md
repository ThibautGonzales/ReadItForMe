# ReadItForMe

Un chatbot local pour poser des questions à vos PDF. Vous créez des conversations, vous y glissez
vos documents, et vous discutez avec eux. Il suffit d'une clé d'API (OpenAI, Anthropic, Google ou Mistral).

## Lancer l'application

- **Windows** : double-cliquez sur `start.bat`.
- **macOS / Linux** : `./start.sh`

C'est tout. Au premier lancement, le script installe [uv](https://docs.astral.sh/uv/) s'il manque,
qui télécharge lui-même Python et les dépendances. Le navigateur s'ouvre ensuite sur
http://127.0.0.1:8000, où il reste à coller votre clé d'API dans les réglages.

Le modèle d'embeddings (multilingue, ~220 Mo) se télécharge automatiquement au premier démarrage.
Il tourne en local sur le processeur, sans Ollama ni carte graphique.

## Où sont mes données ?

Tout est dans `~/.readitforme` (ou le dossier indiqué par `READITFORME_DATA`) :
conversations (`app.db`, SQLite), base vectorielle (`chroma/`), PDF déposés (`files/`),
modèle d'embeddings (`models/`) et réglages (`settings.json`, qui contient la clé d'API).
La clé ne quitte jamais cet ordinateur, sauf vers le fournisseur choisi, et n'est jamais renvoyée au navigateur.

## Architecture

```
backend/          FastAPI (un seul processus qui sert l'API et l'interface)
  readitforme/main.py     routes : réglages, conversations, documents, messages
  readitforme/llm.py      choix du fournisseur via LangChain init_chat_model
  readitforme/rag.py      lecture PDF (pypdf), découpage, embeddings FastEmbed, Chroma (une collection par conversation)
  readitforme/db.py       SQLite
  readitforme/static/     interface Angular compilée (versionnée pour que l'utilisateur n'ait pas besoin de Node)
frontend/         sources Angular
```

Limites actuelles : PDF texte uniquement (pas d'OCR pour les scans), réponses non diffusées en streaming.

## Développement

```sh
# Backend (http://127.0.0.1:8000)
cd backend && READITFORME_NO_BROWSER=1 uv run readitforme

# Front avec rechargement à chaud (http://localhost:4200, /api redirigé vers le backend)
cd frontend && npm install && npx ng serve

# Recompiler l'interface servie par FastAPI
cd frontend && npx ng build
```

Variables utiles : `READITFORME_PORT`, `READITFORME_HOST`, `READITFORME_DATA`, `READITFORME_EMBEDDING_MODEL`.
