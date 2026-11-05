import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Provider { id: string; label: string; default_model: string; }
export interface Settings {
  provider: string | null; model: string | null; has_key: boolean; key_hint: string | null; providers: Provider[];
}
export interface Conversation { id: number; title: string; created_at: string; }
export interface DocumentItem {
  id: number; filename: string; status: 'processing' | 'ready' | 'error'; error: string | null;
  pages: number | null; chunks: number | null;
}
export interface Source { n: number; filename: string; page: number; excerpt: string; }
export interface Message {
  id: number; role: 'user' | 'assistant'; content: string; sources: Source[]; created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  getSettings() { return firstValueFrom(this.http.get<Settings>('/api/settings')); }
  saveSettings(body: { provider?: string; model?: string; api_key?: string }) {
    return firstValueFrom(this.http.put<Settings>('/api/settings', body));
  }
  testSettings() { return firstValueFrom(this.http.post<{ ok: boolean }>('/api/settings/test', {})); }

  listConversations() { return firstValueFrom(this.http.get<Conversation[]>('/api/conversations')); }
  createConversation() { return firstValueFrom(this.http.post<Conversation>('/api/conversations', {})); }
  renameConversation(id: number, title: string) {
    return firstValueFrom(this.http.patch<Conversation>(`/api/conversations/${id}`, { title }));
  }
  deleteConversation(id: number) { return firstValueFrom(this.http.delete(`/api/conversations/${id}`)); }

  listDocuments(id: number) { return firstValueFrom(this.http.get<DocumentItem[]>(`/api/conversations/${id}/documents`)); }
  uploadDocuments(id: number, files: File[]) {
    const form = new FormData();
    files.forEach((f) => form.append('files', f, f.name));
    return firstValueFrom(this.http.post<DocumentItem[]>(`/api/conversations/${id}/documents`, form));
  }
  deleteDocument(id: number, docId: number) {
    return firstValueFrom(this.http.delete(`/api/conversations/${id}/documents/${docId}`));
  }

  listMessages(id: number) { return firstValueFrom(this.http.get<Message[]>(`/api/conversations/${id}/messages`)); }
  sendMessage(id: number, content: string) {
    return firstValueFrom(this.http.post<Message>(`/api/conversations/${id}/messages`, { content }));
  }
}

export function errorText(e: any): string {
  return e?.error?.detail ?? e?.message ?? 'Unknown error';
}
