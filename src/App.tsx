import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type AuthStatus, type Category, type Page, type PageMeta, type PagePatch, type Scope, type Space, type User } from './api';
import { applyTheme, cachedSettings, normalizeSettings, type Settings } from './theme';
import { ancestors, displayTitle, dropTarget, isInSubtree, type DropZone } from './tree';
import { Sidebar } from './components/Sidebar';
import { PageView, type SaveState } from './components/PageView';
import { SearchDialog, SettingsDialog, TrashDialog } from './components/Dialogs';
import { AuthScreen, Avatar, MembersDialog, ProfileDialog } from './components/Account';
import { MeContext } from './session';
import { SpaceDialog } from './components/SpaceDialog';
import { SpaceHome, SpaceIcon, type SpaceDialogMode } from './components/SpaceHome';
import { loadZone, saveZone, validZone, zoneOf, type ZoneKey } from './zones';
import { useLive } from './useLive';
import { Home } from './components/home/Home';
import { WidgetPage } from './components/home/WidgetPage';

const isNarrow = () => window.matchMedia('(max-width: 760px)').matches;

function idFromPath() {
  const m = location.pathname.match(/^\/p\/([\w-]+)/);
  return m ? m[1] : null;
}

function widgetFromPath() {
  const m = location.pathname.match(/^\/w\/([\w-]+)/);
  return m ? m[1] : null;
}

function spaceFromPath() {
  const m = location.pathname.match(/^\/s\/([\w-]+)/);
  return m ? m[1] : null;
}

function inviteFromPath() {
  const m = location.pathname.match(/^\/invite\/([\w-]+)/);
  return m ? m[1] : null;
}

function loadExpanded() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem('pf-expanded') || '[]'));
  } catch {
    return new Set<string>();
  }
}

export default function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Settings>(cachedSettings);
  const [dark, setDark] = useState(() => applyTheme(cachedSettings()));
  const [pages, setPages] = useState<PageMeta[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(idFromPath);
  // 홈 위젯 상세 페이지 (/w/위젯id)
  const [widgetId, setWidgetId] = useState<string | null>(widgetFromPath);
  // 스페이스 홈 (/s/스페이스id)
  const [spaceHomeId, setSpaceHomeId] = useState<string | null>(spaceFromPath);
  // 사이드바에 보이는 구역 (전체 공용 / 스페이스 / 내 페이지)
  const [zone, setZoneState] = useState<ZoneKey>(() => spaceFromPath() ?? loadZone());
  const setZone = useCallback((z: ZoneKey) => {
    setZoneState(z);
    saveZone(z);
  }, []);
  const [categories, setCategories] = useState<Category[]>([]);
  const reloadCategories = useCallback(() => api.categories().then(setCategories).catch(() => {}), []);
  const [page, setPage] = useState<Page | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(loadExpanded);
  const [sidebarOpen, setSidebarOpen] = useState(() => !isNarrow());
  const [dialog, setDialog] = useState<'search' | 'trash' | 'settings' | 'profile' | 'members' | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  // 스페이스 만들기(space: null)·설정 창
  const [spaceDialog, setSpaceDialog] = useState<{ space: Space | null; mode?: SpaceDialogMode } | null>(null);
  const reloadSpaces = useCallback(() => api.spaces().then(setSpaces).catch(() => {}), []);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [toast, setToast] = useState('');
  const [dataVersion, setDataVersion] = useState(0);

  const showError = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3000);
  }, []);

  // ── 로그인 확인 ──
  const checkAuth = useCallback(() => {
    api.authStatus().then(setAuth).catch(() => showError('서버에 연결할 수 없어요.'));
  }, [showError]);
  useEffect(checkAuth, [checkAuth]);
  useEffect(() => {
    const onUnauthorized = () => setAuth((a) => (a ? { ...a, user: null } : a));
    window.addEventListener('pf:unauthorized', onUnauthorized);
    return () => window.removeEventListener('pf:unauthorized', onUnauthorized);
  }, []);

  const me = auth?.user ?? null;
  const authed = !!me;

  const reloadPages = useCallback(() => api.listPages().then((ps) => {
    setPages(ps);
    setDataVersion((v) => v + 1);
  }), []);

  useEffect(() => {
    if (!authed) return;
    reloadPages().catch((e) => showError(e.message));
    reloadSpaces();
    reloadCategories();
    api.users().then(setUsers).catch(() => {});
    api.getSettings().then((raw) => {
      const s = normalizeSettings(raw);
      setSettings(s);
      setDark(applyTheme(s));
    }).catch(() => {});
  }, [authed, reloadPages, showError]);

  // ── 실시간: 다른 사람 변경 알림과 접속자 ──
  const liveTimer = useRef<number>();
  const onRemoteChange = useCallback(() => {
    window.clearTimeout(liveTimer.current);
    liveTimer.current = window.setTimeout(() => {
      reloadPages().catch(() => {});
      reloadSpaces();
      reloadCategories();
      api.users().then(setUsers).catch(() => {});
      // 관리자가 내 역할을 바꿨을 수도 있으니 내 정보도 새로
      api.authStatus().then((s) => s.user && setAuth({ setup: false, user: s.user })).catch(() => {});
    }, 300);
  }, [reloadPages, reloadSpaces, reloadCategories]);
  const viewers = useLive(authed, currentId, onRemoteChange);

  // ── 테마 ──
  const changeSettings = (s: Settings) => {
    setSettings(s);
    setDark(applyTheme(s));
    api.putSettings(s).catch((e) => showError(e.message));
  };
  useEffect(() => {
    if (settings.mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(applyTheme(settings));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings]);

  // ── 주소와 현재 페이지 ──
  const open = useCallback((id: string | null, replace = false) => {
    setCurrentId(id);
    setWidgetId(null);
    setSpaceHomeId(null);
    const url = id ? `/p/${id}` : '/';
    if (location.pathname !== url) history[replace ? 'replaceState' : 'pushState'](null, '', url);
    if (isNarrow()) setSidebarOpen(false);
  }, []);

  const openWidget = useCallback((id: string) => {
    setCurrentId(null);
    setWidgetId(id);
    setSpaceHomeId(null);
    const url = `/w/${id}`;
    if (location.pathname !== url) history.pushState(null, '', url);
    if (isNarrow()) setSidebarOpen(false);
  }, []);

  const openSpace = useCallback((id: string) => {
    setCurrentId(null);
    setWidgetId(null);
    setSpaceHomeId(id);
    setZone(id);
    const url = '/s/' + id;
    if (location.pathname !== url) history.pushState(null, '', url);
    if (isNarrow()) setSidebarOpen(false);
  }, [setZone]);

  useEffect(() => {
    const onPop = () => {
      setCurrentId(idFromPath());
      setWidgetId(widgetFromPath());
      setSpaceHomeId(spaceFromPath());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // 보던 페이지가 사라지면 홈으로
  useEffect(() => {
    if (!pages || !currentId) return;
    if (!pages.some((p) => p.id === currentId && p.deletedAt == null)) open(null, true);
  }, [pages, currentId, open]);

  // 페이지를 열면 사이드바도 그 페이지의 구역으로
  const currentMeta = pages?.find((p) => p.id === currentId);
  const currentZone = currentMeta ? zoneOf(currentMeta) : null;
  useEffect(() => {
    if (currentZone) setZone(currentZone);
  }, [currentId, currentZone, setZone]);

  useEffect(() => {
    if (!currentId || !authed) {
      setPage(null);
      return;
    }
    if (page?.id === currentId) return;
    let alive = true;
    api.getPage(currentId).then((p) => alive && setPage(p)).catch((e) => alive && showError(e.message));
    return () => {
      alive = false;
    };
  }, [currentId, authed, showError]);

  // ── 페이지 트리 조작 ──
  const toggle = (id: string, force?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const want = force ?? !next.has(id);
      if (want) next.add(id);
      else next.delete(id);
      try {
        localStorage.setItem('pf-expanded', JSON.stringify([...next]));
      } catch {
        /* 무시 */
      }
      return next;
    });
  };

  const patchMeta = (id: string, patch: PagePatch) => {
    setPages((ps) => ps && ps.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } as PageMeta : p)));
  };

  // 버튼을 빠르게 두 번 눌러도 페이지가 하나만 생기게
  const creating = useRef(false);
  const create = async (parentId: string | null, kind: 'page' | 'database' = 'page', scope: Scope = {}) => {
    if (creating.current) return;
    creating.current = true;
    try {
      (document.activeElement as HTMLElement | null)?.blur();
      const p = await api.createPage(parentId, kind, scope);
      setPages((ps) => [...(ps || []), p]);
      setFreshId(p.id);
      // 새 페이지는 이미 내용을 알고 있으니 다시 불러오지 않고 바로 보여 준다
      setPage(p);
      open(p.id);
    } catch (e) {
      showError((e as Error).message);
    } finally {
      creating.current = false;
    }
  };

  const move = async (id: string, target: PageMeta, zone: DropZone) => {
    if (!pages) return;
    const dest: PagePatch = dropTarget(pages, target, zone, id);
    // 최상위로 놓으면 놓은 자리의 구역(공용/내 페이지)과 카테고리를 따른다
    if (!dest.parentId) {
      dest.private = target.private;
      dest.spaceId = target.spaceId;
      dest.categoryId = target.categoryId;
    }
    patchMeta(id, dest);
    if (zone === 'inside') toggle(target.id, true);
    try {
      await api.updatePage(id, dest);
      // 구역이 바뀌면 하위 페이지도 함께 바뀌므로 다시 불러온다
      const before = pages.find((p) => p.id === id);
      const after = dest.parentId ? pages.find((p) => p.id === dest.parentId) : (dest as PageMeta);
      if (before?.private !== after?.private || (before?.spaceId ?? null) !== (after?.spaceId ?? null)) reloadPages();
    } catch (e) {
      showError((e as Error).message);
      reloadPages();
    }
  };

  // 다른 자리(전체 공용 / 스페이스 / 내 페이지)의 최상위로 옮기기
  const moveTo = async (id: string, scope: Scope) => {
    const patch: PagePatch = { parentId: null, private: !!scope.private, spaceId: scope.private ? null : scope.spaceId ?? null, categoryId: scope.categoryId ?? null };
    patchMeta(id, patch);
    try {
      await api.updatePage(id, patch);
      await reloadPages();
    } catch (e) {
      showError((e as Error).message);
      reloadPages();
    }
  };

  // 관리자만 편집 잠금 (하위 페이지 권한도 바뀌므로 다시 불러온다)
  const lock = async (id: string, locked: boolean) => {
    patchMeta(id, { locked });
    try {
      await api.updatePage(id, { locked });
      await reloadPages();
    } catch (e) {
      showError((e as Error).message);
      reloadPages();
    }
  };

  const favorite = async (id: string, fav: boolean) => {
    patchMeta(id, { favorite: fav });
    api.updatePage(id, { favorite: fav }).catch((e) => showError(e.message));
  };

  const duplicate = async (id: string) => {
    try {
      const copy = await api.duplicatePage(id);
      await reloadPages();
      setPage(copy);
      open(copy.id);
    } catch (e) {
      showError((e as Error).message);
    }
  };

  const trash = async (id: string) => {
    if (pages && currentId && isInSubtree(pages, id, currentId)) {
      const target = pages.find((p) => p.id === id);
      open(target?.parentId ?? null, true);
    }
    try {
      await api.trashPage(id);
      await reloadPages();
    } catch (e) {
      showError((e as Error).message);
    }
  };

  // ── 단축키 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setDialog((d) => (d === 'search' ? null : 'search'));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const leaveSpace = async (s: Space) => {
    if (!confirm(`'${s.name}' 스페이스에서 나갈까요? 안의 페이지가 더 이상 보이지 않아요.`)) return;
    try {
      await api.leaveSpace(s.id);
      setZone('shared');
      open(null, true);
      await Promise.all([reloadSpaces(), reloadPages(), reloadCategories()]);
    } catch (e) {
      showError((e as Error).message);
    }
  };

  const deleteSpace = async (s: Space) => {
    if (!confirm(`'${s.name}' 스페이스를 지울까요?\n안의 페이지는 내 휴지통으로 옮겨져요. 되돌리면 '내 페이지'로 돌아와요.`)) return;
    try {
      await api.deleteSpace(s.id);
      setZone('shared');
      open(null, true);
      await Promise.all([reloadSpaces(), reloadPages(), reloadCategories()]);
    } catch (e) {
      showError((e as Error).message);
    }
  };

  if (!auth) return <div className="empty-state">불러오는 중…</div>;
  if (!me) {
    const invite = inviteFromPath();
    const done = (u: User) => {
      if (invite) history.replaceState(null, '', '/');
      setAuth({ setup: false, user: u });
    };
    if (auth.setup) return <AuthScreen mode="setup" onDone={done} />;
    if (invite) return <AuthScreen key="register" mode="register" inviteCode={invite} onDone={done} />;
    return <AuthScreen key="login" mode="login" onDone={done} />;
  }
  if (!pages) return <div className="empty-state">불러오는 중…</div>;

  const crumbs = ancestors(pages, currentId);
  // 지금 이 페이지를 같이 보고 있는 다른 사람
  const watching = (currentId ? viewers[currentId] ?? [] : [])
    .filter((id) => id !== me.id)
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => !!u);
  const spaceHome = spaceHomeId ? spaces.find((s) => s.id === spaceHomeId) ?? null : null;
  // 스페이스 안 페이지면 경로 맨 앞에 스페이스 (누르면 스페이스 홈)
  const crumbSpace = crumbs[0]?.spaceId ? spaces.find((s) => s.id === crumbs[0].spaceId) ?? null : null;
  const saveLabel = { saved: '저장됨', saving: '저장 중…', error: '저장 실패' }[saveState];

  return (
    <MeContext.Provider value={me}>
    <div className={`app ${sidebarOpen ? '' : 'sidebar-closed'}`}>
      <Sidebar
        pages={pages}
        categories={categories}
        zone={validZone(zone, spaces)}
        onZone={setZone}
        currentId={spaceHomeId ? '' : currentId}
        expanded={expanded}
        onToggle={toggle}
        onOpen={open}
        onCreate={create}
        onMove={move}
        onFavorite={favorite}
        onTrash={trash}
        onDuplicate={duplicate}
        onSearch={() => setDialog('search')}
        onTrashOpen={() => setDialog('trash')}
        onSettings={() => setDialog('settings')}
        onCollapse={() => setSidebarOpen(false)}
        onHome={() => open(null)}
        me={me}
        onProfile={() => setDialog('profile')}
        onMembers={() => setDialog('members')}
        spaces={spaces}
        onMoveTo={moveTo}
        onLock={lock}
        onNewSpace={() => setSpaceDialog({ space: null })}
        onSpaceHome={openSpace}
        onCategoriesChanged={() => { reloadCategories(); reloadPages(); }}
        onError={showError}
      />
      {sidebarOpen && isNarrow() && <div className="scrim" onClick={() => setSidebarOpen(false)} />}

      <main className="main">
        <div className="topbar">
          {!sidebarOpen && (
            <button className="icon-btn" title="사이드바 열기" onClick={() => setSidebarOpen(true)}>☰</button>
          )}
          <nav className="crumbs">
            {spaceHome ? (
              <span className="crumb crumb-space"><SpaceIcon space={spaceHome} size={18} round /> {spaceHome.name}</span>
            ) : !currentId && (widgetId
              ? <button className="crumb" onClick={() => open(null)}>🏠 홈</button>
              : <span className="crumb">🏠 홈</span>)}
            {crumbSpace && (
              <>
                <button className="crumb crumb-space" onClick={() => openSpace(crumbSpace.id)}>
                  <SpaceIcon space={crumbSpace} size={18} round /> {crumbSpace.name}
                </button>
                <span>/</span>
              </>
            )}
            {crumbs.map((c, i) => (
              <span key={c.id} style={{ display: 'contents' }}>
                {i > 0 && <span>/</span>}
                <button className="crumb" onClick={() => open(c.id)}>
                  {i === 0 && c.private && '🔒 '}
                  {c.icon && `${c.icon} `}{displayTitle(c)}
                </button>
              </span>
            ))}
          </nav>
          {watching.length > 0 && (
            <div className="viewers" title={`${watching.map((u) => u.nickname).join(', ')} 님이 같이 보고 있어요`}>
              {watching.slice(0, 4).map((u) => <Avatar key={u.id} user={u} size={26} ring />)}
              {watching.length > 4 && <span className="viewers-more">+{watching.length - 4}</span>}
            </div>
          )}
          {page && <span className="save-state">{saveLabel}</span>}
          {page && (
            <button
              className="icon-btn"
              title={pages.find((p) => p.id === page.id)?.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
              onClick={() => favorite(page.id, !pages.find((p) => p.id === page.id)?.favorite)}
            >
              {pages.find((p) => p.id === page.id)?.favorite ? '⭐' : '☆'}
            </button>
          )}
          <button className="icon-btn" title="테마 설정" onClick={() => setDialog('settings')}>🎨</button>
        </div>

        <div className="page-scroll">
          {page && page.id === currentId ? (
            <PageView
              key={page.id}
              page={page}
              dark={dark}
              width={settings.width}
              autoFocusTitle={freshId === page.id}
              onMetaChange={patchMeta}
              onSaveState={setSaveState}
              onError={showError}
              dataVersion={dataVersion}
              onPagesChanged={reloadPages}
              meta={pages.find((p) => p.id === page.id)}
              onLock={lock}
            />
          ) : spaceHomeId ? (
            spaceHome ? (
              <SpaceHome
                space={spaceHome}
                me={me}
                users={users}
                pages={pages}
                categories={categories}
                onOpen={open}
                onDialog={(mode) => setSpaceDialog({ space: spaceHome, mode })}
                onDelete={() => deleteSpace(spaceHome)}
                onLeave={() => leaveSpace(spaceHome)}
              />
            ) : (
              <div className="empty-state">스페이스를 찾을 수 없어요.</div>
            )
          ) : !currentId ? (
            widgetId ? (
              <WidgetPage key={widgetId} id={widgetId} pages={pages} dataVersion={dataVersion} openPage={open} onBack={() => open(null)} onError={showError} />
            ) : (
              <Home pages={pages} dataVersion={dataVersion} openPage={open} openWidget={openWidget} onError={showError} />
            )
          ) : null}
        </div>
      </main>

      {dialog === 'search' && <SearchDialog pages={pages} onOpen={open} onClose={() => setDialog(null)} />}
      {dialog === 'trash' && <TrashDialog pages={pages} onChanged={reloadPages} onClose={() => setDialog(null)} />}
      {dialog === 'settings' && (
        <SettingsDialog settings={settings} onChange={changeSettings} onClose={() => setDialog(null)} />
      )}
      {dialog === 'profile' && (
        <ProfileDialog me={me} onChange={(u) => setAuth({ setup: false, user: u })} onClose={() => setDialog(null)} onError={showError} />
      )}
      {dialog === 'members' && <MembersDialog me={me} onClose={() => setDialog(null)} onError={showError} />}
      {spaceDialog && (
        <SpaceDialog
          space={spaceDialog.space}
          mode={spaceDialog.mode}
          me={me}
          users={users}
          onSaved={(s) => {
            reloadSpaces();
            reloadPages();
            // 새로 만든 스페이스는 바로 그 스페이스 홈으로
            if (!spaceDialog.space && s) openSpace(s.id);
          }}
          onClose={() => setSpaceDialog(null)}
          onError={showError}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
    </MeContext.Provider>
  );
}
