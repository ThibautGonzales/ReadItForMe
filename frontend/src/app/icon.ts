import { Component, computed, input } from '@angular/core';

/** Stroke icons (24x24 grid, Lucide-style) used across the UI. */
const PATHS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  book: 'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 12l3 3 5-6',
  alert: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4M12 16h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  chevronUp: 'm18 15-6-6-6 6',
  chevronDown: 'm6 9 6 6 6-6',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M10.7 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.1M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  plug: 'M12 22v-5M9 8V2M15 8V2M18 8v5a6 6 0 0 1-12 0V8z',
  paperclip: 'm21 11-8.6 8.6a5 5 0 0 1-7-7l8.5-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.3-2.3l7.9-7.9',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowUpRight: 'M7 17 17 7M7 7h10v10',
  copy: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  pencil: 'M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
};

@Component({
  selector: 'app-icon',
  template: `<svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="d()" /></svg>`,
  host: { style: 'display:inline-flex; flex-shrink:0' },
})
export class Icon {
  name = input.required<string>();
  size = input(16);
  d = computed(() => PATHS[this.name()] ?? '');
}
