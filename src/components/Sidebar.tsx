import { useState, type DragEvent } from 'react';
import { api, type Category, type PageMeta, type Scope, type Space, type User } from '../api';
import { childrenOf, displayTitle, dotColor, isInSubtree, type DropZone } from '../tree';
import { Popover } from './Popover';
import { Avatar } from './Account';
import { SpaceIcon } from './SpaceHome';
import './spaces.css';
import { DELETE, EDIT, MANAGE, VIEW, scopeLevel } from '../roles';
import { inZone, zoneInfo, zoneScope, type ZoneKey } from '../zones';

type Props = {
  pages: PageMeta[];
  spaces: Space[];
  categories: Category[];
  // 지금 사이드바에 보이는 구역
  zone: ZoneKey;
  onZone: (zone: ZoneKey) => void;
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
  // 페이지를 다른 자리(전체 공용 / 스페이스 / 내 페이지, 카테고리)의 최상위로 옮기기
  onMoveTo: (id: string, scope: Scope) => void;
  onNewSpace: () => void;
  onSpaceHome: (id: string) => void;
  // 카테고리를 바꾼 뒤 다시 불러오기
  onCategoriesChanged: () => void;
  onError: (msg: string) => void;
  // 관리자만 편집 잠금 켜고 끄기
  onLock: (id: string, locked: boolean) => void;
};

const sameScope = (p: PageMeta, s: Scope) => (s.private ? p.private : !p.private && (p.spaceId ?? null) === (s.spaceId ?? null));

function loadFolded() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem('pf-folded') || '[]'));
  } catch {
    return new Set<string>();
  }
}

export function Sidebar(props: Props) {
  const { pages, spaces, categories, zone, onCreate, onError } = props;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCat, setOverCat] = useState<string | null>(null);
  const [folded, setFolded] = useState(loadFolded);
  const [zoneMenu, setZoneMenu] = useState<HTMLElement | null>(null);
  const [catMenu, setCatMenu] = useState<{ anchor: HTMLElement; cat: Category } | null>(null);
  // 이름을 고치는 카테고리 ('new' 면 새로 만들기)
  const [naming, setNaming] = useState<{ id: string; name: string } | null>(null);
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const info = zoneInfo(zone, spaces);
  const scope = zoneScope(zone);
  const level = scopeLevel(props.me, spaces, scope);

  // 이 구역의 페이지만: 즐겨찾기, 카테고리 없는 페이지, 카테고리별 페이지
  const favorites = pages.filter((p) => p.favorite && p.deletedAt == null && inZone(p, zone));
  const roots = childrenOf(pages, null).filter((p) => inZone(p, zone));
  const cats = categories.filter((c) => inZone(c, zone)).sort((a, b) => a.position - b.position);
  const loose = roots.filter((p) => !p.categoryId || !cats.some((c) => c.id === p.categoryId));

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

  // 카테고리 이름 위로 끌어 놓으면 그 카테고리로 옮긴다
  // 잠긴 카테고리(공지)는 관리자가 아니면 보기만
  const catLevel = (c: Category) => (c.locked && level < MANAGE ? Math.min(level, VIEW) : level);
  const catDrop = (c: Category) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragId || catLevel(c) < EDIT) return;
      e.preventDefault();
      setOverCat(c.id);
    },
    onDragLeave: () => setOverCat(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (dragId) props.onMoveTo(dragId, { ...scope, categoryId: c.id });
      setOverCat(null);
      setDragId(null);
    },
  });

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      props.onCategoriesChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const saveName = () => {
    if (!naming) return;
    const name = naming.name.trim();
    setNaming(null);
    if (!name) return;
    if (naming.id === 'new') run(() => api.createCategory(name, scope));
    else run(() => api.updateCategory(naming.id, { name }));
  };

  // 옆 카테고리와 자리 바꾸기
  const shift = (c: Category, dir: -1 | 1) => {
    const i = cats.findIndex((x) => x.id === c.id);
    const other = cats[i + dir];
    if (!other) return;
    run(async () => {
      await api.updateCategory(c.id, { position: other.position });
      await api.updateCategory(other.id, { position: c.position });
    });
  };

  const nameInput = (
    <input
      className="field small cat-input"
      autoFocus
      maxLength={60}
      placeholder="카테고리 이름"
      value={naming?.name ?? ''}
      onChange={(e) => setNaming((n) => n && { ...n, name: e.target.value })}
      onBlur={saveName}
      onKeyDown={(e) => {
        if (e.key === 'Enter') saveName();
        if (e.key === 'Escape') setNaming(null);
      }}
    />
  );

  const tree = (p: PageMeta) => <TreeNode key={p.id} page={p} depth={0} {...props} dragId={dragId} setDragId={setDragId} />;

  return (
    <aside className="sidebar">
      <div className={`zone-head ${info.space ? `tag-${info.space.color}` : ''}`}>
        <button className="zone-pick" onClick={(e) => setZoneMenu(e.currentTarget)} title="구역 바꾸기">
          <span className="zone-switch"><span className="brand-mark"><span /><span /><span /></span></span>
          <span className="zone-name">{info.name}</span>
          <span className="zone-caret">▾</span>
        </button>
        {info.space ? (
          <button className="zone-home" title="스페이스 홈" onClick={() => props.onSpaceHome(info.space!.id)}>
            <SpaceIcon space={info.space} size={30} round />
          </button>
        ) : (
          <span className="zone-home static" title={info.name}>{info.icon}</span>
        )}
        <button className="icon-btn" title="사이드바 접기" onClick={props.onCollapse}>«</button>
      </div>

      <div className="side-actions">
        <button className={`side-action ${props.currentId === null ? 'on' : ''}`} onClick={props.onHome}>🏠 홈</button>
        <button className="side-action" onClick={props.onSearch}>
          🔍 검색 <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        {level >= EDIT && (
          <>
            <button className="side-action" onClick={() => onCreate(null, 'page', scope)}>➕ 새 페이지</button>
            <button className="side-action" onClick={() => onCreate(null, 'database', scope)}>🗃️ 새 데이터베이스</button>
          </>
        )}
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
          {level < EDIT && <div className="side-label"><span>페이지</span><span className="tree-lock" title="보기 전용">👁 보기 전용</span></div>}
          {loose.map(tree)}
          {roots.length === 0 && cats.length === 0 && (
            <div className="side-empty">{level >= EDIT ? '아직 페이지가 없어요. 위의 ➕ 새 페이지로 만들어 보세요.' : '아직 페이지가 없어요.'}</div>
          )}
        </div>

        {cats.map((c) => {
          const isFolded = folded.has(`cat:${c.id}`);
          const items = roots.filter((p) => p.categoryId === c.id);
          return (
            <div key={c.id} className="side-section">
              {naming?.id === c.id ? nameInput : (
                <div className={`side-label cat-label ${overCat === c.id ? 'drop-on' : ''}`} {...catDrop(c)}>
                  <button className="side-fold" onClick={() => toggleFold(`cat:${c.id}`)} title={isFolded ? '펼치기' : '접기'}>
                    <span className={`fold-arrow ${isFolded ? '' : 'open'}`}>▶</span>
                    <span className="side-label-text">{c.name}</span>
                    {c.locked && <span className="cat-lock" title={level >= MANAGE ? '관리자만 고칠 수 있는 카테고리예요' : '관리자만 고칠 수 있어요. 읽기만 돼요'}>🔒</span>}
                  </button>
                  <span className="side-label-tools">
                    {level >= MANAGE && (
                      <button className="icon-btn" title="카테고리 메뉴" onClick={(e) => setCatMenu({ anchor: e.currentTarget, cat: c })}>⋯</button>
                    )}
                    {catLevel(c) >= EDIT && (
                      <button className="icon-btn" title="이 카테고리에 페이지 추가" onClick={() => onCreate(null, 'page', { ...scope, categoryId: c.id })}>+</button>
                    )}
                  </span>
                </div>
              )}
              {!isFolded && (
                <>
                  {items.length === 0 && <div className="side-empty">비어 있어요. 페이지를 여기로 끌어 놓을 수 있어요.</div>}
                  {items.map(tree)}
                </>
              )}
            </div>
          );
        })}

        {level >= MANAGE && (naming?.id === 'new' ? (
          <div className="side-section">{nameInput}</div>
        ) : (
          <button className="side-action new-cat" onClick={() => setNaming({ id: 'new', name: '' })}>＋ 카테고리 만들기</button>
        ))}
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

      {zoneMenu && (
        <Popover anchor={zoneMenu} onClose={() => setZoneMenu(null)}>
          <div className="menu zone-menu">
            {props.me.role !== 'view' && (
              <button className="zone-new" onClick={() => { setZoneMenu(null); props.onNewSpace(); }}>＋ 스페이스 만들기</button>
            )}
            <div className="menu-label">구역</div>
            {[
              { key: 'shared', icon: <span className="zone-emoji">👥</span>, name: '전체 공용' },
              ...spaces.map((s) => ({ key: s.id, icon: <SpaceIcon space={s} size={22} round />, name: s.name })),
              { key: 'private', icon: <span className="zone-emoji">🔒</span>, name: '내 페이지' },
            ].map((z) => (
              <button key={z.key} className={z.key === zone ? 'on' : ''} onClick={() => { setZoneMenu(null); props.onZone(z.key); }}>
                {z.icon}
                <span className="zone-item-name">{z.name}</span>
                {z.key === zone && <span className="check">✓</span>}
              </button>
            ))}
          </div>
        </Popover>
      )}

      {catMenu && (
        <Popover anchor={catMenu.anchor} onClose={() => setCatMenu(null)}>
          <div className="menu">
            <button onClick={() => { setNaming({ id: catMenu.cat.id, name: catMenu.cat.name }); setCatMenu(null); }}>✏️ 이름 바꾸기</button>
            <button onClick={() => { const c = catMenu.cat; setCatMenu(null); run(() => api.updateCategory(c.id, { locked: !c.locked })); }}>
              {catMenu.cat.locked ? '🔓 모두 고칠 수 있게' : '🔒 관리자만 고칠 수 있게'}
            </button>
            <button disabled={cats[0]?.id === catMenu.cat.id} onClick={() => { shift(catMenu.cat, -1); setCatMenu(null); }}>⬆ 위로</button>
            <button disabled={cats[cats.length - 1]?.id === catMenu.cat.id} onClick={() => { shift(catMenu.cat, 1); setCatMenu(null); }}>⬇ 아래로</button>
            <button
              className="danger"
              onClick={() => {
                const c = catMenu.cat;
                setCatMenu(null);
                if (confirm(`'${c.name}' 카테고리를 지울까요?\n안의 페이지는 지워지지 않고 카테고리 밖으로 나와요.`)) run(() => api.deleteCategory(c.id));
              }}
            >
              🗑️ 카테고리 지우기
            </button>
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
  const [catAnchor, setCatAnchor] = useState<HTMLElement | null>(null);
  // 최상위 페이지는 같은 구역의 카테고리로 옮길 수 있다
  const pageScope: Scope = page.private ? { private: true } : { spaceId: page.spaceId };
  const zoneCats = page.parentId ? [] : props.categories.filter((c) => sameScope(page, c)).sort((a, b) => a.position - b.position);
  const kids = flat ? [] : childrenOf(pages, page.id);
  const open = expanded.has(page.id);
  // 데이터베이스는 하위 페이지 대신 행을 가진다
  const isDb = page.kind === 'database';
  // 이 페이지에서 내 권한 단계 (잠긴 문서는 관리자가 아니면 보기만)
  const acc = page.access ?? MANAGE;
  const canEdit = acc >= EDIT;

  const canDrop = !flat && canEdit && dragId && dragId !== page.id && !isInSubtree(pages, dragId, page.id);

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
  ].filter((d) => (page.parentId || !sameScope(page, d.scope)) && scopeLevel(props.me, spaces, d.scope) >= EDIT);

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
        draggable={!flat && canEdit}
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
          {page.locked && <span className="tree-lock" title="관리자만 편집">🔒</span>}
        </button>
        <div className="tree-tools">
          <button className="icon-btn" title="더 보기" onClick={(e) => setMenuAnchor(e.currentTarget)}>⋯</button>
          {!flat && !isDb && canEdit && (
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
            {!isDb && canEdit && (
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
            {canEdit && destinations.length > 0 && (
              <button
                onClick={() => {
                  setMoveAnchor(menuAnchor);
                  setMenuAnchor(null);
                }}
              >
                📦 다른 곳으로 옮기기
              </button>
            )}
            {canEdit && zoneCats.length > 0 && (
              <button
                onClick={() => {
                  setCatAnchor(menuAnchor);
                  setMenuAnchor(null);
                }}
              >
                📁 카테고리 바꾸기
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
            {acc >= MANAGE && !page.private && (
              <button
                onClick={() => {
                  props.onLock(page.id, !page.locked);
                  setMenuAnchor(null);
                }}
              >
                {page.locked ? '🔓 잠금 풀기 (모두 편집)' : '🔒 관리자만 편집'}
              </button>
            )}
            {acc >= DELETE && (
              <button
                className="danger"
                onClick={() => {
                  props.onTrash(page.id);
                  setMenuAnchor(null);
                }}
              >
                🗑️ 휴지통으로 옮기기
              </button>
            )}
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

      {catAnchor && (
        <Popover anchor={catAnchor} onClose={() => setCatAnchor(null)}>
          <div className="menu">
            <div className="pop-head">어느 카테고리에 넣을까요?</div>
            {[{ id: null as string | null, name: '카테고리 없음', locked: false }, ...zoneCats.filter((c) => !c.locked || scopeLevel(props.me, spaces, pageScope) >= MANAGE)].map((c) => (
              <button
                key={c.id ?? 'none'}
                className={(page.categoryId ?? null) === c.id ? 'on' : ''}
                onClick={() => {
                  props.onMoveTo(page.id, { ...pageScope, categoryId: c.id });
                  setCatAnchor(null);
                }}
              >
                {c.name}
                {(page.categoryId ?? null) === c.id && <span className="check">✓</span>}
              </button>
            ))}
          </div>
        </Popover>
      )}

      {open && kids.map((k) => <TreeNode key={k.id} {...props} page={k} depth={depth + 1} />)}
    </>
  );
}
