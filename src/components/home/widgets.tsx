import { useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Widget } from '../../api';
import { addDays, diffDays, formatDate, parseKey, toKey, todayKey } from '../../database';
import { displayTitle, dotColor, timeAgo } from '../../tree';
import { flattenAgenda, newItemProps, onDay, type AgendaItem } from './agenda';
import { uid, type HomeCtx, type WidgetProps } from './meta';
import {
  catsOf, ddayLabel, ddayTarget, habitColor, normalizeUrl, sortDdays, streak, tagAt, trimLog, won,
  type BudgetConfig, type DdayConfig, type Goal, type GoalsConfig, type Habit, type HabitsConfig, type LinksConfig, type MemoConfig,
} from './model';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function WidgetBody({ widget, ctx, setConfig }: { widget: Widget; ctx: HomeCtx; setConfig: (c: Record<string, unknown>) => void }) {
  const p = { widget, ctx, config: widget.config as never, setConfig: setConfig as never };
  switch (widget.type) {
    case 'today': return <TodayWidget {...p} />;
    case 'todo': return <TodoWidget {...p} />;
    case 'calendar': return <CalendarWidget {...p} />;
    case 'dday': return <DdayWidget {...p} />;
    case 'habits': return <HabitsWidget {...p} />;
    case 'goals': return <GoalsWidget {...p} />;
    case 'memo': return <MemoWidget {...p} />;
    case 'budget': return <BudgetWidget {...p} />;
    case 'links': return <LinksWidget {...p} />;
    case 'recent': return <RecentWidget {...p} />;
  }
}

const Empty = ({ children }: { children: React.ReactNode }) => <div className="w-empty">{children}</div>;

function useAgenda(ctx: HomeCtx) {
  return useMemo(() => flattenAgenda(ctx.agenda), [ctx.agenda]);
}

// ── 오늘 한눈에 ─────────────────────────────────────────────
function TodayWidget({ ctx }: WidgetProps<Record<string, never>>) {
  const items = useAgenda(ctx);
  const today = todayKey();
  const now = new Date();
  const todays = items.filter((i) => onDay(i, today));
  const left = todays.filter((i) => !i.done).length;
  const weekEnd = addDays(today, 6 - now.getDay());
  const thisWeek = items.filter((i) => i.date && i.date >= today && i.date <= weekEnd && !i.done).length;
  const overdue = items.filter((i) => i.date && (i.end ?? i.date) < today && !i.done && i.doneProps).length;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthPct = Math.round((now.getDate() / daysInMonth) * 100);
  const yearDay = diffDays(`${now.getFullYear()}-01-01`, today) + 1;

  return (
    <div className="w-today">
      <div className="w-today-date">
        <span className="w-today-day">{now.getDate()}</span>
        <span>
          <b>{now.getMonth() + 1}월 · {WEEKDAYS[now.getDay()]}요일</b>
          <small>올해 {yearDay}일째</small>
        </span>
      </div>
      <div className="w-stats">
        <div className="w-stat tag-p4"><b>{todays.length}</b><span>오늘 일정</span></div>
        <div className="w-stat tag-p2"><b>{left}</b><span>남은 할 일</span></div>
        <div className="w-stat tag-p1"><b>{thisWeek}</b><span>이번 주</span></div>
        <div className="w-stat tag-p5"><b>{overdue}</b><span>밀린 일</span></div>
      </div>
      <div className="w-progress-label">이번 달 {monthPct}% 지났어요</div>
      <div className="w-bar"><span style={{ width: `${monthPct}%` }} /></div>
    </div>
  );
}

// ── 오늘 할 일 ─────────────────────────────────────────────
type TodoConfig = { dbId?: string };

function TodoWidget({ ctx, config, setConfig }: WidgetProps<TodoConfig>) {
  const items = useAgenda(ctx);
  const [title, setTitle] = useState('');
  const today = todayKey();
  const target = ctx.agenda.find((d) => d.id === config.dbId) ?? ctx.agenda[0];

  const list = items
    .filter((i) => onDay(i, today) || (i.date && (i.end ?? i.date) < today && !i.done && i.doneProps))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.date ?? '').localeCompare(b.date ?? ''));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !target) return;
    await ctx.addRow(target.id, title.trim(), newItemProps(target, today));
    setTitle('');
  };

  if (!ctx.agenda.length) {
    return <Empty>사이드바에서 <b>🗃️ 새 데이터베이스</b>를 만들고 날짜를 넣으면 오늘 할 일이 여기 모여요.</Empty>;
  }

  return (
    <div className="w-todo">
      <ul className="w-list">
        {list.length === 0 && <li className="w-empty small">오늘 할 일이 없어요. 여유로운 하루 🌿</li>}
        {list.map((i) => (
          <li key={i.id} className={`w-todo-item ${i.done ? 'done' : ''}`}>
            <input
              type="checkbox"
              checked={i.done}
              disabled={!i.doneProps}
              title={i.doneProps ? '완료 표시' : "상태 속성에 '완료' 태그가 있으면 체크할 수 있어요"}
              onChange={(e) => i.doneProps && ctx.updateRow(i.dbId, i.id, i.doneProps(e.target.checked))}
            />
            <button className="w-link" onClick={() => ctx.openPage(i.dbId)} title={`${i.dbTitle}에서 열기`}>
              <span className={`w-dot tag-${i.color}`} />
              {i.icon && `${i.icon} `}{i.title}
            </button>
            {i.date && (i.end ?? i.date) < today && !i.done && <span className="w-late">{formatDate(i.date)}</span>}
          </li>
        ))}
      </ul>
      <form className="w-add" onSubmit={add}>
        <input className="field small" placeholder="＋ 오늘 할 일 추가" value={title} onChange={(e) => setTitle(e.target.value)} />
        {ctx.agenda.length > 1 && (
          <select className="field small" value={target?.id} onChange={(e) => setConfig({ ...config, dbId: e.target.value })} title="어느 데이터베이스에 넣을까요">
            {ctx.agenda.map((d) => <option key={d.id} value={d.id}>{d.icon} {d.title || '제목 없음'}</option>)}
          </select>
        )}
      </form>
    </div>
  );
}

// ── 미니 캘린더 ─────────────────────────────────────────────
function CalendarWidget({ ctx }: WidgetProps<Record<string, never>>) {
  const items = useAgenda(ctx);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const today = todayKey();
  const [picked, setPicked] = useState(today);

  const cells = useMemo(() => {
    const start = new Date(month);
    start.setDate(1 - start.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);

  const dayItems = (key: string) => items.filter((i) => onDay(i, key));
  const pickedItems = dayItems(picked);

  return (
    <div className="w-cal">
      <div className="w-cal-head">
        <b>{month.getFullYear()}년 {month.getMonth() + 1}월</b>
        <span>
          <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
        </span>
      </div>
      <div className="w-cal-grid">
        {WEEKDAYS.map((w, i) => <span key={w} className={`w-cal-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</span>)}
        {cells.map((d) => {
          const key = toKey(d);
          const its = dayItems(key);
          return (
            <button
              key={key}
              className={['w-cal-day', d.getMonth() !== month.getMonth() && 'outside', key === today && 'today', key === picked && 'picked'].filter(Boolean).join(' ')}
              onClick={() => setPicked(key)}
            >
              {d.getDate()}
              <span className="w-cal-dots">
                {its.slice(0, 3).map((i) => <span key={i.id} className={`w-dot tag-${i.color}`} />)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="w-cal-list">
        <div className="w-sub">{formatDate(picked)} {pickedItems.length ? `· ${pickedItems.length}개` : ''}</div>
        {pickedItems.length === 0 ? <div className="w-empty small">일정이 없어요</div> : pickedItems.slice(0, 5).map((i) => (
          <button key={i.id} className="w-link" onClick={() => ctx.openPage(i.dbId)}>
            <span className={`w-dot tag-${i.color}`} />{i.icon && `${i.icon} `}{i.title}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── D-day ─────────────────────────────────────────────────
function DdayWidget({ config, setConfig }: WidgetProps<DdayConfig>) {
  const items = config.items ?? [];
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const today = todayKey();
  const sorted = sortDdays(items);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !date) return;
    setConfig({ ...config, items: [...items, { id: uid(), name: name.trim(), date, emoji: '' }] });
    setName('');
    setDate('');
  };

  return (
    <div className="w-dday">
      {sorted.length === 0 && <Empty>시험, 생일, 여행처럼 기다리는 날을 넣어 보세요.</Empty>}
      {sorted.map((d, i) => (
        <div key={d.id} className={`w-dday-item ${ddayTarget(d) < today ? 'past' : ''}`}>
          <span className={`w-dday-badge tag-${tagAt(i)}`}>{ddayLabel(d)}</span>
          <span className="w-dday-text">
            <b>{d.name}</b>
            <small>{formatDate(ddayTarget(d))}{d.yearly ? ' · 매년' : ''}</small>
          </span>
          <button className="w-x" title="지우기" onClick={() => setConfig({ ...config, items: items.filter((x) => x.id !== d.id) })}>✕</button>
        </div>
      ))}
      <form className="w-add" onSubmit={add}>
        <input className="field small" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field small" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn small">추가</button>
      </form>
    </div>
  );
}

// ── 습관 체크 ─────────────────────────────────────────────
function HabitsWidget({ config, setConfig }: WidgetProps<HabitsConfig>) {
  const habits = config.habits ?? [];
  const log = config.log ?? {};
  const [name, setName] = useState('');
  const today = todayKey();
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  const toggle = (hid: string, key: string) => {
    const set = new Set(log[hid] ?? []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    setConfig({ ...config, log: { ...log, [hid]: trimLog(set) } });
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setConfig({ ...config, habits: [...habits, { id: uid(), name: name.trim() }] });
    setName('');
  };

  const remove = (h: Habit) => {
    if (!confirm(`'${h.name}' 습관과 기록을 지울까요?`)) return;
    const { [h.id]: _gone, ...rest } = log;
    setConfig({ ...config, habits: habits.filter((x) => x.id !== h.id), log: rest });
  };

  return (
    <div className="w-habits">
      {habits.length === 0 ? (
        <Empty>물 2L 마시기, 30분 걷기처럼 매일 하고 싶은 일을 넣어 보세요.</Empty>
      ) : (
        <table className="w-habit-table">
          <thead>
            <tr>
              <th />
              {week.map((k) => {
                const d = parseKey(k);
                return <th key={k} className={k === today ? 'today' : ''}>{WEEKDAYS[d.getDay()]}<small>{d.getDate()}</small></th>;
              })}
              <th className="w-streak-h">연속</th>
            </tr>
          </thead>
          <tbody>
            {habits.map((h, idx) => {
              const days = new Set(log[h.id] ?? []);
              const s = streak(days);
              return (
                <tr key={h.id}>
                  <td className="w-habit-name">
                    <button className="w-x" title="지우기" onClick={() => remove(h)}>✕</button>
                    {h.name}
                  </td>
                  {week.map((k) => (
                    <td key={k}>
                      <button
                        className={`w-check tag-${habitColor(h, idx)} ${days.has(k) ? 'on' : ''}`}
                        aria-label={`${h.name} ${formatDate(k)}`}
                        onClick={() => toggle(h.id, k)}
                      >
                        {days.has(k) ? '✓' : ''}
                      </button>
                    </td>
                  ))}
                  <td className="w-streak">{s > 0 ? `🔥${s}` : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <form className="w-add" onSubmit={add}>
        <input className="field small" placeholder="＋ 새 습관" value={name} onChange={(e) => setName(e.target.value)} />
      </form>
    </div>
  );
}

// ── 목표 진행률 ─────────────────────────────────────────────

function GoalsWidget({ config, setConfig }: WidgetProps<GoalsConfig>) {
  const goals = config.goals ?? [];
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');

  const update = (id: string, patch: Partial<Goal>) =>
    setConfig({ ...config, goals: goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) });

  const add = (e: FormEvent) => {
    e.preventDefault();
    const t = Number(target);
    if (!name.trim() || !Number.isFinite(t) || t <= 0) return;
    setConfig({ ...config, goals: [...goals, { id: uid(), name: name.trim(), current: 0, target: t, unit: unit.trim() }] });
    setName('');
    setTarget('');
    setUnit('');
  };

  return (
    <div className="w-goals">
      {goals.length === 0 && <Empty>"책 12권 읽기"처럼 숫자로 셀 수 있는 목표를 넣어 보세요.</Empty>}
      {goals.map((g, i) => {
        const pct = Math.min(100, Math.round((g.current / g.target) * 100));
        return (
          <div key={g.id} className="w-goal">
            <div className="w-goal-top">
              <b>{g.name}</b>
              <span className="w-goal-num">
                <button className="w-step" onClick={() => update(g.id, { current: Math.max(0, g.current - 1) })}>−</button>
                <input
                  className="w-goal-input"
                  type="number"
                  value={g.current}
                  onChange={(e) => update(g.id, { current: Math.max(0, Number(e.target.value) || 0) })}
                />
                / {g.target}{g.unit}
                <button className="w-step" onClick={() => update(g.id, { current: g.current + 1 })}>＋</button>
              </span>
              <button className="w-x" title="지우기" onClick={() => setConfig({ ...config, goals: goals.filter((x) => x.id !== g.id) })}>✕</button>
            </div>
            <div className={`w-bar tag-${tagAt(i)}`}><span style={{ width: `${pct}%` }} /></div>
            <small className="w-goal-pct">{pct >= 100 ? '🎉 달성!' : `${pct}%`}</small>
          </div>
        );
      })}
      <form className="w-add" onSubmit={add}>
        <input className="field small" placeholder="목표" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field small num" type="number" min="1" placeholder="목표치" value={target} onChange={(e) => setTarget(e.target.value)} />
        <input className="field small unit" placeholder="단위" value={unit} onChange={(e) => setUnit(e.target.value)} />
        <button className="btn small">추가</button>
      </form>
    </div>
  );
}

// ── 빠른 메모 ─────────────────────────────────────────────
function MemoWidget({ config, setConfig }: WidgetProps<MemoConfig>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = config.text ?? '';
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(120, el.scrollHeight)}px`;
  }, [text]);
  return (
    <textarea
      ref={ref}
      className="w-memo"
      placeholder="떠오르는 걸 바로 적어 두세요…"
      value={text}
      onChange={(e) => setConfig({ ...config, text: e.target.value.slice(0, 20000) })}
    />
  );
}

// ── 가계부 ─────────────────────────────────────────────────

function BudgetWidget({ config, setConfig }: WidgetProps<BudgetConfig>) {
  const entries = config.entries ?? [];
  const [month, setMonth] = useState(() => todayKey().slice(0, 7));
  const [kind, setKind] = useState<'out' | 'in'>('out');
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState(catsOf(config, 'out')[0]);
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(todayKey());

  const inMonth = entries.filter((e) => e.date.startsWith(month));
  const spent = inMonth.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount, 0);
  const income = inMonth.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount, 0);
  const byCat = new Map<string, number>();
  for (const e of inMonth) if (e.kind === 'out') byCat.set(e.cat, (byCat.get(e.cat) ?? 0) + e.amount);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const budget = config.budget ?? 0;
  const pct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;

  const [y, m] = month.split('-').map(Number);
  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(toKey(d).slice(0, 7));
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const n = Math.round(Number(amount.replace(/,/g, '')));
    if (!Number.isFinite(n) || n <= 0) return;
    setConfig({ ...config, entries: [...entries, { id: uid(), date, kind, amount: n, cat, memo: memo.trim() }] });
    setAmount('');
    setMemo('');
  };

  return (
    <div className="w-budget">
      <div className="w-cal-head">
        <b>{y}년 {m}월</b>
        <span>
          <button className="icon-btn" onClick={() => shift(-1)}>‹</button>
          <button className="icon-btn" onClick={() => shift(1)}>›</button>
        </span>
      </div>
      <div className="w-stats two">
        <div className="w-stat tag-p5"><b>{won(spent)}</b><span>지출</span></div>
        <div className="w-stat tag-p2"><b>{won(income)}</b><span>수입</span></div>
      </div>
      <div className="w-budget-line">
        <span>월 예산</span>
        <input
          className="field small num"
          type="number"
          min="0"
          placeholder="정하지 않음"
          value={budget || ''}
          onChange={(e) => setConfig({ ...config, budget: Math.max(0, Number(e.target.value) || 0) })}
        />
        {budget > 0 && <span className={spent > budget ? 'w-late' : 'w-sub'}>{spent > budget ? `${won(spent - budget)} 넘었어요` : `${won(budget - spent)} 남음`}</span>}
      </div>
      {budget > 0 && <div className={`w-bar ${pct >= 100 ? 'over' : 'tag-p3'}`}><span style={{ width: `${pct}%` }} /></div>}

      {cats.length > 0 && (
        <div className="w-cats">
          {cats.slice(0, 6).map(([c, v], i) => (
            <div key={c} className="w-cat">
              <span className="w-cat-name">{c}</span>
              <div className={`w-bar thin tag-${tagAt(i)}`}><span style={{ width: `${Math.round((v / spent) * 100)}%` }} /></div>
              <span className="w-cat-amt">{won(v)}</span>
            </div>
          ))}
        </div>
      )}

      <form className="w-add budget" onSubmit={add}>
        <div className="segmented small">
          <button type="button" className={kind === 'out' ? 'on' : ''} onClick={() => { setKind('out'); setCat(catsOf(config, 'out')[0]); }}>지출</button>
          <button type="button" className={kind === 'in' ? 'on' : ''} onClick={() => { setKind('in'); setCat(catsOf(config, 'in')[0]); }}>수입</button>
        </div>
        <input className="field small num" inputMode="numeric" placeholder="금액" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="field small" value={cat} onChange={(e) => setCat(e.target.value)}>
          {catsOf(config, kind).map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="field small" placeholder="메모" value={memo} onChange={(e) => setMemo(e.target.value)} />
        <input className="field small" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn small">기록</button>
      </form>

      <ul className="w-list entries">
        {[...inMonth].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map((e) => (
          <li key={e.id} className="w-entry">
            <span className="w-sub">{formatDate(e.date)}</span>
            <span className="w-entry-cat">{e.cat}</span>
            <span className="w-entry-memo">{e.memo}</span>
            <b className={e.kind === 'in' ? 'plus' : ''}>{e.kind === 'in' ? '+' : '-'}{won(e.amount)}</b>
            <button className="w-x" title="지우기" onClick={() => setConfig({ ...config, entries: entries.filter((x) => x.id !== e.id) })}>✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 링크 모음 ─────────────────────────────────────────────
function LinksWidget({ config, setConfig }: WidgetProps<LinksConfig>) {
  const links = config.links ?? [];
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');

  const add = (e: FormEvent) => {
    e.preventDefault();
    const href = normalizeUrl(url);
    if (!href) return;
    const name = title.trim() || new URL(href).hostname.replace(/^www\./, '');
    setConfig({ ...config, links: [...links, { id: uid(), title: name, url: href, createdAt: Date.now() }] });
    setTitle('');
    setUrl('');
  };

  return (
    <div className="w-links">
      {links.length === 0 && <Empty>자주 가는 사이트를 모아 두세요.</Empty>}
      <div className="w-link-grid">
        {links.map((l, i) => (
          <div key={l.id} className="w-link-tile">
            <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}>
              <span className={`w-link-badge tag-${tagAt(i)}`}>{[...l.title][0]?.toUpperCase()}</span>
              <span className="w-link-name">{l.title}</span>
            </a>
            <button className="w-x" title="지우기" onClick={() => setConfig({ ...config, links: links.filter((x) => x.id !== l.id) })}>✕</button>
          </div>
        ))}
      </div>
      <form className="w-add" onSubmit={add}>
        <input className="field small" placeholder="이름" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="field small" placeholder="주소 (예: naver.com)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn small">추가</button>
      </form>
    </div>
  );
}

// ── 최근·즐겨찾기 ─────────────────────────────────────────────
function RecentWidget({ ctx }: WidgetProps<Record<string, never>>) {
  const [tab, setTab] = useState<'recent' | 'fav'>('recent');
  const live = ctx.pages.filter((p) => p.deletedAt == null && p.kind !== 'row');
  const list = tab === 'recent'
    ? [...live].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 7)
    : live.filter((p) => p.favorite);
  return (
    <div className="w-recent">
      <div className="segmented small">
        <button className={tab === 'recent' ? 'on' : ''} onClick={() => setTab('recent')}>최근</button>
        <button className={tab === 'fav' ? 'on' : ''} onClick={() => setTab('fav')}>즐겨찾기</button>
      </div>
      {list.length === 0 && <div className="w-empty small">{tab === 'fav' ? '⭐ 즐겨찾기한 페이지가 없어요' : '페이지가 없어요'}</div>}
      {list.map((p) => (
        <button key={p.id} className="w-link w-page" onClick={() => ctx.openPage(p.id)}>
          {p.icon ? <span className="w-page-icon">{p.icon}</span> : <span className="tree-dot" style={{ background: dotColor(p.id) }} />}
          <span className="tree-title">{displayTitle(p)}</span>
          {tab === 'recent' && <small className="w-sub">{timeAgo(p.updatedAt)}</small>}
        </button>
      ))}
    </div>
  );
}

