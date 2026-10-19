export const ACCENTS = [
  { key: 'lavender', label: '라벤더', color: '#b9a7f0' },
  { key: 'mint', label: '민트', color: '#94dcc2' },
  { key: 'peach', label: '피치', color: '#ffbf9f' },
  { key: 'sky', label: '하늘', color: '#a3cff3' },
  { key: 'pink', label: '벚꽃', color: '#f5b0cb' },
  { key: 'lemon', label: '레몬', color: '#f2d97c' },
] as const;

export type AccentKey = (typeof ACCENTS)[number]['key'];
export type Mode = 'light' | 'dark' | 'system';
export type Width = 'wide' | 'normal';

export type Settings = {
  accent: AccentKey;
  mode: Mode;
  width: Width;
};

export const DEFAULT_SETTINGS: Settings = { accent: 'lavender', mode: 'light', width: 'wide' };

// 페이지 커버로 쓰는 단색 파스텔 (그라데이션 없음)
export const COVER_COLORS = [
  '#e5dcfb', '#d4f2e6', '#ffe1d3', '#d9ecfb', '#fbdbe8', '#fbf0c8',
  '#c9b8f5', '#a9e3cd', '#ffc9b0', '#b5d9f6', '#f5bcd2', '#f3e09a',
];

export function normalizeSettings(raw: Record<string, unknown> | null | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (raw && ACCENTS.some((a) => a.key === raw.accent)) s.accent = raw.accent as AccentKey;
  if (raw && ['light', 'dark', 'system'].includes(raw.mode as string)) s.mode = raw.mode as Mode;
  if (raw && ['wide', 'normal'].includes(raw.width as string)) s.width = raw.width as Width;
  return s;
}

export function resolveDark(mode: Mode) {
  if (mode === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches;
  return mode === 'dark';
}

export function applyTheme(s: Settings) {
  const root = document.documentElement;
  const dark = resolveDark(s.mode);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.accent = s.accent;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', dark ? '#1f1c27' : '#f6f3fd');
  try {
    localStorage.setItem('pf-theme', JSON.stringify(s));
  } catch {
    /* 저장 안 돼도 화면에는 영향 없음 */
  }
  return dark;
}

export function cachedSettings(): Settings {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem('pf-theme') || 'null'));
  } catch {
    return DEFAULT_SETTINGS;
  }
}
