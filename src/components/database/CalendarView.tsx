import { useMemo, useState, type DragEvent } from 'react';
import type { Row } from '../../api';
import { byPosition, defaultBoardProp, defaultDateProp, findOption, isDateKey, rowTitle, toKey, todayKey } from '../../database';
import type { DbOps } from './DatabaseView';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function CalendarView({ ops }: { ops: DbOps }) {
  const { schema, rows } = ops;
  const dateProp = defaultDateProp(schema);
  const colorProp = defaultBoardProp(schema);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);

  const dates = schema.properties.filter((p) => p.type === 'date');

  // 일요일부터 시작하는 6주(또는 필요한 만큼) 칸
  const weeks = useMemo(() => {
    const start = new Date(month);
    start.setDate(1 - start.getDay());
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const days: Date[] = [];
    const d = new Date(start);
    while (d <= last || d.getDay() !== 0) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    const out: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    if (!dateProp) return map;
    for (const r of [...rows].sort(byPosition)) {
      const v = r.props[dateProp.id];
      if (!isDateKey(v)) continue;
      if (!map.has(v)) map.set(v, []);
      map.get(v)!.push(r);
    }
    return map;
  }, [rows, dateProp]);

  if (!dateProp) {
    return (
      <div className="db-empty big">
        <p>캘린더로 보려면 <b>날짜</b> 속성이 하나 있어야 해요.</p>
        <button className="btn" onClick={() => ops.addProperty('date', '날짜')}>📅 날짜 속성 만들기</button>
      </div>
    );
  }

  const undated = rows.filter((r) => !isDateKey(r.props[dateProp.id])).sort(byPosition);
  const today = todayKey();
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  const dropOn = (key: string | null) => {
    if (dragId) ops.updateRow(dragId, { props: { [dateProp.id]: key } });
    setDragId(null);
    setOverDay(null);
  };

  const dragProps = (key: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      if (overDay !== (key ?? 'none')) setOverDay(key ?? 'none');
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      dropOn(key);
    },
  });

  const chip = (r: Row) => {
    const opt = colorProp ? findOption(colorProp, r.props[colorProp.id]) : undefined;
    return (
      <button
        key={r.id}
        className={`cal-item tag-${opt?.color ?? 'none'} ${dragId === r.id ? 'dragging' : ''}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', r.id);
          setDragId(r.id);
        }}
        onDragEnd={() => { setDragId(null); setOverDay(null); }}
        onClick={() => ops.openRow(r.id)}
        title={rowTitle(r)}
      >
        {r.icon && `${r.icon} `}{rowTitle(r)}
      </button>
    );
  };

  return (
    <div className="cal-wrap">
      <div className="cal-head">
        <div className="cal-month">{month.getFullYear()}년 {month.getMonth() + 1}월</div>
        <div className="cal-nav">
          <button className="icon-btn" title="이전 달" onClick={() => shift(-1)}>‹</button>
          <button className="btn ghost" onClick={() => {
            const d = new Date();
            setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
          }}>오늘</button>
          <button className="icon-btn" title="다음 달" onClick={() => shift(1)}>›</button>
        </div>
        {dates.length > 1 && (
          <div className="view-setting">
            날짜 기준
            <select
              className="field small inline"
              value={dateProp.id}
              onChange={(e) => ops.saveSchema({ ...schema, calendar: { dateProp: e.target.value } })}
            >
              {dates.map((p) => <option key={p.id} value={p.id}>{p.name || '이름 없음'}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`cal-weekday ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</div>
        ))}
        {weeks.flat().map((d) => {
          const key = toKey(d);
          const items = byDay.get(key) ?? [];
          const outside = d.getMonth() !== month.getMonth();
          return (
            <div
              key={key}
              className={['cal-day', outside && 'outside', key === today && 'today', overDay === key && 'drag-over'].filter(Boolean).join(' ')}
              {...dragProps(key)}
            >
              <div className="cal-day-head">
                <span className={`cal-num ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}`}>{d.getDate()}</span>
                <button
                  className="icon-btn cal-add"
                  title={`${d.getMonth() + 1}월 ${d.getDate()}일에 새 항목`}
                  onClick={() => ops.addRow({ props: { [dateProp.id]: key } }, true)}
                >
                  ＋
                </button>
              </div>
              <div className="cal-items">{items.map(chip)}</div>
            </div>
          );
        })}
      </div>

      <div className={`cal-undated ${overDay === 'none' ? 'drag-over' : ''}`} {...dragProps(null)}>
        <div className="side-label">날짜 없는 항목 {undated.length > 0 && <span className="count">{undated.length}</span>}</div>
        {undated.length === 0 ? (
          <div className="cal-hint">항목을 여기로 끌어 오면 날짜가 지워져요. 날짜 없는 항목은 달력 칸으로 끌어서 날짜를 정할 수 있어요.</div>
        ) : (
          <div className="cal-items row">{undated.map(chip)}</div>
        )}
      </div>
    </div>
  );
}
