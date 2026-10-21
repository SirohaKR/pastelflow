import type { PageMeta, Scope, Space } from './api';

// 사이드바에 보이는 구역: 'shared'(전체 공용), 'private'(내 페이지), 그 밖에는 스페이스 id
export type ZoneKey = string;

export const zoneOf = (p: Pick<PageMeta, 'private' | 'spaceId'>): ZoneKey => (p.private ? 'private' : p.spaceId ?? 'shared');

export const zoneScope = (z: ZoneKey): Scope => (z === 'private' ? { private: true } : z === 'shared' ? {} : { spaceId: z });

export const inZone = (p: Pick<PageMeta, 'private' | 'spaceId'>, z: ZoneKey) => zoneOf(p) === z;

// 구역 이름과 이모지 (스페이스는 스페이스 정보를 함께)
export function zoneInfo(z: ZoneKey, spaces: Space[]): { name: string; icon: string; space?: Space } {
  if (z === 'shared') return { name: '전체 공용', icon: '👥' };
  if (z === 'private') return { name: '내 페이지', icon: '🔒' };
  const space = spaces.find((s) => s.id === z);
  return { name: space?.name ?? '스페이스', icon: space?.icon || '#', space };
}

// 없어진 스페이스면 전체 공용으로
export const validZone = (z: ZoneKey, spaces: Space[]) => (z === 'shared' || z === 'private' || spaces.some((s) => s.id === z) ? z : 'shared');

export function loadZone(): ZoneKey {
  try {
    return localStorage.getItem('pf-zone') || 'shared';
  } catch {
    return 'shared';
  }
}

export function saveZone(z: ZoneKey) {
  try {
    localStorage.setItem('pf-zone', z);
  } catch {
    /* 무시 */
  }
}

// 구역마다 마지막으로 본 페이지 ('' 이면 스페이스 홈)
export function loadLast(z: ZoneKey): string | null {
  try {
    return localStorage.getItem('pf-last:' + z);
  } catch {
    return null;
  }
}

export function saveLast(z: ZoneKey, id: string) {
  try {
    localStorage.setItem('pf-last:' + z, id);
  } catch {
    /* 무시 */
  }
}
