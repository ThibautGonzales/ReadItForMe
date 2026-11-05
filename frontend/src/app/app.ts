import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Api, Conversation, DocumentItem, Message, Settings, errorText } from './api';

@Component({
  selector: 'app-root',
  template: `
    <aside class="sidebar">
      <div class="brand">📄 ReadItForMe</div>
      <button class="primary" (click)="newConversation()">+ Nouvelle conversation</button>
      <ul class="convs">
        @for (c of conversations(); track c.id) {
          <li [class.active]="c.id === currentId()" (click)="select(c.id)">
            <span class="title">{{ c.title }}</span>
            <span class="actions">
              <button title="Renommer" (click)="rename(c); $event.stopPropagation()">✎</button>
              <button title="Supprimer" (click)="remove(c); $event.stopPropagation()">🗑</button>
            </span>
          </li>
        }
      </ul>
      <button class="ghost" (click)="openSettings()">⚙ Réglages
        @if (!settings()?.has_key) { <span class="dot"></span> }
      </button>
    </aside>

    <main>
      @if (!settings()?.has_key && settings()) {
        <div class="banner">Pour commencer, renseignez votre clé d'API dans
          <a (click)="openSettings()">les réglages</a>.</div>
      }

      @if (current(); as conv) {
        <section class="docs" [class.dragging]="dragging()"
                 (dragover)="$event.preventDefault(); dragging.set(true)"
                 (dragleave)="dragging.set(false)"
                 (drop)="onDrop($event)">
          <div class="dropzone" (click)="fileInput.click()">
            Glissez vos PDF ici ou <u>cliquez pour choisir</u>
            <input #fileInput type="file" accept="application/pdf" multiple hidden (change)="onPick($event)" />
          </div>
          <ul class="doclist">
            @for (d of documents(); track d.id) {
              <li [class]="d.status" [title]="d.error ?? ''">
                <span>{{ d.filename }}</span>
                <small>
                  @switch (d.status) {
                    @case ('processing') { analyse… }
                    @case ('ready') { {{ d.pages }} p. }
                    @case ('error') { erreur }
                  }
                </small>
                <button title="Retirer" (click)="removeDoc(d)">×</button>
              </li>
            }
          </ul>
        </section>

        <section class="messages" #scroller>
          @if (messages().length === 0) {
            <p class="empty">Déposez des documents puis posez une question.</p>
          }
          @for (m of messages(); track m.id) {
            <div class="msg" [class]="m.role">
              <div class="bubble">{{ m.content }}</div>
              @if (m.sources.length) {
                <details class="sources">
                  <summary>Sources ({{ m.sources.length }})</summary>
                  @for (s of m.sources; track s.n) {
                    <div><b>[{{ s.n }}]</b> {{ s.filename }}, p. {{ s.page }} — <i>{{ s.excerpt }}…</i></div>
                  }
                </details>
              }
            </div>
          }
          @if (sending()) { <div class="msg assistant"><div class="bubble typing">…</div></div> }
        </section>

        <form class="composer" (submit)="send($event)">
          <textarea rows="2" placeholder="Posez votre question…" [value]="draft()"
                    (input)="draft.set($any($event.target).value)"
                    (keydown.enter)="!$any($event).shiftKey && send($event)"></textarea>
          <button class="primary" [disabled]="sending() || !draft().trim()">Envoyer</button>
        </form>
      } @else {
        <div class="welcome">
          <h1>Posez vos questions à vos PDF</h1>
          <button class="primary" (click)="newConversation()">Créer une conversation</button>
        </div>
      }

      @if (error()) { <div class="toast" (click)="error.set(null)">{{ error() }}</div> }
    </main>

    @if (showSettings()) {
      <div class="overlay" (click)="showSettings.set(false)">
        <form class="dialog" (click)="$event.stopPropagation()" (submit)="saveSettings($event)">
          <h2>Réglages</h2>
          <label>Clé d'API
            <input type="password" autocomplete="off" [placeholder]="settings()?.key_hint ? 'Clé enregistrée ' + settings()?.key_hint : 'Collez votre clé ici'"
                   [value]="keyDraft()" (input)="onKeyInput($any($event.target).value)" />
          </label>
          <label>Fournisseur
            <select (change)="onProviderChange($any($event.target).value)">
              <option value="" disabled [selected]="!providerDraft()">Choisir…</option>
              @for (p of settings()?.providers ?? []; track p.id) { <option [value]="p.id" [selected]="p.id === providerDraft()">{{ p.label }}</option> }
            </select>
          </label>
          <label>Modèle
            <input [value]="modelDraft()" [placeholder]="defaultModel()" (input)="modelDraft.set($any($event.target).value)" />
          </label>
          <p class="hint">La clé reste sur cet ordinateur et n'est jamais renvoyée au navigateur.</p>
          @if (testResult()) { <p class="hint">{{ testResult() }}</p> }
          <div class="row">
            <button type="button" class="ghost" (click)="testSettings()">Tester</button>
            <button class="primary">Enregistrer</button>
          </div>
        </form>
      </div>
    }
  `,
})
export class App implements OnInit {
  private api = inject(Api);

  conversations = signal<Conversation[]>([]);
  currentId = signal<number | null>(null);
  current = computed(() => this.conversations().find((c) => c.id === this.currentId()) ?? null);
  documents = signal<DocumentItem[]>([]);
  messages = signal<Message[]>([]);
  draft = signal('');
  sending = signal(false);
  dragging = signal(false);
  error = signal<string | null>(null);

  settings = signal<Settings | null>(null);
  showSettings = signal(false);
  keyDraft = signal('');
  providerDraft = signal('');
  modelDraft = signal('');
  testResult = signal<string | null>(null);
  defaultModel = computed(() => this.settings()?.providers.find((p) => p.id === this.providerDraft())?.default_model ?? '');

  private poll?: ReturnType<typeof setInterval>;

  async ngOnInit() {
    await this.guard(async () => {
      this.settings.set(await this.api.getSettings());
      const convs = await this.api.listConversations();
      this.conversations.set(convs);
      if (convs.length) await this.select(convs[0].id);
      if (!this.settings()!.has_key) this.openSettings();
    });
  }

  private async guard(fn: () => Promise<void>) {
    try { await fn(); } catch (e) { this.error.set(errorText(e)); }
  }

  // ----- Conversations -----
  async select(id: number) {
    this.currentId.set(id);
    await this.guard(async () => {
      const [docs, msgs] = await Promise.all([this.api.listDocuments(id), this.api.listMessages(id)]);
      this.documents.set(docs);
      this.messages.set(msgs);
      this.watchDocuments();
      this.scrollDown();
    });
  }

  newConversation() {
    return this.guard(async () => {
      const c = await this.api.createConversation();
      this.conversations.update((l) => [c, ...l]);
      await this.select(c.id);
    });
  }

  rename(c: Conversation) {
    const title = prompt('Nouveau nom', c.title);
    if (!title) return;
    this.guard(async () => {
      const updated = await this.api.renameConversation(c.id, title);
      this.conversations.update((l) => l.map((x) => (x.id === c.id ? updated : x)));
    });
  }

  remove(c: Conversation) {
    if (!confirm(`Supprimer « ${c.title} » et ses documents ?`)) return;
    this.guard(async () => {
      await this.api.deleteConversation(c.id);
      this.conversations.update((l) => l.filter((x) => x.id !== c.id));
      if (this.currentId() === c.id) {
        const next = this.conversations()[0];
        next ? await this.select(next.id) : this.currentId.set(null);
      }
    });
  }

  // ----- Documents -----
  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(false);
    this.upload(Array.from(e.dataTransfer?.files ?? []));
  }

  onPick(e: Event) {
    const input = e.target as HTMLInputElement;
    this.upload(Array.from(input.files ?? []));
    input.value = '';
  }

  private upload(files: File[]) {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length < files.length) this.error.set('Seuls les fichiers PDF sont acceptés.');
    const id = this.currentId();
    if (!pdfs.length || id === null) return;
    this.guard(async () => {
      const created = await this.api.uploadDocuments(id, pdfs);
      this.documents.update((l) => [...l, ...created]);
      this.watchDocuments();
    });
  }

  removeDoc(d: DocumentItem) {
    const id = this.currentId()!;
    this.guard(async () => {
      await this.api.deleteDocument(id, d.id);
      this.documents.update((l) => l.filter((x) => x.id !== d.id));
    });
  }

  /** Refresh the list while documents are still being processed. */
  private watchDocuments() {
    clearInterval(this.poll);
    if (!this.documents().some((d) => d.status === 'processing')) return;
    const id = this.currentId()!;
    this.poll = setInterval(async () => {
      if (this.currentId() !== id) return clearInterval(this.poll);
      const docs = await this.api.listDocuments(id);
      this.documents.set(docs);
      if (!docs.some((d) => d.status === 'processing')) clearInterval(this.poll);
    }, 1500);
  }

  // ----- Chat -----
  send(e: Event) {
    e.preventDefault();
    const id = this.currentId();
    const content = this.draft().trim();
    if (!content || id === null || this.sending()) return;
    const tempId = -Date.now();
    this.messages.update((l) => [...l, { id: tempId, role: 'user', content, sources: [] }]);
    this.draft.set('');
    this.sending.set(true);
    this.scrollDown();
    this.guard(async () => {
      try {
        const answer = await this.api.sendMessage(id, content);
        this.messages.update((l) => [...l, answer]);
        const convs = await this.api.listConversations();
        this.conversations.set(convs);
      } catch (err) {
        this.messages.update((l) => l.filter((m) => m.id !== tempId));
        this.draft.set(content);
        throw err;
      } finally {
        this.sending.set(false);
        this.scrollDown();
      }
    });
  }

  private scrollDown() {
    setTimeout(() => document.querySelector('.messages')?.scrollTo({ top: 1e9, behavior: 'smooth' }));
  }

  // ----- Settings -----
  openSettings() {
    const s = this.settings();
    this.keyDraft.set('');
    this.providerDraft.set(s?.provider ?? '');
    this.modelDraft.set(s?.model ?? '');
    this.testResult.set(null);
    this.showSettings.set(true);
  }

  onKeyInput(key: string) {
    this.keyDraft.set(key);
    const k = key.trim();
    const guess = k.startsWith('sk-ant-') ? 'anthropic' : k.startsWith('AIza') ? 'google_genai' : k.startsWith('sk-') ? 'openai' : null;
    if (guess) this.onProviderChange(guess);
  }

  onProviderChange(p: string) {
    if (p !== this.providerDraft()) this.modelDraft.set('');
    this.providerDraft.set(p);
  }

  private async persistSettings() {
    const s = await this.api.saveSettings({
      provider: this.providerDraft() || undefined,
      model: this.modelDraft(),
      api_key: this.keyDraft().trim() || undefined,
    });
    this.settings.set(s);
    this.keyDraft.set('');
    this.modelDraft.set(s.model ?? '');
  }

  saveSettings(e: Event) {
    e.preventDefault();
    this.guard(async () => {
      await this.persistSettings();
      this.showSettings.set(false);
    });
  }

  testSettings() {
    this.testResult.set('Test en cours…');
    this.guard(async () => {
      await this.persistSettings();
      try {
        await this.api.testSettings();
        this.testResult.set('✅ Connexion au modèle réussie.');
      } catch (e) {
        this.testResult.set('❌ ' + errorText(e));
      }
    });
  }
}
