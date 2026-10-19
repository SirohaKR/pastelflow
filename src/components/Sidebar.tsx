import { useState, type DragEvent } from 'react';
import type { PageMeta } from '../api';
import { childrenOf, displayTitle, dotColor, isInSubtree, type DropZone } from '../tree';
import { Popover } from './Popover';

type Props = {
  pages: PageMeta[];
  currentId: string | null;
  expanded: Set<string>;
  onToggle: (id: string, open?: boolean) => void;
  onOpen: (id: string) => void;
  onCreate: (parentId: string | null) => void;
  onMove: (id: string, target: PageMeta, zone: DropZone) => void;
  onFavorite: (id: string, favorite: boolean) => void;
  onTrash: (id: string) => void;
  onSearch: () => void;
  onTrashOpen: () => void;
  onSettings: () => void;
  onCollapse: () => void;
};

export function Sidebar(props: Props) {
  const { pages, onCreate } = props;
  const [dragId, setDragId] = useState<string | null>(null);
  const favorites = pages.filter((p) => p.favorite && p.deletedAt == null);
  const roots = childrenOf(pages, null);
  const isMac = navigator.platform.toLowerCase().includes('mac');

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><span /><span /><span /></div>
        <div className="brand-name">파스텔플로우</div>
        <button className="icon-btn" title="사이드바 접기" onClick={props.onCollapse}>«</button>
      </div>

      <div className="side-actions">
        <button className="side-action" onClick={props.onSearch}>
          🔍 검색 <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        <button className="side-action" onClick={() => onCreate(null)}>➕ 새 페이지</button>
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
          <div className="side-label">
            <span>내 페이지</span>
            <button className="icon-btn" style={{ width: 22, height: 22 }} title="새 페이지" onClick={() => onCreate(null)}>+</button>
          </div>
          {roots.length === 0 && <div className="side-empty">아직 페이지가 없어요.</div>}
          {roots.map((p) => (
            <TreeNode key={p.id} page={p} depth={0} {...props} dragId={dragId} setDragId={setDragId} />
          ))}
        </div>
      </div>

      <div className="side-bottom">
        <button className="side-action" onClick={props.onTrashOpen}>🗑️ 휴지통</button>
        <button className="side-action" onClick={props.onSettings}>🎨 테마 설정</button>
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

  const canDrop = !flat && dragId && dragId !== page.id && !isInSubtree(pages, dragId, page.id);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!canDrop) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    setZone(y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside');
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
          className={`tree-toggle ${open ? 'open' : ''} ${kids.length === 0 || flat ? 'leaf' : ''}`}
          onClick={() => props.onToggle(page.id)}
          aria-label={open ? '접기' : '펼치기'}
        >
          ▶
        </button>
        <button className="tree-link" onClick={() => props.onOpen(page.id)}>
          {page.icon ? (
            <span className="tree-icon">{page.icon}</span>
          ) : (
            <span className="tree-dot" style={{ background: dotColor(page.id) }} />
          )}
          <span className={`tree-title ${page.title.trim() ? '' : 'untitled'}`}>{displayTitle(page)}</span>
        </button>
        <div className="tree-tools">
          <button className="icon-btn" title="더 보기" onClick={(e) => setMenuAnchor(e.currentTarget)}>⋯</button>
          {!flat && (
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
      {open && !flat && kids.length === 0 && (
        <div className="side-empty" style={{ paddingLeft: 30 + depth * 16 }}>하위 페이지 없음</div>
      )}
    </>
  );
}
