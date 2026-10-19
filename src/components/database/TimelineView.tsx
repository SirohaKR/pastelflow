import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Property, Row } from '../../api';
import {
  addDays, byPosition, diffDays, findOption, formatDate, isDateKey, parseKey, rowTitle, timelineProps, todayKey,
} from '../../database';
import type { DbOps } from './DatabaseView';

type Zoom = 'week' | 'month';

// 확대 단계별 하루 칸 너비, 오늘 앞뒤로 그릴 날 수
const ZOOM: Record<Zoom, { dayW: number; before: number; days: number; label: string }> = {
  week: { dayW: 112, before: 21, days: 84, label: '주' },
  month: { dayW: 34, before: 60, days: 300, label: '월' },
};
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

type Drag = {
  id: string;
  mode: 'move' | 'start' | 'end';
  x: number;
  start: string;
  end: string;
  delta: number;
};

function loadZoom(): Zoom {
  try {
    return localStorage.getItem('pf-tl-zoom') === 'month' ? 'month' : 'week';
  } catch {
    return 'week';
  }
}

export function TimelineView({ ops }: { ops: DbOps }) {
  const { schema, rows } = ops;
  const { start: startProp, end: endProp, group: groupProp } = timelineProps(schema);
  const [zoom, setZoomState] = useState<Zoom>(loadZoom);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [visibleMonth, setVisibleMonth] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const today = todayKey();
  const { dayW, before, days } = ZOOM[zoom];
  // 왼쪽 항목 이름 칸 너비 (휴대폰에서는 좁게)
  const LABEL_W = window.matchMedia('(max-width: 760px)').matches ? 150 : 260;
  const rangeStart = useMemo(() => addDays(today, -before), [today, before]);
  const dayKeys = useMemo(() => Array.from({ length: days }, (_, i) => addDays(rangeStart, i)), [rangeStart, days]);

  const setZoom = (z: Zoom) => {
    setZoomState(z);
    try {
      localStorage.setItem('pf-tl-zoom', z);
    } catch {
      /* 무시 */
    }
  };

  const scrollToDay = (key: string, smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const left = diffDays(rangeStart, key) * dayW - (el.clientWidth - LABEL_W) / 3;
    el.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
  };

  // 처음 열거나 확대 단계를 바꾸면 오늘 근처로
  useLayoutEffect(() => {
    scrollToDay(today);
    updateMonthLabel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const updateMonthLabel = () => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.min(days - 1, Math.max(0, Math.floor((el.scrollLeft + dayW / 2) / dayW)));
    const d = parseKey(dayKeys[idx]);
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    setVisibleMonth((cur) => (cur === label ? cur : label));
  };

  // 그룹: 선택 속성의 태그마다 한 묶음 (+ 값 없는 항목)
  const groups = useMemo(() => {
    const sorted = [...rows].sort(byPosition);
    if (!groupProp) return [{ key: 'all', label: '', color: 'none', option: null as string | null, rows: sorted }];
    const out = (groupProp.options ?? []).map((o) => ({
      key: o.id, label: o.name || '이름 없음', color: o.color as string, option: o.id as string | null,
      rows: sorted.filter((r) => r.props[groupProp.id] === o.id),
    }));
    const rest = sorted.filter((r) => !findOption(groupProp, r.props[groupProp.id]));
    out.push({ key: 'none', label: `${groupProp.name || '이름 없음'} 없음`, color: 'none', option: null, rows: rest });
    return out;
  }, [rows, groupProp]);

  if (!startProp) {
    return (
      <div className="db-empty big">
        <p>타임라인으로 보려면 <b>날짜</b> 속성이 하나 있어야 해요.</p>
        <button className="btn" onClick={() => ops.addProperty('date', '시작일')}>📅 날짜 속성 만들기</button>
      </div>
    );
  }

  const dates = schema.properties.filter((p) => p.type === 'date');
  const selects = schema.properties.filter((p) => p.type === 'select');
  const undatedCount = rows.filter((r) => !isDateKey(r.props[startProp.id])).length;

  const saveTimeline = (patch: Partial<NonNullable<typeof schema.timeline>>) => {
    const cur = { startProp: startProp.id, endProp: endProp?.id ?? null, groupBy: groupProp?.id ?? null };
    ops.saveSchema({ ...schema, timeline: { ...cur, ...patch } });
  };

  // 행의 기간 (끌고 있는 중이면 미리보기 값)
  const spanOf = (r: Row): { start: string; end: string } | null => {
    const s = r.props[startProp.id];
    if (!isDateKey(s)) return null;
    const e = endProp ? r.props[endProp.id] : undefined;
    let start = s;
    let end = isDateKey(e) && diffDays(s, e) >= 0 ? e : s;
    if (drag?.id === r.id) {
      if (drag.mode === 'move') {
        start = addDays(drag.start, drag.delta);
        end = addDays(drag.end, drag.delta);
      } else if (drag.mode === 'start') {
        start = addDays(drag.start, Math.min(drag.delta, diffDays(drag.start, drag.end)));
      } else {
        end = addDays(drag.end, Math.max(drag.delta, -diffDays(drag.start, drag.end)));
      }
    }
    return { start, end };
  };

  const beginDrag = (e: RPointerEvent, r: Row, mode: Drag['mode']) => {
    if (e.button !== 0) return;
    const span = spanOf(r);
    if (!span) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 캡처를 못 해도 끌기는 된다 */
    }
    moved.current = false;
    setDrag({ id: r.id, mode, x: e.clientX, start: span.start, end: span.end, delta: 0 });
  };

  const onDragMove = (e: RPointerEvent) => {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.x) / dayW);
    if (Math.abs(e.clientX - drag.x) > 3) moved.current = true;
    if (delta !== drag.delta) setDrag({ ...drag, delta });
  };

  const endDrag = () => {
    if (!drag) return;
    const row = rows.find((r) => r.id === drag.id);
    const span = row && spanOf(row);
    setDrag(null);
    if (!row || !span) return;
    if (!moved.current) {
      if (drag.mode === 'move') ops.openRow(row.id);
      return;
    }
    if (drag.delta === 0) return;
    const props: Record<string, string> = { [startProp.id]: span.start };
    if (endProp) props[endProp.id] = span.end;
    ops.updateRow(row.id, { props });
  };

  // 날짜 없는 항목은 트랙을 누른 날로 정한다
  const placeAt = (e: React.MouseEvent<HTMLDivElement>, r: Row) => {
    if (isDateKey(r.props[startProp.id])) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = Math.floor((e.clientX - rect.left) / dayW);
    const key = dayKeys[Math.max(0, Math.min(days - 1, idx))];
    ops.updateRow(r.id, { props: { [startProp.id]: key, ...(endProp ? { [endProp.id]: key } : {}) } });
  };

  const bar = (r: Row, color: string) => {
    const span = spanOf(r);
    if (!span) return <span className="tl-placeholder">눌러서 날짜 정하기</span>;
    const from = diffDays(rangeStart, span.start);
    const to = diffDays(rangeStart, span.end);
    if (to < 0 || from >= days) {
      const left = to < 0;
      return (
        <button
          className={`tl-offscreen ${left ? 'left' : 'right'}`}
          title={`${formatDate(span.start)}로 이동`}
          onClick={(e) => { e.stopPropagation(); scrollToDay(span.start, true); }}
        >
          {left ? '←' : '→'}
        </button>
      );
    }
    const clipL = from < 0;
    const clipR = to >= days;
    const left = Math.max(0, from) * dayW + 3;
    const width = (Math.min(days - 1, to) - Math.max(0, from) + 1) * dayW - 6;
    const tag = groupProp ? findOption(groupProp, r.props[groupProp.id]) : undefined;
    const length = diffDays(span.start, span.end) + 1;
    return (
      <div
        className={`tl-bar tag-${tag?.color ?? color} ${drag?.id === r.id ? 'dragging' : ''} ${clipL ? 'clip-l' : ''} ${clipR ? 'clip-r' : ''}`}
        style={{ left, width }}
        title={`${rowTitle(r)} · ${formatDate(span.start)}${length > 1 ? ` ~ ${formatDate(span.end)} (${length}일)` : ''}`}
        onPointerDown={(e) => beginDrag(e, r, 'move')}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={() => setDrag(null)}
      >
        {endProp && !clipL && (
          <span className="tl-handle l" onPointerDown={(e) => beginDrag(e, r, 'start')} onPointerMove={onDragMove} onPointerUp={endDrag} />
        )}
        <span className="tl-bar-text">
          {r.icon && `${r.icon} `}{rowTitle(r)}
          {tag && width > 220 && <span className={`tag tag-${tag.color}`}>{tag.name}</span>}
        </span>
        {endProp && !clipR && (
          <span className="tl-handle r" onPointerDown={(e) => beginDrag(e, r, 'end')} onPointerMove={onDragMove} onPointerUp={endDrag} />
        )}
      </div>
    );
  };

  const trackWidth = days * dayW;
  const toggleGroup = (key: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const propSelect = (label: string, value: string | null, list: Property[], onChange: (id: string | null) => void, allowNone: boolean) => (
    <label className="view-setting">
      {label}
      <select className="field small inline" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        {allowNone && <option value="">없음</option>}
        {list.map((p) => <option key={p.id} value={p.id}>{p.name || '이름 없음'}</option>)}
      </select>
    </label>
  );

  return (
    <div className="tl" style={{ ['--tl-label' as string]: `${LABEL_W}px` }}>
      <div className="tl-head">
        <div className="cal-month">{visibleMonth}</div>
        <div className="cal-nav">
          <button className="icon-btn" title="이전" onClick={() => scrollRef.current?.scrollBy({ left: -dayW * (zoom === 'week' ? 7 : 30), behavior: 'smooth' })}>‹</button>
          <button className="btn ghost" onClick={() => scrollToDay(today, true)}>오늘</button>
          <button className="icon-btn" title="다음" onClick={() => scrollRef.current?.scrollBy({ left: dayW * (zoom === 'week' ? 7 : 30), behavior: 'smooth' })}>›</button>
        </div>
        <div className="segmented small">
          {(Object.keys(ZOOM) as Zoom[]).map((z) => (
            <button key={z} className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>{ZOOM[z].label}</button>
          ))}
        </div>
        <div className="tl-settings">
          {propSelect('시작일', startProp.id, dates, (id) => id && saveTimeline({ startProp: id }), false)}
          {propSelect('종료일', endProp?.id ?? null, dates.filter((p) => p.id !== startProp.id), (id) => saveTimeline({ endProp: id }), true)}
          {propSelect('묶기', groupProp?.id ?? null, selects, (id) => saveTimeline({ groupBy: id }), true)}
          {undatedCount > 0 && <span className="tl-undated">날짜 없음 {undatedCount}</span>}
        </div>
      </div>

      <div className="tl-scroll" ref={scrollRef} onScroll={updateMonthLabel}>
        <div className="tl-inner" style={{ width: LABEL_W + trackWidth }}>
          {/* 날짜 머리줄 */}
          <div className="tl-header">
            <div className="tl-corner">항목</div>
            <div className="tl-days" style={{ width: trackWidth }}>
              {dayKeys.map((k, i) => {
                const d = parseKey(k);
                const wd = d.getDay();
                const first = d.getDate() === 1 || i === 0;
                return (
                  <div
                    key={k}
                    className={['tl-day', k === today && 'today', wd === 0 && 'sun', wd === 6 && 'sat'].filter(Boolean).join(' ')}
                    style={{ width: dayW }}
                  >
                    {first && <span className="tl-month-mark">{d.getMonth() + 1}월</span>}
                    {zoom === 'week' ? <>{WEEKDAYS[wd]} <b>{d.getDate()}</b></> : <b>{d.getDate()}</b>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="tl-body">
            {/* 세로 칸과 오늘 선 */}
            <div className="tl-grid" style={{ left: LABEL_W, width: trackWidth }}>
              {dayKeys.map((k) => {
                const wd = parseKey(k).getDay();
                return <div key={k} className={`tl-col ${wd === 0 || wd === 6 ? 'weekend' : ''}`} style={{ width: dayW }} />;
              })}
              <div className="tl-today-line" style={{ left: diffDays(rangeStart, today) * dayW + dayW / 2 }} />
            </div>

            {groups.map((g) => (
              <div key={g.key} className="tl-group">
                {groupProp && (
                  <div className="tl-row tl-group-row">
                    <div className="tl-label">
                      <button className={`tree-toggle ${collapsed.has(g.key) ? '' : 'open'}`} onClick={() => toggleGroup(g.key)}>▶</button>
                      <span className={`tag tag-${g.color}`}>{g.label}</span>
                      <span className="count">{g.rows.length}</span>
                    </div>
                  </div>
                )}
                {!collapsed.has(g.key) && (
                  <>
                    {g.rows.map((r) => (
                      <div key={r.id} className="tl-row">
                        <button className="tl-label tl-item" onClick={() => ops.openRow(r.id)} title={rowTitle(r)}>
                          <span className="tl-item-icon">{r.icon || '▬'}</span>
                          <span className="tree-title">{rowTitle(r)}</span>
                        </button>
                        <div
                          className={`tl-track ${isDateKey(r.props[startProp.id]) ? '' : 'undated'}`}
                          style={{ width: trackWidth }}
                          onClick={(e) => placeAt(e, r)}
                        >
                          {bar(r, g.color)}
                        </div>
                      </div>
                    ))}
                    <div className="tl-row">
                      <button
                        className="tl-label tl-add"
                        onClick={() => ops.addRow({
                          props: {
                            [startProp.id]: today,
                            ...(endProp ? { [endProp.id]: today } : {}),
                            ...(groupProp && g.option ? { [groupProp.id]: g.option } : {}),
                          },
                        }, true)}
                      >
                        ＋ 새로 만들기
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {!endProp && (
        <p className="cal-hint">종료일 속성을 고르면 막대 끝을 끌어서 기간을 늘리고 줄일 수 있어요.</p>
      )}
    </div>
  );
}

