"""ReadItForMe server: API + web UI in a single process."""
import json
import os
import shutil
import threading
import webbrowser
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException, UploadFile
from fastapi.responses import FileResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel

from . import rag
from .config import FILES_DIR, load_settings, save_settings
from .db import connect, init_db, now, rows
from .llm import PROVIDERS, get_chat_model, guess_provider

@asynccontextmanager
async def lifespan(_app):
    init_db()
    # Warm up the embedding model in the background (downloaded on first launch).
    threading.Thread(target=rag.embedder, daemon=True).start()
    yield


app = FastAPI(title="ReadItForMe", lifespan=lifespan)
STATIC_DIR = Path(__file__).parent / "static"
DEFAULT_TITLE = "New conversation"

SYSTEM_PROMPT = """You are an assistant that answers questions based on the documents provided by the user.
Answer in the language of the question. Rely only on the excerpts below and cite them
by their number, for example [1]. If the answer is not in them, simply say so.

Always format your answer in Markdown so it renders nicely: short paragraphs, **bold** for key ideas,
numbered or bulleted lists for several points, "###" headings only for long structured answers, and
tables when comparing items. Put citations like [1] or [2, 3] right after the sentence they support,
never in a separate list at the end. Do not wrap the whole answer in a code block.

You only ever see a few excerpts of the documents, never their full text, because sending whole
documents to the model would be too expensive. If the user asks for something that needs the whole
document (for example a summary of the entire document, an overview of every chapter, or a full list
of everything it contains), do not pretend to cover the whole document. Briefly explain that you only
read a few relevant excerpts for cost reasons, so a complete summary is not possible. Then share what
the excerpts below do show, citing them, and invite the user to ask about a specific topic, section
or question so you can find the most relevant passages.

Excerpts:
{context}"""


# ---------- Settings ----------

class SettingsIn(BaseModel):
    provider: str | None = None
    model: str | None = None
    api_key: str | None = None


def public_settings() -> dict:
    s = load_settings()
    key = s.get("api_key") or ""
    return {
        "provider": s.get("provider"),
        "model": s.get("model") or (PROVIDERS[s["provider"]]["default_model"] if s.get("provider") in PROVIDERS else None),
        "has_key": bool(key),
        "key_hint": f"…{key[-4:]}" if len(key) > 8 else None,  # the key is never sent back to the browser
        "providers": [{"id": k, **{x: v[x] for x in ("label", "default_model")}} for k, v in PROVIDERS.items()],
    }


@app.get("/api/settings")
def get_settings():
    return public_settings()


@app.put("/api/settings")
def put_settings(body: SettingsIn):
    s = load_settings()
    if body.api_key:
        s["api_key"] = body.api_key.strip()
        if not body.provider:
            s["provider"] = guess_provider(s["api_key"]) or s.get("provider")
    if body.provider:
        if body.provider not in PROVIDERS:
            raise HTTPException(400, "Unknown provider")
        if body.provider != s.get("provider"):
            s.pop("model", None)
        s["provider"] = body.provider
    if body.model is not None:
        s["model"] = body.model.strip() or None
    save_settings(s)
    return public_settings()


@app.post("/api/settings/test")
def test_settings():
    try:
        get_chat_model(load_settings()).invoke("Just reply OK.")
    except Exception as e:
        raise HTTPException(400, f"Could not connect to the model: {e}")
    return {"ok": True}


@app.get("/api/status")
def status():
    return {"embeddings_ready": rag.embedder.cache_info().currsize > 0}


# ---------- Conversations ----------

class ConversationIn(BaseModel):
    title: str | None = None


def get_conversation(conn, cid: int) -> dict:
    row = conn.execute("SELECT * FROM conversations WHERE id=?", (cid,)).fetchone()
    if not row:
        raise HTTPException(404, "Conversation not found")
    return dict(row)


@app.get("/api/conversations")
def list_conversations():
    with connect() as conn:
        return rows(conn.execute("SELECT * FROM conversations ORDER BY id DESC"))


@app.post("/api/conversations")
def create_conversation(body: ConversationIn):
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO conversations (title, created_at) VALUES (?, ?)",
            (body.title or DEFAULT_TITLE, now()),
        )
        return get_conversation(conn, cur.lastrowid)


@app.patch("/api/conversations/{cid}")
def rename_conversation(cid: int, body: ConversationIn):
    with connect() as conn:
        get_conversation(conn, cid)
        conn.execute("UPDATE conversations SET title=? WHERE id=?", (body.title or "Untitled", cid))
        return get_conversation(conn, cid)


@app.delete("/api/conversations/{cid}")
def delete_conversation(cid: int):
    with connect() as conn:
        get_conversation(conn, cid)
        conn.execute("DELETE FROM conversations WHERE id=?", (cid,))
    rag.drop_collection(cid)
    shutil.rmtree(FILES_DIR / str(cid), ignore_errors=True)
    return {"ok": True}


# ---------- Documents ----------

def process_document(cid: int, doc_id: int, filename: str, path: Path) -> None:
    try:
        pages, chunks = rag.ingest_pdf(cid, doc_id, filename, path)
        status, error = "ready", None
    except Exception as e:
        pages, chunks, status, error = None, None, "error", str(e)
    with connect() as conn:
        conn.execute(
            "UPDATE documents SET status=?, error=?, pages=?, chunks=? WHERE id=?",
            (status, error, pages, chunks, doc_id),
        )


@app.get("/api/conversations/{cid}/documents")
def list_documents(cid: int):
    with connect() as conn:
        get_conversation(conn, cid)
        return rows(conn.execute("SELECT * FROM documents WHERE conversation_id=? ORDER BY id", (cid,)))


@app.post("/api/conversations/{cid}/documents")
async def upload_documents(cid: int, files: list[UploadFile], tasks: BackgroundTasks):
    created = []
    folder = FILES_DIR / str(cid)
    folder.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        get_conversation(conn, cid)
        for f in files:
            name = Path(f.filename or "document.pdf").name
            if not name.lower().endswith(".pdf"):
                raise HTTPException(400, f"{name} is not a PDF")
            cur = conn.execute(
                "INSERT INTO documents (conversation_id, filename, status, created_at) VALUES (?, ?, 'processing', ?)",
                (cid, name, now()),
            )
            doc_id = cur.lastrowid
            path = folder / f"{doc_id}.pdf"
            path.write_bytes(await f.read())
            tasks.add_task(process_document, cid, doc_id, name, path)
            created.append(dict(conn.execute("SELECT * FROM documents WHERE id=?", (doc_id,)).fetchone()))
    return created


@app.delete("/api/conversations/{cid}/documents/{doc_id}")
def delete_document(cid: int, doc_id: int):
    with connect() as conn:
        conn.execute("DELETE FROM documents WHERE id=? AND conversation_id=?", (doc_id, cid))
    rag.delete_document(cid, doc_id)
    (FILES_DIR / str(cid) / f"{doc_id}.pdf").unlink(missing_ok=True)
    return {"ok": True}


# ---------- Messages ----------

class MessageIn(BaseModel):
    content: str


def message_out(row: dict) -> dict:
    row["sources"] = json.loads(row["sources"]) if row.get("sources") else []
    return row


@app.get("/api/conversations/{cid}/messages")
def list_messages(cid: int):
    with connect() as conn:
        get_conversation(conn, cid)
        return [message_out(r) for r in rows(conn.execute(
            "SELECT * FROM messages WHERE conversation_id=? ORDER BY id", (cid,)))]


@app.post("/api/conversations/{cid}/messages")
def send_message(cid: int, body: MessageIn):
    question = body.content.strip()
    if not question:
        raise HTTPException(400, "Empty message")
    with connect() as conn:
        conv = get_conversation(conn, cid)
        history = rows(conn.execute(
            "SELECT role, content FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 10", (cid,)))[::-1]

    try:
        model = get_chat_model(load_settings())
    except ValueError as e:
        raise HTTPException(400, str(e))

    chunks = rag.search(cid, question)
    context = "\n\n".join(
        f"[{i}] ({c['filename']}, p. {c['page']})\n{c['text']}" for i, c in enumerate(chunks, 1)
    ) or "(no documents in this conversation)"
    messages = [SystemMessage(SYSTEM_PROMPT.format(context=context))]
    messages += [HumanMessage(m["content"]) if m["role"] == "user" else AIMessage(m["content"]) for m in history]
    messages.append(HumanMessage(question))

    try:
        answer = model.invoke(messages).text
    except Exception as e:
        raise HTTPException(502, f"LLM provider error: {e}")

    sources = [{"n": i, "filename": c["filename"], "page": c["page"], "excerpt": c["text"][:300]}
               for i, c in enumerate(chunks, 1)]
    with connect() as conn:
        conn.execute("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, 'user', ?, ?)",
                     (cid, question, now()))
        cur = conn.execute(
            "INSERT INTO messages (conversation_id, role, content, sources, created_at) VALUES (?, 'assistant', ?, ?, ?)",
            (cid, answer, json.dumps(sources), now()))
        if conv["title"] == DEFAULT_TITLE:
            conn.execute("UPDATE conversations SET title=? WHERE id=?", (question[:60], cid))
        return message_out(dict(conn.execute("SELECT * FROM messages WHERE id=?", (cur.lastrowid,)).fetchone()))


# ---------- Web UI (compiled Angular) ----------

if STATIC_DIR.exists():
    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        file = STATIC_DIR / path
        if path and file.is_file() and STATIC_DIR in file.resolve().parents:
            return FileResponse(file)
        return FileResponse(STATIC_DIR / "index.html")


def run() -> None:
    import uvicorn

    host = os.environ.get("READITFORME_HOST", "127.0.0.1")  # local only by default
    port = int(os.environ.get("READITFORME_PORT", "8000"))
    if not os.environ.get("READITFORME_NO_BROWSER"):
        threading.Timer(1.5, lambda: webbrowser.open(f"http://{host}:{port}")).start()
    uvicorn.run(app, host=host, port=port)
