import type { Property, PropType, PropValue, Row, Schema, SelectOption, TagColor } from './api';

export type ViewKind = 'table' | 'board' | 'calendar' | 'timeline';

export const VIEWS: { key: ViewKind; label: string; icon: string }[] = [
  { key: 'table', label: '표', icon: '▦' },
  { key: 'board', label: '칸반', icon: '▥' },
  { key: 'calendar', label: '캘린더', icon: '📅' },
  { key: 'timeline', label: '타임라인', icon: '☰' },
];

export const PROP_TYPES: { type: PropType; label: string; icon: string }[] = [
  { type: 'text', label: '텍스트', icon: '𝐓' },
  { type: 'select', label: '선택', icon: '🏷️' },
  { type: 'date', label: '날짜', icon: '📅' },
  { type: 'checkbox', label: '체크박스', icon: '☑️' },
  { type: 'number', label: '숫자', icon: '#' },
  { type: 'file', label: '파일·이미지', icon: '📎' },
  { type: 'person', label: '담당자', icon: '👤' },
];

export const TAG_COLORS: { key: TagColor; label: string }[] = [
  { key: 'p1', label: '라벤더' },
  { key: 'p2', label: '민트' },
  { key: 'p3', label: '피치' },
  { key: 'p4', label: '하늘' },
  { key: 'p5', label: '벚꽃' },
  { key: 'p6', label: '레몬' },
];

export const typeIcon = (t: PropType) => PROP_TYPES.find((p) => p.type === t)?.icon ?? '';

// NAS 에 http 로 접속하면 crypto.randomUUID 를 못 쓰므로 직접 만든다
export const newId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');

export const rowTitle = (r: Pick<Row, 'title'>) => r.title.trim() || '제목 없음';

// 아직 안 쓴 색을 먼저 고르고, 다 쓰였으면 돌려가며 고른다
export function nextColor(options: SelectOption[]): TagColor {
  const unused = TAG_COLORS.find((c) => !options.some((o) => o.color === c.key));
  return (unused ?? TAG_COLORS[options.length % TAG_COLORS.length]).key;
}

export function findOption(prop: Property | undefined, id: PropValue | undefined) {
  return prop?.options?.find((o) => o.id === id);
}

// ── 날짜 (모두 로컬 날짜 'YYYY-MM-DD' 문자열로 다룬다) ──
const pad = (n: number) => String(n).padStart(2, '0');
export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => toKey(new Date());
export const isDateKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function formatDate(key: string) {
  if (!isDateKey(key)) return '';
  const [y, m, d] = key.split('-').map(Number);
  const sameYear = y === new Date().getFullYear();
  return sameYear ? `${m}월 ${d}일` : `${y}년 ${m}월 ${d}일`;
}

export function formatNumber(v: PropValue | undefined) {
  return typeof v === 'number' ? v.toLocaleString('ko-KR') : '';
}

// 표에서 정렬할 때 쓰는 비교 값
export function sortValue(row: Row, prop: Property | null): string | number {
  if (!prop) return row.title.trim().toLowerCase();
  const v = row.props[prop.id];
  if (prop.type === 'number') return typeof v === 'number' ? v : Number.NEGATIVE_INFINITY;
  if (prop.type === 'checkbox') return v === true ? 1 : 0;
  if (prop.type === 'file') return Array.isArray(v) ? v.length : 0;
  // 담당자는 사람 수로 (이름순은 사용자 목록이 있어야 해서)
  if (prop.type === 'person') return Array.isArray(v) ? -v.length : 0;
  if (prop.type === 'select') {
    const idx = prop.options?.findIndex((o) => o.id === v) ?? -1;
    return idx < 0 ? 9999 : idx;
  }
  return typeof v === 'string' ? v.toLowerCase() : '';
}

// 두 행 사이에 끼워 넣을 정렬 값
export function between(before: Row | undefined, after: Row | undefined) {
  if (before && after) return (before.position + after.position) / 2;
  if (before) return before.position + 1;
  if (after) return after.position - 1;
  return 1;
}

export const byPosition = (a: Row, b: Row) => a.position - b.position || a.createdAt - b.createdAt;

// 다른 종류로 바꿀 때 기존 값을 최대한 살린다
export function convertValue(v: PropValue | undefined, from: Property, to: PropType, toOptions: SelectOption[]): PropValue | null {
  if (v === undefined) return null;
  let text = '';
  // 파일·담당자는 다른 종류로 바꾸지 않는다
  if (Array.isArray(v)) return null;
  else if (from.type === 'select') text = findOption(from, v)?.name ?? '';
  else if (typeof v === 'boolean') text = v ? '예' : '';
  else text = String(v);
  switch (to) {
    case 'text': return text || null;
    case 'number': {
      const n = Number(text.replace(/,/g, ''));
      return text && Number.isFinite(n) ? n : null;
    }
    case 'checkbox': return v === true || (typeof v === 'number' && v !== 0) || ['예', 'true', 'o', 'v'].includes(text.toLowerCase());
    case 'date': return isDateKey(text) ? text : null;
    case 'select': return toOptions.find((o) => o.name === text)?.id ?? null;
    // 파일은 다른 값에서 만들 수 없다
    case 'file': return null;
    case 'person': return null;
  }
}

export function defaultBoardProp(schema: Schema) {
  const id = schema.board.groupBy;
  return schema.properties.find((p) => p.id === id && p.type === 'select') ?? schema.properties.find((p) => p.type === 'select') ?? null;
}

export function defaultDateProp(schema: Schema) {
  const id = schema.calendar.dateProp;
  return schema.properties.find((p) => p.id === id && p.type === 'date') ?? schema.properties.find((p) => p.type === 'date') ?? null;
}

// 타임라인: 시작일·종료일·묶기 속성 (설정이 없거나 지워졌으면 알맞은 걸 고른다)
export function timelineProps(schema: Schema) {
  const t = schema.timeline;
  const dates = schema.properties.filter((p) => p.type === 'date');
  const start = dates.find((p) => p.id === t?.startProp) ?? defaultDateProp(schema);
  const end = t ? dates.find((p) => p.id === t.endProp && p.id !== start?.id) ?? null : dates.find((p) => p.id !== start?.id) ?? null;
  const group = t ? schema.properties.find((p) => p.id === t.groupBy && p.type === 'select') ?? null : defaultBoardProp(schema);
  return { start, end, group };
}

export function parseKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

// 두 날짜 사이 일수 (b - a)
export function diffDays(a: string, b: string) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
