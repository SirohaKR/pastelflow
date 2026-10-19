import type { PageMeta } from './api';

export type DropZone = 'before' | 'after' | 'inside';

export const livePages = (pages: PageMeta[]) => pages.filter((p) => p.deletedAt == null);

export function childrenOf(pages: PageMeta[], parentId: string | null) {
  return pages
    .filter((p) => p.parentId === parentId && p.deletedAt == null)
    .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
}

export function ancestors(pages: PageMeta[], id: string | null) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const chain: PageMeta[] = [];
  let cur = id ? byId.get(id) : undefined;
  while (cur && chain.length < 50) {
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

export function isInSubtree(pages: PageMeta[], rootId: string, id: string) {
  return ancestors(pages, id).some((p) => p.id === rootId);
}

// 드롭 위치를 상위 페이지와 정렬 값으로 바꾼다
export function dropTarget(pages: PageMeta[], target: PageMeta, zone: DropZone, draggedId: string) {
  if (zone === 'inside') {
    const kids = childrenOf(pages, target.id).filter((p) => p.id !== draggedId);
    const last = kids[kids.length - 1];
    return { parentId: target.id, position: last ? last.position + 1 : 1 };
  }
  const siblings = childrenOf(pages, target.parentId).filter((p) => p.id !== draggedId);
  const idx = siblings.findIndex((p) => p.id === target.id);
  const before = zone === 'before' ? siblings[idx - 1] : target;
  const after = zone === 'before' ? target : siblings[idx + 1];
  let position: number;
  if (before && after) position = (before.position + after.position) / 2;
  else if (before) position = before.position + 1;
  else position = after.position - 1;
  return { parentId: target.parentId, position };
}

export const displayTitle = (p: Pick<PageMeta, 'title'>) => p.title.trim() || '제목 없음';

// 아이콘이 없는 페이지에 돌려가며 붙이는 파스텔 점 색
export function dotColor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `var(--p${(Math.abs(h) % 6) + 1})`;
}

export function timeAgo(ts: number) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return new Date(ts).toLocaleDateString('ko-KR');
}
