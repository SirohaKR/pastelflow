import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Page, type PageMeta, type PagePatch } from './api';
import { applyTheme, cachedSettings, normalizeSettings, type Settings } from './theme';
import { ancestors, displayTitle, dropTarget, isInSubtree, type DropZone } from './tree';
import { Sidebar } from './components/Sidebar';
import { PageView, type SaveState } from './components/PageView';
import { Login, SearchDialog, SettingsDialog, TrashDialog } from './components/Dialogs';
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

function loadExpanded() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem('pf-expanded') || '[]'));
  } catch {
    return new Set<string>();
  }
}

export default function App() {
  const [auth, setAuth] = useState<{ required: boolean; authed: boolean } | null>(null);
  const [settings, setSettings] = useState<Settings>(cachedSettings);
  const [dark, setDark] = useState(() => applyTheme(cachedSettings()));
  const [pages, setPages] = useState<PageMeta[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(idFromPath);
  // 홈 위젯 상세 페이지 (/w/위젯id)
  const [widgetId, setWidgetId] = useState<string | null>(widgetFromPath);
  const [page, setPage] = useState<Page | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(loadExpanded);
  const [sidebarOpen, setSidebarOpen] = useState(() => !isNarrow());
  const [dialog, setDialog] = useState<'search' | 'trash' | 'settings' | null>(null);
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
    const onUnauthorized = () => setAuth((a) => (a ? { ...a, authed: false } : a));
    window.addEventListener('pf:unauthorized', onUnauthorized);
    return () => window.removeEventListener('pf:unauthorized', onUnauthorized);
  }, []);

  const authed = auth?.authed;

  const reloadPages = useCallback(() => api.listPages().then((ps) => {
    setPages(ps);
    setDataVersion((v) => v + 1);
  }), []);

  useEffect(() => {
    if (!authed) return;
    reloadPages().catch((e) => showError(e.message));
    api.getSettings().then((raw) => {
      const s = normalizeSettings(raw);
      setSettings(s);
      setDark(applyTheme(s));
    }).catch(() => {});
  }, [authed, reloadPages, showError]);

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
    const url = id ? `/p/${id}` : '/';
    if (location.pathname !== url) history[replace ? 'replaceState' : 'pushState'](null, '', url);
    if (isNarrow()) setSidebarOpen(false);
  }, []);

  const openWidget = useCallback((id: string) => {
    setCurrentId(null);
    setWidgetId(id);
    const url = `/w/${id}`;
    if (location.pathname !== url) history.pushState(null, '', url);
    if (isNarrow()) setSidebarOpen(false);
  }, []);

  useEffect(() => {
    const onPop = () => {
      setCurrentId(idFromPath());
      setWidgetId(widgetFromPath());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // 보던 페이지가 사라지면 홈으로
  useEffect(() => {
    if (!pages || !currentId) return;
    if (!pages.some((p) => p.id === currentId && p.deletedAt == null)) open(null, true);
  }, [pages, currentId, open]);

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
  const create = async (parentId: string | null, kind: 'page' | 'database' = 'page') => {
    if (creating.current) return;
    creating.current = true;
    try {
      (document.activeElement as HTMLElement | null)?.blur();
      const p = await api.createPage(parentId, kind);
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
    const dest = dropTarget(pages, target, zone, id);
    patchMeta(id, dest);
    if (zone === 'inside') toggle(target.id, true);
    try {
      await api.updatePage(id, dest);
    } catch (e) {
      showError((e as Error).message);
      reloadPages();
    }
  };

  const favorite = async (id: string, fav: boolean) => {
    patchMeta(id, { favorite: fav });
    api.updatePage(id, { favorite: fav }).catch((e) => showError(e.message));
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

  if (!auth) return <div className="empty-state">불러오는 중…</div>;
  if (!auth.authed) return <Login onDone={checkAuth} />;
  if (!pages) return <div className="empty-state">불러오는 중…</div>;

  const crumbs = ancestors(pages, currentId);
  const saveLabel = { saved: '저장됨', saving: '저장 중…', error: '저장 실패' }[saveState];

  return (
    <div className={`app ${sidebarOpen ? '' : 'sidebar-closed'}`}>
      <Sidebar
        pages={pages}
        currentId={currentId}
        expanded={expanded}
        onToggle={toggle}
        onOpen={open}
        onCreate={create}
        onMove={move}
        onFavorite={favorite}
        onTrash={trash}
        onSearch={() => setDialog('search')}
        onTrashOpen={() => setDialog('trash')}
        onSettings={() => setDialog('settings')}
        onCollapse={() => setSidebarOpen(false)}
        onHome={() => open(null)}
      />
      {sidebarOpen && isNarrow() && <div className="scrim" onClick={() => setSidebarOpen(false)} />}

      <main className="main">
        <div className="topbar">
          {!sidebarOpen && (
            <button className="icon-btn" title="사이드바 열기" onClick={() => setSidebarOpen(true)}>☰</button>
          )}
          <nav className="crumbs">
            {!currentId && (widgetId
              ? <button className="crumb" onClick={() => open(null)}>🏠 홈</button>
              : <span className="crumb">🏠 홈</span>)}
            {crumbs.map((c, i) => (
              <span key={c.id} style={{ display: 'contents' }}>
                {i > 0 && <span>/</span>}
                <button className="crumb" onClick={() => open(c.id)}>
                  {c.icon && `${c.icon} `}{displayTitle(c)}
                </button>
              </span>
            ))}
          </nav>
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
            />
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
        <SettingsDialog settings={settings} onChange={changeSettings} onClose={() => setDialog(null)} canLogout={auth.required} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
