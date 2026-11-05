import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Api, Conversation, DocumentItem, Limits, Message, Settings, Source, errorText } from './api';
import { marked } from 'marked';
import { Icon } from './icon';


interface ConversationGroup { label: string; items: Conversation[]; }

const DAY = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-root',
  imports: [Icon],
  template: `
    <aside class="sidebar">
      <div class="brand">
        <img src="logo-icon.png" alt="" width="36" height="36" />
        <span>ReadItForMe</span>
      </div>

      <button class="primary new-conv" (click)="newConversation()">
        <app-icon name="plus" /> New conversation
      </button>

      <label class="search">
        <app-icon name="search" />
        <input type="search" placeholder="Search conversations" [value]="search()"
               (input)="search.set($any($event.target).value)" />
      </label>

      <nav class="convs">
        @for (g of groups(); track g.label) {
          <h3>{{ g.label }}</h3>
          <ul>
            @for (c of g.items; track c.id) {
              <li [class.active]="c.id === currentId()" (click)="select(c.id)">
                <app-icon name="chat" />
                <div class="conv-text">
                  <span class="title">{{ c.title }}</span>
                  @if (c.id === currentId()) {
                    <small>{{ docCountLabel() }} · {{ relativeTime(c.created_at) }}</small>
                  }
                </div>
                <span class="actions">
                  <button class="icon-btn" title="Rename" (click)="rename(c); $event.stopPropagation()"><app-icon name="pencil" [size]="14" /></button>
                  <button class="icon-btn" title="Delete" (click)="remove(c); $event.stopPropagation()"><app-icon name="trash" [size]="14" /></button>
                </span>
              </li>
            }
          </ul>
        } @empty {
          @if (search()) { <p class="hint pad">No conversation matches “{{ search() }}”.</p> }
        }
      </nav>

      <div class="sidebar-footer">
        <button class="settings-toggle" [class.open]="showSettings()" (click)="toggleSettings()">
          <app-icon name="sliders" [size]="18" />
          <span>Settings</span>
          <app-icon [name]="showSettings() ? 'chevronDown' : 'chevronUp'" />
        </button>
        <div class="model-status" [class.missing]="!settings()?.has_key">
          <span class="status-dot"></span>
          @if (settings()?.has_key) { {{ providerLabel() }} · {{ settings()?.model || defaultModelFor(settings()?.provider) }} }
          @else { No API key configured }
        </div>

        @if (showSettings()) {
          <div class="popover-backdrop" (click)="showSettings.set(false)"></div>
          <form class="popover" (submit)="saveSettings($event)">
            <div class="popover-head">
              <h2>Settings</h2>
              <button type="button" class="icon-btn" title="Close" (click)="showSettings.set(false)"><app-icon name="x" /></button>
            </div>
            <p class="muted">Connect the model that will guide you through your reading.</p>

            <label>Provider
              <select (change)="onProviderChange($any($event.target).value)">
                <option value="" disabled [selected]="!providerDraft()">Choose…</option>
                @for (p of settings()?.providers ?? []; track p.id) {
                  <option [value]="p.id" [selected]="p.id === providerDraft()">{{ p.label }}</option>
                }
              </select>
            </label>

            <label>API key
              <span class="input-with-btn">
                <input [type]="showKey() ? 'text' : 'password'" autocomplete="off"
                       [placeholder]="settings()?.key_hint ? 'Saved key ' + settings()?.key_hint : 'Paste your key here'"
                       [value]="keyDraft()" (input)="onKeyInput($any($event.target).value)" />
                <button type="button" class="icon-btn" [title]="showKey() ? 'Hide key' : 'Show key'" (click)="showKey.set(!showKey())">
                  <app-icon [name]="showKey() ? 'eyeOff' : 'eye'" />
                </button>
              </span>
              <small class="hint"><app-icon name="lock" [size]="12" /> Your key stays on this device.</small>
            </label>

            <label>Model
              <input [value]="modelDraft()" [placeholder]="defaultModel()" (input)="modelDraft.set($any($event.target).value)" />
            </label>

            @if (testResult(); as r) {
              <p class="test-result" [class.ok]="r.ok === true" [class.ko]="r.ok === false">{{ r.text }}</p>
            }

            <div class="popover-actions">
              <button type="button" (click)="testSettings()"><app-icon name="plug" /> Test</button>
              <button class="primary">Save</button>
            </div>
          </form>
        }
      </div>
    </aside>

    <main>
      @if (current(); as conv) {
        <header class="topbar">
          <nav class="breadcrumb"><span class="muted">My readings</span><span class="sep">/</span><span>{{ conv.title }}</span></nav>
          <div class="menu-wrap">
            <button class="icon-btn" title="More" (click)="menuOpen.set(!menuOpen())"><app-icon name="more" [size]="18" /></button>
            @if (menuOpen()) {
              <div class="popover-backdrop" (click)="menuOpen.set(false)"></div>
              <div class="menu">
                <button (click)="menuOpen.set(false); rename(conv)"><app-icon name="pencil" /> Rename</button>
                <button class="danger" (click)="menuOpen.set(false); remove(conv)"><app-icon name="trash" /> Delete</button>
              </div>
            }
          </div>
        </header>

        <section class="scroll" (dragover)="$event.preventDefault(); dragging.set(true)" (drop)="onDrop($event)">
          <div class="column">
            @if (settings() && !settings()!.has_key) {
              <div class="banner"><app-icon name="alert" /> To get started, add your API key in
                <a (click)="openSettings()">the settings</a>.</div>
            }

            <div class="dropzone" [class.dragging]="dragging()" [class.full]="isFull()" (dragleave)="dragging.set(false)">
              <span class="drop-icon"><app-icon name="upload" [size]="20" /></span>
              <div class="drop-text">
                @if (isFull()) {
                  <strong>This conversation is full</strong>
                  <small>Remove a document or start a new conversation to add more.</small>
                } @else {
                  <strong>Drop your PDFs here to explore them</strong>
                  <small>Add documents to this conversation · PDF only</small>
                }
                @if (limits(); as l) {
                  <small class="usage">
                    {{ documents().length }} / {{ l.max_documents }} documents · {{ formatMb(usedBytes()) }} / {{ formatMb(l.max_total_bytes) }}
                  </small>
                }
              </div>
              <button type="button" class="accent-outline" [disabled]="isFull()" (click)="fileInput.click()"><app-icon name="folder" /> Browse</button>
              <input #fileInput type="file" accept="application/pdf" multiple hidden (change)="onPick($event)" />
            </div>

            @if (documents().length) {
              <ul class="doclist">
                @for (d of documents(); track d.id) {
                  <li [class]="d.status">
                    <span class="pdf-badge">PDF</span>
                    <div class="doc-text">
                      <span class="doc-name">{{ d.filename }}</span>
                      <small>
                        @switch (d.status) {
                          @case ('processing') { Reading the document… }
                          @case ('ready') { {{ d.pages }} {{ d.pages === 1 ? 'page' : 'pages' }} }
                          @case ('error') { {{ d.error || 'Could not read this file' }} }
                        }
                      </small>
                    </div>
                    <span class="doc-status">
                      @switch (d.status) {
                        @case ('processing') { <span class="spinner"></span> Processing }
                        @case ('ready') { <app-icon name="checkCircle" [size]="14" /> Ready to read }
                        @case ('error') { <app-icon name="alert" [size]="14" /> Error }
                      }
                    </span>
                    <button class="icon-btn" title="Remove" (click)="removeDoc(d)"><app-icon name="x" [size]="14" /></button>
                  </li>
                }
              </ul>
            }

            <div class="conv-title">
              <h1>{{ conv.title }}</h1>
              <p class="muted">A guided reading, with sourced answers.</p>
            </div>

            <div class="messages">
              @if (messages().length === 0 && !sending()) {
                <p class="empty">Add a document, then ask your first question below.</p>
              }
              @for (m of messages(); track m.id) {
                @if (m.role === 'user') {
                  <div class="msg user">
                    <div class="meta">You{{ m.created_at ? ' · ' + clock(m.created_at) : '' }}</div>
                    <div class="bubble">{{ m.content }}</div>
                  </div>
                } @else {
                  <div class="msg assistant">
                    <div class="meta"><app-icon name="book" /> <strong>ReadItForMe</strong>
                      @if (m.created_at) { <span>{{ clock(m.created_at) }}</span> }</div>
                    <div class="answer markdown" [innerHTML]="html(m)"></div>

                    @for (s of shownSources(m); track s.n) {
                      <blockquote class="quote">
                        <p>“{{ clean(s.excerpt) }}…”</p>
                        <cite>{{ s.filename }} · p. {{ s.page }}</cite>
                      </blockquote>
                    }
                    @if (hiddenSources(m).length) {
                      <details class="more-sources">
                        <summary>{{ shownSources(m).length ? 'Show' : 'Show the' }} {{ hiddenSources(m).length }} {{ shownSources(m).length ? 'more' : '' }} {{ hiddenSources(m).length === 1 ? 'passage' : 'passages' }} read</summary>
                        @for (s of hiddenSources(m); track s.n) {
                          <blockquote class="quote">
                            <p>“{{ clean(s.excerpt) }}…”</p>
                            <cite>{{ s.filename }} · p. {{ s.page }}</cite>
                          </blockquote>
                        }
                      </details>
                    }

                    <div class="msg-actions">
                      <button class="icon-btn" [title]="copiedId() === m.id ? 'Copied' : 'Copy answer'" (click)="copy(m)">
                        <app-icon [name]="copiedId() === m.id ? 'check' : 'copy'" [size]="15" />
                      </button>
                      @if (m.sources.length) { <span class="sep-v"></span> <span>Answer grounded in your documents</span> }
                    </div>
                  </div>
                }
              }
              @if (sending()) {
                <div class="msg assistant">
                  <div class="meta"><app-icon name="book" /> <strong>ReadItForMe</strong></div>
                  <div class="typing"><span></span><span></span><span></span></div>
                </div>
              }
            </div>
          </div>
        </section>

        <div class="composer-wrap">
          <form class="composer" (submit)="send($event)">
            <button type="button" class="icon-btn" [title]="isFull() ? 'This conversation is full' : 'Add a PDF'" [disabled]="isFull()" (click)="fileInput2.click()"><app-icon name="paperclip" [size]="18" /></button>
            <input #fileInput2 type="file" accept="application/pdf" multiple hidden (change)="onPick($event)" />
            <textarea rows="1" placeholder="Ask a question about your documents…" [value]="draft()"
                      (input)="onDraftInput($event)"
                      (keydown.enter)="!$any($event).shiftKey && send($event)"></textarea>
            <button class="send" title="Send" [disabled]="sending() || !draft().trim()"><app-icon name="arrowUp" [size]="18" /></button>
          </form>
          <div class="composer-hints">
            <span>AI can make mistakes. Check the cited pages.</span>
            <span>Enter to send · Shift+Enter for a new line</span>
          </div>
        </div>
      } @else {
        <div class="welcome">
          <img class="welcome-logo" src="logo.png" alt="ReadItForMe" />
          <h1>Ask questions about your PDFs</h1>
          <p class="muted">Create a conversation, drop your documents, and get answers with their sources.</p>
          <button class="primary" (click)="newConversation()"><app-icon name="plus" /> New conversation</button>
        </div>
      }

      @if (error()) {
        <div class="toast" (click)="error.set(null)"><app-icon name="alert" /> {{ error() }}</div>
      }
    </main>
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
  search = signal('');
  menuOpen = signal(false);
  copiedId = signal<number | null>(null);

  settings = signal<Settings | null>(null);
  showSettings = signal(false);
  showKey = signal(false);
  keyDraft = signal('');
  providerDraft = signal('');
  modelDraft = signal('');
  testResult = signal<{ text: string; ok?: boolean } | null>(null);
  defaultModel = computed(() => this.defaultModelFor(this.providerDraft()));
  providerLabel = computed(() => {
    const s = this.settings();
    return s?.providers.find((p) => p.id === s.provider)?.label ?? s?.provider ?? '';
  });

  limits = signal<Limits | null>(null);
  usedBytes = computed(() => this.documents().reduce((sum, d) => sum + (d.size ?? 0), 0));
  isFull = computed(() => {
    const l = this.limits();
    return !!l && (this.documents().length >= l.max_documents || this.usedBytes() >= l.max_total_bytes);
  });

  docCountLabel = computed(() => {
    const n = this.documents().length;
    return n === 0 ? 'No document' : n === 1 ? '1 document' : `${n} documents`;
  });

  /** Conversations filtered by the search box and grouped by creation date. */
  groups = computed<ConversationGroup[]>(() => {
    const q = this.search().trim().toLowerCase();
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const buckets: ConversationGroup[] = [
      { label: 'Today', items: [] }, { label: 'Yesterday', items: [] },
      { label: 'This week', items: [] }, { label: 'Earlier', items: [] },
    ];
    for (const c of this.conversations()) {
      if (q && !c.title.toLowerCase().includes(q)) continue;
      const t = new Date(c.created_at).getTime();
      const i = t >= startOfToday ? 0 : t >= startOfToday - DAY ? 1 : t >= startOfToday - 6 * DAY ? 2 : 3;
      buckets[i].items.push(c);
    }
    return buckets.filter((b) => b.items.length);
  });

  private poll?: ReturnType<typeof setInterval>;

  async ngOnInit() {
    await this.guard(async () => {
      const [settings, limits] = await Promise.all([this.api.getSettings(), this.api.getLimits()]);
      this.settings.set(settings);
      this.limits.set(limits);
      const convs = await this.api.listConversations();
      this.conversations.set(convs);
      if (convs.length) await this.select(convs[0].id);
      if (!this.settings()!.has_key) this.openSettings();
    });
  }

  private async guard(fn: () => Promise<void>) {
    try { await fn(); } catch (e) { this.error.set(errorText(e)); }
  }

  // ----- Formatting helpers -----
  formatMb(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  }
  defaultModelFor(provider: string | null | undefined) {
    return this.settings()?.providers.find((p) => p.id === provider)?.default_model ?? '';
  }

  clock(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  relativeTime(iso: string) {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
    return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
  }

  /** Source numbers cited in an answer, e.g. "[1]", "[2, 3]" or "[1][4]". */
  private citedNumbers(m: Message) {
    const nums = new Set<number>();
    for (const match of m.content.matchAll(/\[(\d+(?:\s*[,;]\s*\d+)*)\]/g)) {
      match[1].split(/[,;]/).forEach((n) => nums.add(Number(n)));
    }
    return nums;
  }

  /** Up to two cited passages are shown as quotes under the answer. */
  shownSources(m: Message): Source[] {
    const nums = this.citedNumbers(m);
    return m.sources.filter((s) => nums.has(s.n)).slice(0, 2);
  }

  /** Every other passage (more citations, or passages read but not cited) stays folded. */
  hiddenSources(m: Message): Source[] {
    const shown = new Set(this.shownSources(m).map((s) => s.n));
    const nums = this.citedNumbers(m);
    return m.sources.filter((s) => !shown.has(s.n)).sort((a, b) => Number(nums.has(b.n)) - Number(nums.has(a.n)));
  }

  /** Collapse the line breaks and spacing that PDF extraction leaves in excerpts. */
  clean(text: string) {
    return text.replace(/\s+/g, ' ').trim();
  }

  private htmlCache = new Map<number, string>();

  /**
   * Render an answer from Markdown to HTML. Citations such as [1] or [2, 3] become "p. 12" chips
   * whose tooltip names the source. Angular sanitizes the result when it is bound to [innerHTML].
   */
  html(m: Message): string {
    const cached = this.htmlCache.get(m.id);
    if (cached !== undefined) return cached;
    const byN = new Map(m.sources.map((s) => [s.n, s]));
    const withCites = m.content.replace(/\[(\d+(?:\s*[,;]\s*\d+)*)\]/g, (whole, list: string) => {
      const srcs = list.split(/[,;]/).map((n) => byN.get(Number(n))).filter((s): s is Source => !!s);
      if (!srcs.length) return whole;
      const pages = [...new Set(srcs.map((s) => s.page))].sort((a, b) => a - b);
      const title = escapeHtml(srcs.map((s) => `${s.filename}, p. ${s.page}`).join(' | '));
      return `<span class="cite" title="${title}">p. ${pages.join(', ')}</span>`;
    });
    const out = marked.parse(withCites, { async: false, gfm: true, breaks: true });
    this.htmlCache.set(m.id, out);
    return out;
  }

  // ----- Conversations -----
  async select(id: number) {
    this.currentId.set(id);
    this.menuOpen.set(false);
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
      this.search.set('');
      this.conversations.update((l) => [c, ...l]);
      await this.select(c.id);
    });
  }

  rename(c: Conversation) {
    const title = prompt('New name', c.title);
    if (!title) return;
    this.guard(async () => {
      const updated = await this.api.renameConversation(c.id, title);
      this.conversations.update((l) => l.map((x) => (x.id === c.id ? updated : x)));
    });
  }

  remove(c: Conversation) {
    if (!confirm(`Delete "${c.title}" and its documents?`)) return;
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
    if (pdfs.length < files.length) this.error.set('Only PDF files are accepted.');
    const id = this.currentId();
    if (!pdfs.length || id === null) return;
    const limitError = this.checkLimits(pdfs);
    if (limitError) return this.error.set(limitError);
    this.guard(async () => {
      const created = await this.api.uploadDocuments(id, pdfs);
      this.documents.update((l) => [...l, ...created]);
      this.watchDocuments();
    });
  }

  /** Same rules as the backend, checked first so the user gets feedback before uploading. */
  private checkLimits(files: File[]): string | null {
    const l = this.limits();
    if (!l) return null;
    const count = this.documents().length;
    const left = l.max_documents - count;
    if (count + files.length > l.max_documents) {
      return `A conversation can hold at most ${l.max_documents} documents. ` + (left > 0
        ? `You selected ${files.length}, you can add ${left} more.`
        : 'Remove a document or start a new conversation to add more.');
    }
    const added = files.reduce((sum, f) => sum + f.size, 0);
    const room = Math.max(l.max_total_bytes - this.usedBytes(), 0);
    if (added > room) {
      return `A conversation can hold at most ${this.formatMb(l.max_total_bytes)} of documents. ` + (room > 0
        ? `These files weigh ${this.formatMb(added)} and only ${this.formatMb(room)} is left.`
        : 'Remove a document or start a new conversation to add more.');
    }
    return null;
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
  onDraftInput(e: Event) {
    const ta = e.target as HTMLTextAreaElement;
    this.draft.set(ta.value);
    this.autosize(ta);
  }

  /** Grow the composer with its content, up to a limit set in CSS. */
  private autosize(ta: HTMLTextAreaElement) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  send(e: Event) {
    e.preventDefault();
    const id = this.currentId();
    const content = this.draft().trim();
    if (!content || id === null || this.sending()) return;
    const tempId = -Date.now();
    this.messages.update((l) => [...l, { id: tempId, role: 'user', content, sources: [], created_at: new Date().toISOString() }]);
    this.draft.set('');
    const ta = document.querySelector<HTMLTextAreaElement>('.composer textarea');
    if (ta) { ta.value = ''; this.autosize(ta); }
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

  async copy(m: Message) {
    try {
      await navigator.clipboard.writeText(m.content);
      this.copiedId.set(m.id);
      setTimeout(() => this.copiedId() === m.id && this.copiedId.set(null), 1500);
    } catch {
      this.error.set('Could not copy to the clipboard.');
    }
  }

  private scrollDown() {
    setTimeout(() => document.querySelector('.scroll')?.scrollTo({ top: 1e9, behavior: 'smooth' }));
  }

  // ----- Settings -----
  toggleSettings() {
    this.showSettings() ? this.showSettings.set(false) : this.openSettings();
  }

  openSettings() {
    const s = this.settings();
    this.keyDraft.set('');
    this.showKey.set(false);
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
    this.testResult.set({ text: 'Testing…' });
    this.guard(async () => {
      await this.persistSettings();
      try {
        await this.api.testSettings();
        this.testResult.set({ text: 'Connected to the model.', ok: true });
      } catch (e) {
        this.testResult.set({ text: errorText(e), ok: false });
      }
    });
  }
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
