import type { Scope, Space, User } from './api';

// 권한 단계 (서버 server/db.js 와 같은 값)
export const VIEW = 1;
export const EDIT = 2;
export const DELETE = 3;
export const MANAGE = 4;

export type SiteRole = User['role'];
export type SpaceRole = 'owner' | 'full' | 'edit' | 'view';

export const SITE_ROLES: { key: SiteRole; label: string; desc: string }[] = [
  { key: 'admin', label: '⭐ 관리자', desc: '모든 것 + 문서 잠금·멤버 관리' },
  { key: 'full', label: '🗑 편집·삭제', desc: '만들기·고치기 + 지우기·되돌리기' },
  { key: 'edit', label: '✏️ 편집', desc: '만들기·고치기·옮기기 (지우기는 안 됨)' },
  { key: 'view', label: '👁 보기 전용', desc: '읽기만' },
];

export const SPACE_ROLES: { key: SpaceRole; label: string }[] = [
  { key: 'owner', label: '⭐ 스페이스 관리자' },
  { key: 'full', label: '🗑 편집·삭제' },
  { key: 'edit', label: '✏️ 편집' },
  { key: 'view', label: '👁 보기 전용' },
];

const LEVEL: Record<string, number> = { admin: MANAGE, owner: MANAGE, full: DELETE, edit: EDIT, view: VIEW };

// 그 자리(전체 공용 / 스페이스 / 내 페이지)에서 내 권한 단계
export function scopeLevel(me: User, spaces: Space[], scope: Scope) {
  if (scope.private) return MANAGE;
  if (me.role === 'admin') return MANAGE;
  if (scope.spaceId) return LEVEL[spaces.find((s) => s.id === scope.spaceId)?.myRole ?? ''] ?? 0;
  return LEVEL[me.role] ?? 0;
}

export const siteRoleLabel = (r: string) => SITE_ROLES.find((x) => x.key === r)?.label ?? r;
