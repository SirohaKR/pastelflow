import { useState, type DragEvent } from 'react';
import type { PageMeta, Scope, Space, User } from '../api';
import { childrenOf, displayTitle, dotColor, isInSubtree, type DropZone } from '../tree';
import { Popover } from './Popover';
import { Avatar } from './Account';
import './spaces.css';

type Props = {
  pages: PageMeta[];
  spaces: Space[];
  currentId: string | null;
  expanded: Set<string>;
  onToggle: (id: string, open?: boolean) => void;
  onOpen: (id: string) => void;
  onCreate: (parentId: string | null, kind?: 'page' | 'database', scope?: Scope) => void;
  onMove: (id: string, target: PageMeta, zone: DropZone) => void;
  onFavorite: (id: string, favorite: boolean) => void;
  onTrash: (id: string) => void;
  onDuplicate: (id: string) => void;
  onSearch: () => void;
  onTrashOpen: () => void;
  onSettings: () => void;
  onCollapse: () => void;
  onHome: () => void;
  me: User;
  onProfile: () => void;
  onMembers: () => void;
  // 페이지를 다른 자리(전체 공용 / 스페이스 / 내 페이지)의 맨 위로 옮기기
  onMoveTo: (id: string, scope: Scope) => void;
  onNewSpace: () => void;
  onSpaceSettings: (space: Space) => void;
  onLeaveSpace: (space: Space) => void;
};

// 사이드바 구역 하나: 전체 공용, 스페이스들, 내 페이지
type Section = { key: string; label: string; hint: string; scope: Scope; roots: PageMeta[]; space?: Space };

const sameScope = (p: PageMeta, s: Scope) => (s.private ? p.private : !p.private && (p.spaceId ?? null) === (s.spaceId ?? null));

function loadFolded() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem('pf-folded') || '[]'));
  } catch {
    return new Set<string>();
  }
}

export function Sidebar(props: Props) {
  const { pages, spaces, onCreate } = props;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overSection, setOverSection] = useState<string | null>(null);
  const [folded, setFolded] = useState(loadFolded);
  const [spaceMenu, setSpaceMenu] = useState<{ anchor: HTMLElement; space: Space } | null>(null);
  const favorites = pages.filter((p) => p.favorite && p.deletedAt == null);
  const roots = childrenOf(pages, null);
  const isMac = navigator.platform.toLowerCase().includes('mac');

  const sections: Section[] = [
    { key: 'shared', label: '👥 전체 공용', hint: '모든 멤버가 함께 보는 페이지를 여기에 만들어요.', scope: {}, roots: [] },
    ...spaces.map((s) => ({
      key: s.id, label: `${s.icon || '#'} ${s.name}`, hint: '이 스페이스 멤버만 보는 페이지를 만들어요.',
      scope: { spaceId: s.id }, roots: [] as PageMeta[], space: s,
    })),
    { key: 'private', label: '🔒 내 페이지', hint: '나만 보는 페이지를 여기에 만들어요.', scope: { private: true }, roots: [] },
  ];
  for (const p of roots) sections.find((s) => sameScope(p, s.scope))?.roots.push(p);

  const toggleFold = (key: string) => {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem('pf-folded', JSON.stringify([...next]));
      } catch {
        /* 무시 */
      }
      return next;
    });
  };

  // 구역 이름 위로 끌어 놓으면 그 구역 맨 위로 옮긴다
  const sectionDrop = (s: Section) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      setOverSection(s.key);
    },
    onDragLeave: () => setOverSection(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (dragId) props.onMoveTo(dragId, s.scope);
      setOverSection(null);
      setDragId(null);
    },
  });

  const canManage = (s: Space) => s.myRole === 'owner' || props.me.role === 'admin';

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><span /><span /><span /></div>
        <div className="brand-name">파스텔플로우</div>
        <button className="icon-btn" title="사이드바 접기" onClick={props.onCollapse}>«</button>
      </div>

      <div className="side-actions">
        <button className={`side-action ${props.currentId === null ? 'on' : ''}`} onClick={props.onHome}>🏠 홈</button>
        <button className="side-action" onClick={props.onSearch}>
          🔍 검색 <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        <button className="side-action" onClick={() => onCreate(null)}>➕ 새 페이지</button>
        <button className="side-action" onClick={() => onCreate(null, 'database')}>🗃️ 새 데이터베이스</button>
      </div>

      <div className="side-scroll">
        {favorites.length > 0 && (
          <div className="side-section">
            <div className="side-label">즐겨찾기</div>
            {favorites.map((p) => (
              <TreeNode key={`fav-${p.id}`} page={p} depth={0} flat {...props} dragId={dragId} setDragId={setDragId} />
            ))}
          </div>
        )}

        {sections.map((s) => {
          const isFolded = folded.has(s.key);
          return (
            <div key={s.key} className={`side-section ${s.space ? `space tag-${s.space.color}` : ''}`}>
              <div className={`side-label ${overSection === s.key ? 'drop-on' : ''}`} {...sectionDrop(s)}>
                <button className="side-fold" onClick={() => toggleFold(s.key)} title={isFolded ? '펼치기' : '접기'}>
                  <span className={`fold-arrow ${isFolded ? '' : 'open'}`}>▶</span>
                  <span className="side-label-text" title={s.space ? `${s.space.members.length}명` : s.hint}>{s.label}</span>
                </button>
                <span className="side-label-tools">
                  {s.space && (
                    <button className="icon-btn" title="스페이스 메뉴" onClick={(e) => setSpaceMenu({ anchor: e.currentTarget, space: s.space! })}>⋯</button>
                  )}
                  <button className="icon-btn" title="페이지 추가" onClick={() => onCreate(null, 'page', s.scope)}>+</button>
                </span>
              </div>
              {!isFolded && (
                <>
                  {s.roots.length === 0 && <div className="side-empty">{s.hint}</div>}
                  {s.roots.map((p) => (
                    <TreeNode key={p.id} page={p} depth={0} {...props} dragId={dragId} setDragId={setDragId} />
                  ))}
                </>
              )}
            </div>
          );
        })}

        <button className="side-action new-space" onClick={props.onNewSpace}>＋ 스페이스 만들기</button>
      </div>

      <div className="side-bottom">
        <button className="side-action" onClick={props.onTrashOpen}>🗑️ 휴지통</button>
        <button className="side-action" onClick={props.onSettings}>🎨 테마 설정</button>
        {props.me.role === 'admin' && <button className="side-action" onClick={props.onMembers}>👥 멤버 관리</button>}
        <button className="side-me" onClick={props.onProfile} title="내 프로필">
          <Avatar user={props.me} size={28} />
          <b>{props.me.nickname}</b>
          <small>⚙</small>
        </button>
      </div>

      {spaceMenu && (
        <Popover anchor={spaceMenu.anchor} onClose={() => setSpaceMenu(null)}>
          <div className="menu">
            <button onClick={() => { onCreate(null, 'page', { spaceId: spaceMenu.space.id }); setSpaceMenu(null); }}>➕ 페이지 추가</button>
            <button onClick={() => { onCreate(null, 'database', { spaceId: spaceMenu.space.id }); setSpaceMenu(null); }}>🗃️ 데이터베이스 추가</button>
            <button onClick={() => { props.onSpaceSettings(spaceMenu.space); setSpaceMenu(null); }}>
              {canManage(spaceMenu.space) ? '⚙ 스페이스 설정·멤버' : '👥 멤버 보기'}
            </button>
            <button className="danger" onClick={() => { props.onLeaveSpace(spaceMenu.space); setSpaceMenu(null); }}>🚪 스페이스 나가기</button>
          </div>
        </Popover>
      )}
    </aside>
  );
}

type NodeProps = Props & {
  page: PageMeta;
  depth: number;
  flat?: boolean;
  dragId: string | null;
  setDragId: (id: string | null) => void;
};

function TreeNode(props: NodeProps) {
  const { page, depth, flat, pages, spaces, expanded, currentId, dragId, setDragId } = props;
  const [zone, setZone] = useState<DropZone | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [moveAnchor, setMoveAnchor] = useState<HTMLElement | null>(null);
  const kids = flat ? [] : childrenOf(pages, page.id);
  const open = expanded.has(page.id);
  // 데이터베이스는 하위 페이지 대신 행을 가진다
  const isDb = page.kind === 'database';

  const canDrop = !flat && dragId && dragId !== page.id && !isInSubtree(pages, dragId, page.id);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!canDrop) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (isDb) setZone(y < 0.5 ? 'before' : 'after');
    else setZone(y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside');
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (canDrop && zone && dragId) props.onMove(dragId, page, zone);
    setZone(null);
    setDragId(null);
  };

  // 옮길 수 있는 자리 (지금 최상위로 있는 자리는 뺀다)
  const destinations: { label: string; scope: Scope }[] = [
    { label: '👥 전체 공용', scope: {} },
    ...spaces.map((s) => ({ label: `${s.icon || '#'} ${s.name}`, scope: { spaceId: s.id } })),
    { label: '🔒 내 페이지', scope: { private: true } },
  ].filter((d) => page.parentId || !sameScope(page, d.scope));

  return (
    <>
      <div
        className={[
          'tree-row',
          currentId === page.id && 'active',
          zone && `drop-${zone}`,
          (menuAnchor || moveAnchor) && 'menu-open',
        ].filter(Boolean).join(' ')}
        style={{ paddingLeft: 4 + depth * 16 }}
        draggable={!flat}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          setDragId(page.id);
        }}
        onDragEnd={() => setDragId(null)}
        onDragOver={onDragOver}
        onDragLeave={() => setZone(null)}
        onDrop={onDrop}
      >
        <button
          className={`tree-toggle ${open ? 'open' : ''} ${kids.length === 0 || flat || isDb ? 'leaf' : ''}`}
          onClick={() => props.onToggle(page.id)}
          aria-label={open ? '접기' : '펼치기'}
        >
          ▶
        </button>
        <button className="tree-link" onClick={() => props.onOpen(page.id)}>
          {page.icon ? (
            <span className="tree-icon">{page.icon}</span>
          ) : isDb ? (
            <span className="tree-icon db-glyph">▦</span>
          ) : (
            <span className="tree-dot" style={{ background: dotColor(page.id) }} />
          )}
          <span className={`tree-title ${page.title.trim() ? '' : 'untitled'}`}>{displayTitle(page)}</span>
        </button>
        <div className="tree-tools">
          <button className="icon-btn" title="더 보기" onClick={(e) => setMenuAnchor(e.currentTarget)}>⋯</button>
          {!flat && !isDb && (
            <button
              className="icon-btn"
              title="하위 페이지 추가"
              onClick={() => {
                props.onToggle(page.id, true);
                props.onCreate(page.id);
              }}
            >
              +
            </button>
          )}
        </div>
      </div>

      {menuAnchor && (
        <Popover anchor={menuAnchor} onClose={() => setMenuAnchor(null)}>
          <div className="menu">
            <button
              onClick={() => {
                props.onFavorite(page.id, !page.favorite);
                setMenuAnchor(null);
              }}
            >
              {page.favorite ? '☆ 즐겨찾기 해제' : '⭐ 즐겨찾기에 추가'}
            </button>
            {!isDb && (
              <>
                <button
                  onClick={() => {
                    props.onToggle(page.id, true);
                    props.onCreate(page.id);
                    setMenuAnchor(null);
                  }}
                >
                  ➕ 하위 페이지 추가
                </button>
                <button
                  onClick={() => {
                    props.onToggle(page.id, true);
                    props.onCreate(page.id, 'database');
                    setMenuAnchor(null);
                  }}
                >
                  🗃️ 하위 데이터베이스 추가
                </button>
              </>
            )}
            <button
              onClick={() => {
                setMoveAnchor(menuAnchor);
                setMenuAnchor(null);
              }}
            >
              📦 다른 곳으로 옮기기
            </button>
            <button
              onClick={() => {
                props.onDuplicate(page.id);
                setMenuAnchor(null);
              }}
            >
              📄 복사본 만들기
            </button>
            <button
              className="danger"
              onClick={() => {
                props.onTrash(page.id);
                setMenuAnchor(null);
              }}
            >
              🗑️ 휴지통으로 옮기기
            </button>
          </div>
        </Popover>
      )}

      {moveAnchor && (
        <Popover anchor={moveAnchor} onClose={() => setMoveAnchor(null)}>
          <div className="menu">
            <div className="pop-head">어디로 옮길까요? (하위 페이지도 함께)</div>
            {destinations.map((d) => (
              <button
                key={d.label}
                onClick={() => {
                  props.onMoveTo(page.id, d.scope);
                  setMoveAnchor(null);
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Popover>
      )}

      {open && kids.map((k) => <TreeNode key={k.id} {...props} page={k} depth={depth + 1} />)}
    </>
  );
}
