import type { TagColor } from '../../api';
import { addDays, diffDays, todayKey } from '../../database';

// 위젯마다 config 에 담기는 데이터 모양. 위젯과 상세 페이지가 함께 쓴다.

export const TAGS: TagColor[] = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
export const tagAt = (i: number): TagColor => TAGS[((i % 6) + 6) % 6];

// ── D-day ──
export type Dday = { id: string; name: string; date: string; emoji: string; memo?: string; yearly?: boolean };
export type DdayConfig = { items?: Dday[] };

// 매년 반복이면 오늘 이후 가장 가까운 날
export function ddayTarget(d: Dday) {
  if (!d.yearly) return d.date;
  const today = todayKey();
  const [, m, day] = d.date.split('-');
  let y = Number(today.slice(0, 4));
  let key = `${y}-${m}-${day}`;
  if (key < today) {
    y += 1;
    key = `${y}-${m}-${day}`;
  }
  return key;
}

export function ddayLabel(d: Dday) {
  const n = diffDays(todayKey(), ddayTarget(d));
  if (n === 0) return 'D-DAY';
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

export function sortDdays(items: Dday[]) {
  const today = todayKey();
  return [...items].sort((a, b) => {
    const ta = ddayTarget(a);
    const tb = ddayTarget(b);
    const pa = ta < today ? 1 : 0;
    const pb = tb < today ? 1 : 0;
    return pa - pb || (pa ? tb.localeCompare(ta) : ta.localeCompare(tb));
  });
}

// ── 습관 ──
export type Habit = { id: string; name: string; color?: TagColor };
export type HabitsConfig = { habits?: Habit[]; log?: Record<string, string[]> };

export const habitColor = (h: Habit, i: number) => h.color ?? tagAt(i);

export function streak(days: Set<string>) {
  let key = todayKey();
  if (!days.has(key)) key = addDays(key, -1);
  let n = 0;
  while (days.has(key) && n < 3650) {
    n += 1;
    key = addDays(key, -1);
  }
  return n;
}

export function longestStreak(days: string[]) {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const k of sorted) {
    run = prev && diffDays(prev, k) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

// 오래된 기록은 2년치만 남긴다
export function trimLog(days: Set<string>) {
  const cutoff = addDays(todayKey(), -730);
  return [...days].filter((k) => k >= cutoff).sort();
}

// ── 목표 ──
export type Goal = { id: string; name: string; current: number; target: number; unit: string; deadline?: string; memo?: string };
export type GoalsConfig = { goals?: Goal[] };

// ── 메모 ──
export type MemoConfig = { text?: string };

// ── 가계부 ──
export type EntryKind = 'out' | 'in';
export type Entry = { id: string; date: string; kind: EntryKind; amount: number; cat: string; memo: string; pay?: string };
export type BudgetConfig = { entries?: Entry[]; budget?: number; catsOut?: string[]; catsIn?: string[] };

export const DEFAULT_CATS_OUT = ['식비', '카페', '교통', '쇼핑', '생활', '취미', '기타'];
export const DEFAULT_CATS_IN = ['월급', '용돈', '부수입', '기타'];
export const PAY_METHODS = ['카드', '현금', '계좌이체', '기타'];

export const catsOf = (c: BudgetConfig, kind: EntryKind) =>
  kind === 'out' ? (c.catsOut?.length ? c.catsOut : DEFAULT_CATS_OUT) : (c.catsIn?.length ? c.catsIn : DEFAULT_CATS_IN);

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export function compactWon(n: number) {
  if (n >= 100_000_000) return `${+(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${+(n / 10_000).toFixed(n >= 100_000 ? 0 : 1)}만`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}천`;
  return String(n);
}

export function parseAmount(raw: string) {
  const n = Math.round(Number(raw.replace(/[,\s원]/g, '')));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── 링크 ──
export type Link = { id: string; title: string; url: string; cat?: string; memo?: string; createdAt?: number };
export type LinksConfig = { links?: Link[] };

export function normalizeUrl(raw: string) {
  const v = raw.trim();
  if (!v) return '';
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// 분류 이름마다 처음 나온 순서대로 고정 색 (지워져도 다른 분류 색이 바뀌지 않게 이름으로 정함)
export function catColor(name: string): TagColor {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return tagAt(Math.abs(h));
}
