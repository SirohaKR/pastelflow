import { useState } from 'react';
import type { Category, PageMeta, Space, User } from '../api';
import { childrenOf, displayTitle, dotColor } from '../tree';
import { SPACE_ROLES } from '../roles';
import { Avatar } from './Account';
import { Popover } from './Popover';
import './spaces.css';

// 스페이스 아이콘: 사진이 있으면 사진, 없으면 스페이스 색 바탕에 이모지
export function SpaceIcon({ space, size = 32, round = false }: { space: Pick<Space, 'icon' | 'image' | 'color'>; size?: number; round?: boolean }) {
  return (
    <span
      className={`space-badge tag-${space.color} ${round ? 'round' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      {space.image ? <img src={space.image} alt="" /> : space.icon || '#'}
    </span>
  );
}

export type SpaceDialogMode = 'settings' | 'members';

type Props = {
  space: Space;
  me: User;
  users: User[];
  pages: PageMeta[];
  categories: Category[];
  onOpen: (id: string) => void;
  onDialog: (mode: SpaceDialogMode) => void;
  onDelete: () => void;
  onLeave: () => void;
};

// 스페이스 홈: 아이콘·이름, 설정 메뉴, 채널(최상위 페이지)과 멤버
export function SpaceHome({ space, me, users, pages, categories, onOpen, onDialog, onDelete, onLeave }: Props) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const canManage = space.myRole === 'owner' || me.role === 'admin';
  const roots = childrenOf(pages, null).filter((p) => !p.private && p.spaceId === space.id);
  const cats = categories.filter((c) => c.spaceId === space.id).sort((a, b) => a.position - b.position);
  const groups = [
    { id: '', name: '', items: roots.filter((p) => !p.categoryId || !cats.some((c) => c.id === p.categoryId)) },
    ...cats.map((c) => ({ id: c.id, name: c.name, items: roots.filter((p) => p.categoryId === c.id) })),
  ].filter((g) => g.id || g.items.length);
  const roleLabel = (r: string) => SPACE_ROLES.find((x) => x.key === r)?.label ?? r;
  const only = '스페이스 관리자만 할 수 있어요';
  const pick = (fn: () => void) => () => {
    setMenu(null);
    fn();
  };

  return (
    <div className="space-home">
      <header className={`sh-head tag-${space.color}`}>
        <SpaceIcon space={space} size={88} round />
        <div className="sh-title">
          <h1>{space.name}</h1>
          <p>멤버 {space.members.length}명 · 내 역할 {space.myRole ? roleLabel(space.myRole) : '⭐ 전체 관리자'}</p>
        </div>
        <button className="btn sh-gear" onClick={(e) => setMenu(e.currentTarget)}>⚙ 설정</button>
      </header>

      <div className="sh-grid">
        <section className="sh-card">
          <h3>채널</h3>
          {groups.length === 0 && <p className="w-sub">아직 페이지가 없어요. 사이드바의 ＋ 로 만들어 보세요.</p>}
          {groups.map((g) => (
            <div key={g.id || 'none'} className="sh-group">
              {g.name && <div className="sh-cat">{g.name}</div>}
              {g.items.length === 0 && <div className="w-sub sh-none">비어 있어요</div>}
              {g.items.map((p) => (
                <button key={p.id} className="sh-page" onClick={() => onOpen(p.id)}>
                  {p.icon ? <span>{p.icon}</span> : <span className="tree-dot" style={{ background: dotColor(p.id) }} />}
                  <span className="sh-page-title">{displayTitle(p)}</span>
                  {p.locked && <span title="관리자만 편집">🔒</span>}
                </button>
              ))}
            </div>
          ))}
        </section>

        <section className="sh-card">
          <h3>멤버 {space.members.length}명</h3>
          <ul className="sh-members">
            {space.members.map((m) => {
              const u = users.find((x) => x.id === m.userId);
              if (!u) return null;
              return (
                <li key={m.userId}>
                  <Avatar user={u} size={30} />
                  <b>{u.nickname}{u.id === me.id && ' (나)'}</b>
                  <small className="w-sub">{roleLabel(m.role)}</small>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)} align="right">
          <div className="menu">
            <button disabled={!canManage} title={canManage ? '' : only} onClick={pick(() => onDialog('settings'))}>⚙ 스페이스 설정</button>
            <button disabled={!canManage} title={canManage ? '' : only} onClick={pick(() => onDialog('members'))}>👥 멤버·권한 관리</button>
            <button className="danger" disabled={!canManage} title={canManage ? '' : only} onClick={pick(onDelete)}>🗑️ 스페이스 삭제</button>
            <button className="danger" onClick={pick(onLeave)}>🚪 스페이스 나가기</button>
          </div>
        </Popover>
      )}
    </div>
  );
}
