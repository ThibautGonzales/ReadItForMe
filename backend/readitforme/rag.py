"""Lecture des PDF, embeddings locaux (FastEmbed) et base vectorielle embarquée (Chroma)."""
from functools import lru_cache
from pathlib import Path

import chromadb
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader

from .config import CHROMA_DIR, EMBEDDING_MODEL, MODELS_DIR

splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)


@lru_cache
def embedder():
    # Import tardif : le chargement d'onnxruntime prend une seconde.
    from fastembed import TextEmbedding

    # Le modèle est téléchargé automatiquement dans le dossier de données au premier appel.
    return TextEmbedding(model_name=EMBEDDING_MODEL, cache_dir=str(MODELS_DIR))


def embed(texts: list[str]) -> list[list[float]]:
    return [v.tolist() for v in embedder().embed(texts)]


@lru_cache
def chroma():
    return chromadb.PersistentClient(path=str(CHROMA_DIR), settings=chromadb.Settings(anonymized_telemetry=False))


def collection(conversation_id: int):
    # Une collection par conversation.
    return chroma().get_or_create_collection(f"conv_{conversation_id}", metadata={"hnsw:space": "cosine"})


def drop_collection(conversation_id: int) -> None:
    try:
        chroma().delete_collection(f"conv_{conversation_id}")
    except Exception:
        pass


class EmptyPdfError(ValueError):
    pass


def ingest_pdf(conversation_id: int, document_id: int, filename: str, path: Path) -> tuple[int, int]:
    reader = PdfReader(str(path))
    texts, metas = [], []
    for page_no, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if not text:
            continue
        for chunk in splitter.split_text(text):
            texts.append(chunk)
            metas.append({"document_id": document_id, "filename": filename, "page": page_no})
    if not texts:
        raise EmptyPdfError("Aucun texte trouvé : ce PDF est probablement scanné (OCR non pris en charge).")
    col = collection(conversation_id)
    batch = 64
    for i in range(0, len(texts), batch):
        col.add(
            ids=[f"{document_id}-{j}" for j in range(i, i + len(texts[i : i + batch]))],
            documents=texts[i : i + batch],
            embeddings=embed(texts[i : i + batch]),
            metadatas=metas[i : i + batch],
        )
    return len(reader.pages), len(texts)


def delete_document(conversation_id: int, document_id: int) -> None:
    collection(conversation_id).delete(where={"document_id": document_id})


def search(conversation_id: int, query: str, k: int = 6) -> list[dict]:
    col = collection(conversation_id)
    if col.count() == 0:
        return []
    res = col.query(query_embeddings=embed([query]), n_results=min(k, col.count()))
    return [
        {"text": doc, "filename": meta["filename"], "page": meta["page"]}
        for doc, meta in zip(res["documents"][0], res["metadatas"][0])
    ]
