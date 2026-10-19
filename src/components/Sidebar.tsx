import { useState, type DragEvent } from 'react';
import type { PageMeta, User } from '../api';
import { childrenOf, displayTitle, dotColor, isInSubtree, type DropZone } from '../tree';
import { Popover } from './Popover';
import { Avatar } from './Account';

type Props = {
  pages: PageMeta[];
  currentId: string | null;
  expanded: Set<string>;
  onToggle: (id: string, open?: boolean) => void;
  onOpen: (id: string) => void;
  onCreate: (parentId: string | null, kind?: 'page' | 'database', isPrivate?: boolean) => void;
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
  // 최상위 페이지를 공용 ↔ 내 페이지 구역으로 옮기기
  onSetPrivate: (id: string, isPrivate: boolean) => void;
};

export function Sidebar(props: Props) {
  const { pages, onCreate } = props;
  const [dragId, setDragId] = useState<string | null>(null);
  const favorites = pages.filter((p) => p.favorite && p.deletedAt == null);
  const roots = childrenOf(pages, null);
  const sharedRoots = roots.filter((p) => !p.private);
  const privateRoots = roots.filter((p) => p.private);
  const [overSection, setOverSection] = useState<'shared' | 'private' | null>(null);

  // 구역 이름 위로 끌어 놓으면 그 구역 맨 위로 옮긴다
  const sectionDrop = (isPrivate: boolean) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      setOverSection(isPrivate ? 'private' : 'shared');
    },
    onDragLeave: () => setOverSection(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (dragId) props.onSetPrivate(dragId, isPrivate);
      setOverSection(null);
      setDragId(null);
    },
  });
  const isMac = navigator.platform.toLowerCase().includes('mac');

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

        <div className="side-section">
          <div className={`side-label ${overSection === 'shared' ? 'drop-on' : ''}`} {...sectionDrop(false)}>
            <span title="모든 멤버가 함께 보고 고쳐요">👥 공용</span>
            <button className="icon-btn" style={{ width: 22, height: 22 }} title="공용 페이지 추가" onClick={() => onCreate(null)}>+</button>
          </div>
          {sharedRoots.length === 0 && <div className="side-empty">함께 쓰는 페이지를 여기에 만들어요.</div>}
          {sharedRoots.map((p) => (
            <TreeNode key={p.id} page={p} depth={0} {...props} dragId={dragId} setDragId={setDragId} />
          ))}
        </div>

        <div className="side-section">
          <div className={`side-label ${overSection === 'private' ? 'drop-on' : ''}`} {...sectionDrop(true)}>
            <span title="나만 볼 수 있어요">🔒 내 페이지</span>
            <button className="icon-btn" style={{ width: 22, height: 22 }} title="내 페이지 추가" onClick={() => onCreate(null, 'page', true)}>+</button>
          </div>
          {privateRoots.length === 0 && <div className="side-empty">나만 보는 페이지를 여기에 만들어요.</div>}
          {privateRoots.map((p) => (
            <TreeNode key={p.id} page={p} depth={0} {...props} dragId={dragId} setDragId={setDragId} />
          ))}
        </div>
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
  const { page, depth, flat, pages, expanded, currentId, dragId, setDragId } = props;
  const [zone, setZone] = useState<DropZone | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const kids = flat ? [] : childrenOf(pages, page.id);
  const open = expanded.has(page.id);
  // 데이터베이스는 하위 페이지 대신 행을 가진다
  const isDb = page.kind === 'database';

  const canDrop = !flat && dragId && dragId !== page.id && !isInSubtree(pages, dragId, page.id);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!canDrop) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (isDb) setZone(y < 0.5 ? 'before' : 'after');
    else setZone(y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside');
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (canDrop && zone && dragId) props.onMove(dragId, page, zone);
    setZone(null);
    setDragId(null);
  };

  return (
    <>
      <div
        className={[
          'tree-row',
          currentId === page.id && 'active',
          zone && `drop-${zone}`,
          menuAnchor && 'menu-open',
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
            {!page.parentId && !flat && (
              <button
                onClick={() => {
                  props.onSetPrivate(page.id, !page.private);
                  setMenuAnchor(null);
                }}
              >
                {page.private ? '👥 공용으로 옮기기' : '🔒 내 페이지로 옮기기'}
              </button>
            )}
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

      {open && kids.map((k) => <TreeNode key={k.id} {...props} page={k} depth={depth + 1} />)}
    </>
  );
}
