"""Conversations, messages and documents stored in SQLite (nothing to install)."""
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from .config import DB_PATH, FILES_DIR

SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sources TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    pages INTEGER,
    chunks INTEGER,
    created_at TEXT NOT NULL,
    size INTEGER
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        # Migration: file size in bytes, used to enforce the per-conversation upload limit.
        columns = {r["name"] for r in conn.execute("PRAGMA table_info(documents)")}
        if "size" not in columns:
            conn.execute("ALTER TABLE documents ADD COLUMN size INTEGER")
        for r in conn.execute("SELECT id, conversation_id FROM documents WHERE size IS NULL").fetchall():
            path = FILES_DIR / str(r["conversation_id"]) / f"{r['id']}.pdf"
            conn.execute("UPDATE documents SET size=? WHERE id=?", (path.stat().st_size if path.exists() else 0, r["id"]))
        # A document left "processing" after an unclean shutdown will never finish.
        conn.execute(
            "UPDATE documents SET status='error', error='Processing interrupted' WHERE status='processing'"
        )


def rows(cursor) -> list[dict]:
    return [dict(r) for r in cursor.fetchall()]
