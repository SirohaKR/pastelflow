import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { api, type AgendaDb, type PageMeta, type TagColor, type Widget, type WidgetPatch, type WidgetSize } from '../../api';
import { Modal } from '../Popover';
import { WIDGETS, widgetMeta, type HomeCtx } from './meta';
import { WidgetBody } from './widgets';
import './home.css';
import './details.css';

type Props = {
  pages: PageMeta[];
  dataVersion: number;
  openPage: (id: string) => void;
  openWidget: (id: string) => void;
  onError: (msg: string) => void;
};

const SIZES: { key: WidgetSize; label: string }[] = [
  { key: 's', label: '작게' },
  { key: 'm', label: '넓게' },
  { key: 'l', label: '한 줄' },
];
const COLORS: ('' | TagColor)[] = ['', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const SAVE_DELAY = 600;
const ROW = 8;
const GAP = 16;

// 위젯 높이만큼 격자 줄을 차지하게 해서 빈틈 없이 쌓는다 (벽돌식 배치)
function useMasonry() {
  const observer = useRef<ResizeObserver | null>(null);
  if (!observer.current && typeof ResizeObserver !== 'undefined') {
    observer.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const height = el.getBoundingClientRect().height;
        el.style.gridRowEnd = `span ${Math.max(1, Math.ceil((height + GAP) / (ROW + GAP)))}`;
      }
    });
  }
  useEffect(() => () => observer.current?.disconnect(), []);
  return (el: HTMLElement | null) => {
    if (el) observer.current?.observe(el);
  };
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '늦은 밤이에요, 푹 쉬어요 🌙';
  if (h < 11) return '좋은 아침이에요 ☀️';
  if (h < 14) return '점심 맛있게 먹었나요? 🍙';
  if (h < 18) return '오후도 힘내요 🌷';
  return '오늘 하루도 수고했어요 🌙';
}

export function Home({ pages, dataVersion, openPage, openWidget, onError }: Props) {
  const [widgets, setWidgets] = useState<Widget[] | null>(null);
  const [agenda, setAgenda] = useState<AgendaDb[]>([]);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const masonry = useMasonry();

  useEffect(() => {
    api.listWidgets().then(setWidgets).catch((e) => onError(e.message));
  }, [onError]);

  const loadAgenda = useCallback(() => {
    api.agenda().then(setAgenda).catch((e) => onError(e.message));
  }, [onError]);
  useEffect(loadAgenda, [loadAgenda, dataVersion]);

  // 위젯 내용은 잠깐 모았다가 저장 (메모처럼 계속 바뀌는 것 대비)
  const pending = useRef(new Map<string, WidgetPatch>());
  const timers = useRef(new Map<string, number>());

  const flush = useCallback((id: string, keepalive = false) => {
    window.clearTimeout(timers.current.get(id));
    const patch = pending.current.get(id);
    if (!patch) return;
    pending.current.delete(id);
    api.updateWidget(id, patch, keepalive).catch((e) => onError(e.message));
  }, [onError]);

  useEffect(() => {
    const flushAll = () => [...pending.current.keys()].forEach((id) => flush(id, true));
    window.addEventListener('beforeunload', flushAll);
    return () => {
      window.removeEventListener('beforeunload', flushAll);
      flushAll();
    };
  }, [flush]);

  const patchWidget = (id: string, patch: WidgetPatch, immediate = false) => {
    setWidgets((ws) => ws && ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
    pending.current.set(id, { ...pending.current.get(id), ...patch });
    window.clearTimeout(timers.current.get(id));
    if (immediate) flush(id);
    else timers.current.set(id, window.setTimeout(() => flush(id), SAVE_DELAY));
  };

  const addWidget = async (type: Widget['type']) => {
    setAdding(false);
    try {
      const w = await api.createWidget(type, widgetMeta(type).size);
      setWidgets((ws) => [...(ws ?? []), w]);
      requestAnimationFrame(() => document.getElementById(`w-${w.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const removeWidget = async (w: Widget) => {
    if (!confirm(`'${widgetMeta(w.type).label}' 위젯을 지울까요? 안에 적은 내용도 함께 사라져요.`)) return;
    setWidgets((ws) => ws && ws.filter((x) => x.id !== w.id));
    pending.current.delete(w.id);
    api.deleteWidget(w.id).catch((e) => onError(e.message));
  };

  // 끌어 놓은 위젯 앞자리로 옮긴다
  const dropOn = (target: Widget) => {
    if (!widgets || !dragId || dragId === target.id) return;
    const list = widgets.filter((w) => w.id !== dragId);
    const idx = list.findIndex((w) => w.id === target.id);
    const prev = list[idx - 1];
    const position = prev ? (prev.position + target.position) / 2 : target.position - 1;
    const moved = widgets.find((w) => w.id === dragId)!;
    const next = [...list.slice(0, idx), { ...moved, position }, ...list.slice(idx)];
    setWidgets(next);
    patchWidget(dragId, { position }, true);
  };

  const ctx = useHomeCtx(pages, agenda, setAgenda, loadAgenda, openPage, onError);

  const now = new Date();

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <div className="home-date">
            {now.getFullYear()}년 {now.getMonth() + 1}월 {now.getDate()}일 {['일', '월', '화', '수', '목', '금', '토'][now.getDay()]}요일
          </div>
          <h1 className="home-title">{greeting()}</h1>
        </div>
        <div className="home-actions">
          {editing && <button className="btn ghost" onClick={() => setAdding(true)}>＋ 위젯 추가</button>}
          <button className={`btn ${editing ? '' : 'ghost'}`} onClick={() => setEditing((e) => !e)}>
            {editing ? '✓ 다 꾸몄어요' : '✏️ 홈 꾸미기'}
          </button>
        </div>
      </div>

      {!widgets ? (
        <div className="db-loading">위젯을 불러오는 중…</div>
      ) : widgets.length === 0 ? (
        <div className="db-empty big">
          <p>홈이 비어 있어요. 위젯을 놓아 나만의 플래너를 만들어 보세요.</p>
          <button className="btn" onClick={() => setAdding(true)}>＋ 위젯 추가</button>
        </div>
      ) : (
        <div className={`widget-grid ${editing ? 'editing' : ''}`}>
          {widgets.map((w) => {
            const meta = widgetMeta(w.type);
            return (
              <section
                key={w.id}
                ref={masonry}
                id={`w-${w.id}`}
                className={['widget', `size-${w.size}`, w.color && `tint-${w.color}`, dragId === w.id && 'dragging', overId === w.id && 'drag-over'].filter(Boolean).join(' ')}
                draggable={editing}
                onDragStart={(e: DragEvent) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', w.id);
                  setDragId(w.id);
                }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                onDragOver={(e) => {
                  if (!dragId || dragId === w.id) return;
                  e.preventDefault();
                  if (overId !== w.id) setOverId(w.id);
                }}
                onDragLeave={() => overId === w.id && setOverId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(w);
                  setDragId(null);
                  setOverId(null);
                }}
              >
                <header className="widget-head">
                  {editing && <span className="widget-grip" title="끌어서 옮기기">⠿</span>}
                  <span className="widget-icon">{meta.icon}</span>
                  <button className="widget-title" onClick={() => openWidget(w.id)} title="전체 보기">{meta.label}</button>
                  <button className="icon-btn widget-open" onClick={() => openWidget(w.id)} title="전체 보기">↗</button>
                </header>
                {editing && (
                  <div className="widget-edit">
                    <div className="segmented small">
                      {SIZES.map((s) => (
                        <button key={s.key} className={w.size === s.key ? 'on' : ''} onClick={() => patchWidget(w.id, { size: s.key }, true)}>{s.label}</button>
                      ))}
                    </div>
                    <div className="widget-colors">
                      {COLORS.map((c) => (
                        <button
                          key={c || 'none'}
                          className={`color-dot ${c ? `tag-${c}` : 'none'} ${w.color === c ? 'on' : ''}`}
                          title={c ? '배경색' : '색 없음'}
                          onClick={() => patchWidget(w.id, { color: c }, true)}
                        />
                      ))}
                    </div>
                    <button className="icon-btn" title="위젯 지우기" onClick={() => removeWidget(w)}>🗑️</button>
                  </div>
                )}
                <div className="widget-body">
                  <WidgetBody widget={w} ctx={ctx} setConfig={(config) => patchWidget(w.id, { config })} />
                </div>
              </section>
            );
          })}
        </div>
      )}

      {adding && (
        <Modal onClose={() => setAdding(false)}>
          <div className="modal-head">
            <span>＋ 위젯 추가</span>
            <button className="icon-btn" onClick={() => setAdding(false)} aria-label="닫기">✕</button>
          </div>
          <div className="modal-body widget-gallery">
            {WIDGETS.map((m) => (
              <button key={m.type} className="gallery-item" onClick={() => addWidget(m.type)}>
                <span className="gallery-icon">{m.icon}</span>
                <span>
                  <b>{m.label}</b>
                  <small>{m.desc}</small>
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}


export function useHomeCtx(
  pages: PageMeta[],
  agenda: AgendaDb[],
  setAgenda: React.Dispatch<React.SetStateAction<AgendaDb[]>>,
  loadAgenda: () => void,
  openPage: (id: string) => void,
  onError: (msg: string) => void,
): HomeCtx {
  return {
    pages,
    agenda,
    openPage,
    onError,
    updateRow: (dbId, rowId, props) => {
      setAgenda((as) => as.map((d) => (d.id !== dbId ? d : {
        ...d,
        rows: d.rows.map((r) => {
          if (r.id !== rowId) return r;
          const next = { ...r.props };
          for (const [k, v] of Object.entries(props)) {
            if (v === null || v === '') delete next[k];
            else next[k] = v;
          }
          return { ...r, props: next };
        }),
      })));
      api.updatePage(rowId, { props }).catch((e) => {
        onError(e.message);
        loadAgenda();
      });
    },
    addRow: async (dbId, title, props) => {
      try {
        await api.createRow(dbId, { title, props });
        loadAgenda();
      } catch (e) {
        onError((e as Error).message);
      }
    },
  };

}
