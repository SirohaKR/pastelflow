import { useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { addDays, diffDays, formatDate, parseKey, toKey, todayKey } from '../../../database';
import { ancestors, displayTitle, dotColor, timeAgo } from '../../../tree';
import { flattenAgenda, newItemProps, onDay, type AgendaItem } from '../agenda';
import { uid, type HomeCtx, type WidgetProps } from '../meta';
import {
  ddayLabel, ddayTarget, habitColor, longestStreak, sortDdays, streak, tagAt, TAGS, trimLog,
  type DdayConfig, type Goal, type GoalsConfig, type Habit, type HabitsConfig, type MemoConfig,
} from '../model';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (k: string) => `${formatDate(k)} (${WEEKDAYS[parseKey(k).getDay()]})`;

function useItems(ctx: HomeCtx) {
  return useMemo(() => flattenAgenda(ctx.agenda), [ctx.agenda]);
}

// 체크박스 + 제목 + 데이터베이스 이름 한 줄
function ItemRow({ i, ctx, showDate }: { i: AgendaItem; ctx: HomeCtx; showDate?: boolean }) {
  return (
    <li className={`dt-item ${i.done ? 'done' : ''}`}>
      <input
        type="checkbox"
        checked={i.done}
        disabled={!i.doneProps}
        title={i.doneProps ? '완료 표시' : "상태 속성에 '완료' 태그가 있으면 체크할 수 있어요"}
        onChange={(e) => i.doneProps && ctx.updateRow(i.dbId, i.id, i.doneProps(e.target.checked))}
      />
      <span className={`w-dot tag-${i.color}`} />
      <button className="dt-title" onClick={() => ctx.openPage(i.dbId)}>{i.icon && `${i.icon} `}{i.title}</button>
      {showDate && i.date && <span className="w-sub">{formatDate(i.date)}{i.end && i.end !== i.date ? ` ~ ${formatDate(i.end)}` : ''}</span>}
      <span className="dt-db">{i.dbIcon} {i.dbTitle}</span>
    </li>
  );
}

function NoDb() {
  return <div className="db-empty big"><p>사이드바에서 <b>🗃️ 새 데이터베이스</b>를 만들고 날짜를 넣으면 일정이 여기 모여요.</p></div>;
}

// ── 오늘 한눈에 → 이번 주 ─────────────────────────────────
export function TodayDetail({ ctx }: WidgetProps<Record<string, never>>) {
  const items = useItems(ctx);
  const today = todayKey();
  const [offset, setOffset] = useState(0);
  const start = addDays(today, -((parseKey(today).getDay() + 6) % 7) + offset * 7); // 월요일부터
  const week = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const overdue = items.filter((i) => i.date && (i.end ?? i.date) < today && !i.done && i.doneProps);
  const weekItems = items.filter((i) => week.some((k) => onDay(i, k)));
  const done = weekItems.filter((i) => i.done).length;

  if (!ctx.agenda.length) return <NoDb />;
  return (
    <div className="dt">
      <div className="bd-stats">
        <div className="bd-stat"><span>이번 주 일정</span><b>{weekItems.length}</b></div>
        <div className="bd-stat"><span>완료</span><b>{done}</b><small>{weekItems.length ? Math.round((done / weekItems.length) * 100) : 0}%</small></div>
        <div className="bd-stat"><span>오늘</span><b>{items.filter((i) => onDay(i, today)).length}</b></div>
        <div className="bd-stat"><span>밀린 일</span><b className={overdue.length ? 'neg' : ''}>{overdue.length}</b></div>
      </div>
      <div className="bd-bar">
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => setOffset(offset - 1)}>‹</button>
          <b className="bd-month">{formatDate(week[0])} ~ {formatDate(week[6])}</b>
          <button className="icon-btn" onClick={() => setOffset(offset + 1)}>›</button>
          {offset !== 0 && <button className="btn ghost small" onClick={() => setOffset(0)}>이번 주</button>}
        </div>
      </div>
      <div className="dt-week">
        {week.map((k) => {
          const list = items.filter((i) => onDay(i, k));
          return (
            <section key={k} className={`dt-day ${k === today ? 'today' : ''}`}>
              <header><b>{WEEKDAYS[parseKey(k).getDay()]}</b> {parseKey(k).getDate()}</header>
              <ul>
                {list.length === 0 && <li className="w-sub">-</li>}
                {list.map((i) => (
                  <li key={i.id} className={i.done ? 'done' : ''}>
                    <button className={`dt-chip tag-${i.color}`} onClick={() => ctx.openPage(i.dbId)} title={i.dbTitle}>{i.icon && `${i.icon} `}{i.title}</button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {overdue.length > 0 && (
        <section className="bd-card">
          <header className="bd-card-head"><h3>⚠ 밀린 일 <span className="count">{overdue.length}</span></h3></header>
          <ul className="dt-list">{overdue.map((i) => <ItemRow key={i.id} i={i} ctx={ctx} showDate />)}</ul>
        </section>
      )}
    </div>
  );
}

// ── 할 일 ─────────────────────────────────────────────
export function TodoDetail({ ctx, config, setConfig }: WidgetProps<{ dbId?: string }>) {
  const items = useItems(ctx);
  const today = todayKey();
  const weekEnd = addDays(today, 7);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [showDone, setShowDone] = useState(false);
  const target = ctx.agenda.find((d) => d.id === config.dbId) ?? ctx.agenda[0];

  if (!ctx.agenda.length) return <NoDb />;

  const open = items.filter((i) => !i.done);
  const sections: { title: string; list: AgendaItem[]; date?: boolean }[] = [
    { title: '⚠ 밀린 일', list: open.filter((i) => i.date && (i.end ?? i.date) < today && i.doneProps), date: true },
    { title: '☀️ 오늘', list: items.filter((i) => onDay(i, today) && (!i.done || showDone)) },
    { title: '🌙 내일', list: open.filter((i) => i.date === addDays(today, 1)) },
    { title: '📅 일주일 안', list: open.filter((i) => i.date && i.date > addDays(today, 1) && i.date <= weekEnd), date: true },
    { title: '🗓️ 그 뒤', list: open.filter((i) => i.date && i.date > weekEnd).sort((a, b) => a.date!.localeCompare(b.date!)).slice(0, 30), date: true },
    { title: '📥 날짜 없음', list: open.filter((i) => !i.date && i.doneProps).slice(0, 30) },
  ];
  if (showDone) sections.push({ title: '✅ 완료한 일', list: items.filter((i) => i.done && i.date && i.date >= addDays(today, -7)), date: true });

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !target) return;
    await ctx.addRow(target.id, title.trim(), date ? newItemProps(target, date) : {});
    setTitle('');
  };

  return (
    <div className="dt">
      <form className="bd-input" onSubmit={add}>
        <input className="field small grow" placeholder="할 일을 적고 Enter" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="field small" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className="field small" value={target?.id} onChange={(e) => setConfig({ ...config, dbId: e.target.value })} title="넣을 데이터베이스">
          {ctx.agenda.map((d) => <option key={d.id} value={d.id}>{d.icon} {d.title || '제목 없음'}</option>)}
        </select>
        <button className="btn">＋ 추가</button>
        <label className="dt-toggle"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> 완료한 일도 보기</label>
      </form>
      <div className="dt-sections">
        {sections.filter((s) => s.list.length).map((s) => (
          <section key={s.title} className="bd-card">
            <header className="bd-card-head"><h3>{s.title} <span className="count">{s.list.length}</span></h3></header>
            <ul className="dt-list">{s.list.map((i) => <ItemRow key={i.id} i={i} ctx={ctx} showDate={s.date} />)}</ul>
          </section>
        ))}
        {sections.every((s) => !s.list.length) && <div className="w-empty">할 일이 하나도 없어요. 여유로운 날이에요 🌿</div>}
      </div>
    </div>
  );
}

// ── 큰 캘린더 ─────────────────────────────────────────────
export function CalendarDetail({ ctx, config, setConfig }: WidgetProps<{ dbId?: string }>) {
  const items = useItems(ctx);
  const today = todayKey();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [adding, setAdding] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const target = ctx.agenda.find((d) => d.id === config.dbId) ?? ctx.agenda[0];

  const cells = useMemo(() => {
    const start = new Date(month);
    start.setDate(1 - start.getDay());
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const out: Date[] = [];
    const d = new Date(start);
    while (d <= last || d.getDay() !== 0) {
      out.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [month]);

  if (!ctx.agenda.length) return <NoDb />;

  const add = async (e: FormEvent, key: string) => {
    e.preventDefault();
    if (title.trim() && target) await ctx.addRow(target.id, title.trim(), newItemProps(target, key));
    setTitle('');
    setAdding(null);
  };

  return (
    <div className="dt">
      <div className="bd-bar">
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <b className="bd-month">{month.getFullYear()}년 {month.getMonth() + 1}월</b>
          <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
          <button className="btn ghost small" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>오늘</button>
        </div>
        <label className="view-setting">새 일정 넣을 곳
          <select className="field small inline" value={target?.id} onChange={(e) => setConfig({ ...config, dbId: e.target.value })}>
            {ctx.agenda.map((d) => <option key={d.id} value={d.id}>{d.icon} {d.title || '제목 없음'}</option>)}
          </select>
        </label>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w, i) => <div key={w} className={`cal-weekday ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</div>)}
        {cells.map((d) => {
          const key = toKey(d);
          const list = items.filter((i) => onDay(i, key));
          return (
            <div key={key} className={['cal-day', d.getMonth() !== month.getMonth() && 'outside', key === today && 'today'].filter(Boolean).join(' ')}>
              <div className="cal-day-head">
                <span className={`cal-num ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}`}>{d.getDate()}</span>
                <button className="icon-btn cal-add" title="이 날 일정 추가" onClick={() => { setAdding(key); setTitle(''); }}>＋</button>
              </div>
              <div className="cal-items">
                {list.slice(0, 5).map((i) => (
                  <button key={i.id} className={`cal-item tag-${i.color} ${i.done ? 'done' : ''}`} onClick={() => ctx.openPage(i.dbId)} title={`${i.title} · ${i.dbTitle}`}>
                    {i.icon && `${i.icon} `}{i.title}
                  </button>
                ))}
                {list.length > 5 && <span className="w-sub">+{list.length - 5}개 더</span>}
                {adding === key && (
                  <form onSubmit={(e) => add(e, key)}>
                    <input className="field small" autoFocus placeholder="제목 + Enter" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => !title && setAdding(null)} />
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── D-day ─────────────────────────────────────────────
export function DdayDetail({ config, setConfig }: WidgetProps<DdayConfig>) {
  const items = config.items ?? [];
  const [form, setForm] = useState({ name: '', date: '', yearly: false });
  const today = todayKey();
  const sorted = sortDdays(items);
  const upcoming = sorted.filter((d) => ddayTarget(d) >= today);
  const past = sorted.filter((d) => ddayTarget(d) < today);
  const update = (id: string, patch: Partial<typeof items[number]>) =>
    setConfig({ ...config, items: items.map((d) => (d.id === id ? { ...d, ...patch } : d)) });

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.date) return;
    setConfig({ ...config, items: [...items, { id: uid(), name: form.name.trim(), date: form.date, emoji: '', yearly: form.yearly || undefined }] });
    setForm({ name: '', date: '', yearly: false });
  };

  const card = (d: typeof items[number], i: number) => (
    <article key={d.id} className={`dd-card tag-${tagAt(i)} ${ddayTarget(d) < today ? 'past' : ''}`}>
      <div className="dd-big">{ddayLabel(d)}</div>
      <input className="cell-input strong" value={d.name} onChange={(e) => update(d.id, { name: e.target.value })} />
      <div className="dd-meta">
        <input className="cell-input" type="date" value={d.date} onChange={(e) => e.target.value && update(d.id, { date: e.target.value })} />
        <label className="dt-toggle"><input type="checkbox" checked={!!d.yearly} onChange={(e) => update(d.id, { yearly: e.target.checked || undefined })} /> 매년</label>
      </div>
      {d.yearly && <small className="w-sub">다음: {formatDate(ddayTarget(d))}</small>}
      <input className="cell-input" placeholder="메모" value={d.memo ?? ''} onChange={(e) => update(d.id, { memo: e.target.value || undefined })} />
      <button className="w-x show dd-x" title="지우기" onClick={() => setConfig({ ...config, items: items.filter((x) => x.id !== d.id) })}>✕</button>
    </article>
  );

  return (
    <div className="dt">
      <form className="bd-input" onSubmit={add}>
        <input className="field small grow" placeholder="기다리는 날 (예: 제주 여행)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="field small" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <label className="dt-toggle"><input type="checkbox" checked={form.yearly} onChange={(e) => setForm({ ...form, yearly: e.target.checked })} /> 매년 반복 (생일·기념일)</label>
        <button className="btn">＋ 추가</button>
      </form>
      {items.length === 0 && <div className="w-empty">시험, 생일, 여행처럼 기다리는 날을 넣어 보세요.</div>}
      {upcoming.length > 0 && <><h3 className="dt-h">다가오는 날</h3><div className="dd-grid">{upcoming.map(card)}</div></>}
      {past.length > 0 && <><h3 className="dt-h">지난 날</h3><div className="dd-grid">{past.map((d, i) => card(d, i + upcoming.length))}</div></>}
    </div>
  );
}

// ── 습관 (월 단위) ─────────────────────────────────────────
export function HabitsDetail({ config, setConfig }: WidgetProps<HabitsConfig>) {
  const habits = config.habits ?? [];
  const log = config.log ?? {};
  const today = todayKey();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [name, setName] = useState('');
  const [y, m] = month.split('-').map(Number);
  const days = Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const counted = days.filter((k) => k <= today);

  const toggle = (hid: string, key: string) => {
    if (key > today) return;
    const set = new Set(log[hid] ?? []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    setConfig({ ...config, log: { ...log, [hid]: trimLog(set) } });
  };
  const update = (id: string, patch: Partial<Habit>) => setConfig({ ...config, habits: habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
  const remove = (h: Habit) => {
    if (!confirm(`'${h.name}' 습관과 기록을 지울까요?`)) return;
    const { [h.id]: _gone, ...rest } = log;
    setConfig({ ...config, habits: habits.filter((x) => x.id !== h.id), log: rest });
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setConfig({ ...config, habits: [...habits, { id: uid(), name: name.trim(), color: tagAt(habits.length) }] });
    setName('');
  };
  const shift = (n: number) => setMonth(toKey(new Date(y, m - 1 + n, 1)).slice(0, 7));

  return (
    <div className="dt">
      <div className="bd-bar">
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => shift(-1)}>‹</button>
          <b className="bd-month">{y}년 {m}월</b>
          <button className="icon-btn" onClick={() => shift(1)}>›</button>
        </div>
        <form className="bd-input inline" onSubmit={add}>
          <input className="field small" placeholder="＋ 새 습관" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn small">추가</button>
        </form>
      </div>

      {habits.length === 0 ? <div className="w-empty">물 2L 마시기, 30분 걷기처럼 매일 하고 싶은 일을 넣어 보세요.</div> : (
        <section className="bd-card flush scroll-x">
          <table className="hb-table">
            <thead>
              <tr>
                <th className="hb-name">습관</th>
                {days.map((k) => {
                  const wd = parseKey(k).getDay();
                  return <th key={k} className={`${k === today ? 'today' : ''} ${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}`}><small>{WEEKDAYS[wd]}</small>{Number(k.slice(8))}</th>;
                })}
                <th className="hb-stat">이번 달</th>
                <th className="hb-stat">연속</th>
                <th className="hb-stat">최장</th>
              </tr>
            </thead>
            <tbody>
              {habits.map((h, idx) => {
                const set = new Set(log[h.id] ?? []);
                const doneN = days.filter((k) => set.has(k)).length;
                const color = habitColor(h, idx);
                return (
                  <tr key={h.id}>
                    <td className="hb-name">
                      <div className="hb-name-in">
                        <button className={`color-dot tag-${color}`} title="색 바꾸기" onClick={() => update(h.id, { color: TAGS[(TAGS.indexOf(color) + 1) % 6] })} />
                        <input className="cell-input" value={h.name} onChange={(e) => update(h.id, { name: e.target.value })} />
                        <button className="w-x show" title="지우기" onClick={() => remove(h)}>✕</button>
                      </div>
                    </td>
                    {days.map((k) => (
                      <td key={k}>
                        <button
                          className={`hb-cell tag-${color} ${set.has(k) ? 'on' : ''} ${k > today ? 'future' : ''}`}
                          aria-label={`${h.name} ${formatDate(k)}`}
                          onClick={() => toggle(h.id, k)}
                        />
                      </td>
                    ))}
                    <td className="hb-stat"><b>{doneN}</b>/{counted.length || days.length}<small>{counted.length ? `${Math.round((doneN / counted.length) * 100)}%` : ''}</small></td>
                    <td className="hb-stat">{streak(set) ? `🔥${streak(set)}` : '-'}</td>
                    <td className="hb-stat">{longestStreak([...set])}일</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

// ── 목표 ─────────────────────────────────────────────
export function GoalsDetail({ config, setConfig }: WidgetProps<GoalsConfig>) {
  const goals = config.goals ?? [];
  const [form, setForm] = useState({ name: '', target: '', unit: '', deadline: '' });
  const today = todayKey();
  const update = (id: string, patch: Partial<Goal>) => setConfig({ ...config, goals: goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  const add = (e: FormEvent) => {
    e.preventDefault();
    const t = Number(form.target);
    if (!form.name.trim() || !Number.isFinite(t) || t <= 0) return;
    setConfig({ ...config, goals: [...goals, { id: uid(), name: form.name.trim(), current: 0, target: t, unit: form.unit.trim(), deadline: form.deadline || undefined }] });
    setForm({ name: '', target: '', unit: '', deadline: '' });
  };

  return (
    <div className="dt">
      <form className="bd-input" onSubmit={add}>
        <input className="field small grow" placeholder="목표 (예: 책 읽기)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="field small amount" type="number" min="1" placeholder="목표치" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
        <input className="field small unit" placeholder="단위" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        <input className="field small" type="date" title="기한 (선택)" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
        <button className="btn">＋ 추가</button>
      </form>
      {goals.length === 0 && <div className="w-empty">"책 12권 읽기"처럼 숫자로 셀 수 있는 목표를 넣어 보세요.</div>}
      <div className="gl-grid">
        {goals.map((g, i) => {
          const pct = Math.min(100, Math.round((g.current / g.target) * 100));
          const left = Math.max(0, g.target - g.current);
          const daysLeft = g.deadline ? diffDays(today, g.deadline) : null;
          return (
            <article key={g.id} className={`gl-card tag-${tagAt(i)}`}>
              <div className="gl-top">
                <input className="cell-input strong" value={g.name} onChange={(e) => update(g.id, { name: e.target.value })} />
                <button className="w-x show" title="지우기" onClick={() => setConfig({ ...config, goals: goals.filter((x) => x.id !== g.id) })}>✕</button>
              </div>
              <div className="gl-pct">{pct >= 100 ? '🎉 달성!' : `${pct}%`}</div>
              <div className="w-bar"><span style={{ width: `${pct}%` }} /></div>
              <div className="gl-nums">
                <button className="w-step" onClick={() => update(g.id, { current: Math.max(0, g.current - 1) })}>−</button>
                <input className="cell-input num" type="number" value={g.current} onChange={(e) => update(g.id, { current: Math.max(0, Number(e.target.value) || 0) })} />
                <span>/</span>
                <input className="cell-input num" type="number" value={g.target} onChange={(e) => update(g.id, { target: Math.max(1, Number(e.target.value) || 1) })} />
                <input className="cell-input unit" value={g.unit} placeholder="단위" onChange={(e) => update(g.id, { unit: e.target.value })} />
                <button className="w-step" onClick={() => update(g.id, { current: g.current + 1 })}>＋</button>
              </div>
              <div className="gl-foot">
                <label className="w-sub">기한 <input className="cell-input" type="date" value={g.deadline ?? ''} onChange={(e) => update(g.id, { deadline: e.target.value || undefined })} /></label>
                {daysLeft !== null && left > 0 && (
                  <small className={daysLeft < 0 ? 'neg' : 'w-sub'}>
                    {daysLeft < 0 ? `기한이 ${-daysLeft}일 지났어요` : daysLeft === 0 ? '오늘이 기한이에요' : `${daysLeft}일 남음 · 하루 ${+(left / daysLeft).toFixed(1)}${g.unit}씩`}
                  </small>
                )}
              </div>
              <input className="cell-input" placeholder="메모" value={g.memo ?? ''} onChange={(e) => update(g.id, { memo: e.target.value || undefined })} />
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ── 메모 ─────────────────────────────────────────────
export function MemoDetail({ widget, config, setConfig }: WidgetProps<MemoConfig>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = config.text ?? '';
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(420, el.scrollHeight)}px`;
  }, [text]);
  return (
    <div className="dt">
      <section className={`bd-card memo-sheet ${widget.color ? `tint-${widget.color}` : ''}`}>
        <textarea
          ref={ref}
          className="w-memo big"
          autoFocus
          placeholder="떠오르는 걸 마음껏 적어 두세요…"
          value={text}
          onChange={(e) => setConfig({ ...config, text: e.target.value.slice(0, 50000) })}
        />
      </section>
      <p className="cal-hint">{text.length.toLocaleString('ko-KR')}자 · 홈의 메모 위젯과 같은 내용이에요</p>
    </div>
  );
}

// ── 모든 페이지 ─────────────────────────────────────────
export function RecentDetail({ ctx }: WidgetProps<Record<string, never>>) {
  const [tab, setTab] = useState<'all' | 'fav'>('all');
  const [sort, setSort] = useState<'recent' | 'name' | 'created'>('recent');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  let list = ctx.pages.filter((p) => p.deletedAt == null && p.kind !== 'row')
    .filter((p) => tab === 'all' || p.favorite)
    .filter((p) => !q || displayTitle(p).toLowerCase().includes(q));
  list = [...list].sort((a, b) =>
    sort === 'name' ? displayTitle(a).localeCompare(displayTitle(b), 'ko') : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt);

  return (
    <div className="dt">
      <div className="bd-bar">
        <div className="segmented small">
          <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>모든 페이지</button>
          <button className={tab === 'fav' ? 'on' : ''} onClick={() => setTab('fav')}>⭐ 즐겨찾기</button>
        </div>
        <div className="ld-tools">
          <input className="field small" placeholder="🔍 제목 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="field small" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="recent">최근 수정순</option>
            <option value="created">만든 순</option>
            <option value="name">이름순</option>
          </select>
        </div>
      </div>
      <section className="bd-card flush">
        <table className="ld-table">
          <thead><tr><th>제목</th><th>종류</th><th>위치</th><th className="date-col">수정</th><th className="date-col">만든 날</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={5} className="ld-empty">페이지가 없어요</td></tr>}
            {list.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => ctx.openPage(p.id)}>
                <td>
                  <div className="ld-name">
                    {p.icon ? <span className="w-page-icon">{p.icon}</span> : <span className="tree-dot" style={{ background: dotColor(p.id) }} />}
                    <b>{displayTitle(p)}</b>
                    {p.favorite && <span title="즐겨찾기">⭐</span>}
                  </div>
                </td>
                <td className="w-sub">{p.kind === 'database' ? '🗃️ 데이터베이스' : '📄 문서'}</td>
                <td className="w-sub">{ancestors(ctx.pages, p.parentId).map(displayTitle).join(' / ') || '-'}</td>
                <td className="date-col w-sub">{timeAgo(p.updatedAt)}</td>
                <td className="date-col w-sub">{new Date(p.createdAt).toLocaleDateString('ko-KR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
