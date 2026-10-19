import { useMemo, useState, type FormEvent } from 'react';
import { formatDate, parseKey, toKey, todayKey } from '../../../database';
import { uid, type WidgetProps } from '../meta';
import {
  catsOf, compactWon, parseAmount, PAY_METHODS, won,
  type BudgetConfig, type Entry, type EntryKind,
} from '../model';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 축 눈금용 깔끔한 최댓값 (1·2·2.5·5 × 10의 거듭제곱)
function niceMax(v: number) {
  if (v <= 0) return 10000;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function BudgetDetail({ config, setConfig }: WidgetProps<BudgetConfig>) {
  const entries = config.entries ?? [];
  const [month, setMonth] = useState(() => todayKey().slice(0, 7));
  const [filterKind, setFilterKind] = useState<'all' | EntryKind>('all');
  const [filterCat, setFilterCat] = useState('');
  const [query, setQuery] = useState('');
  const [hoverDay, setHoverDay] = useState<string | null>(null);

  // 입력 바
  const [kind, setKind] = useState<EntryKind>('out');
  const [date, setDate] = useState(todayKey());
  const [cat, setCat] = useState(catsOf(config, 'out')[0]);
  const [memo, setMemo] = useState('');
  const [pay, setPay] = useState(PAY_METHODS[0]);
  const [amount, setAmount] = useState('');
  const [newCat, setNewCat] = useState<Record<EntryKind, string>>({ out: '', in: '' });

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const inMonth = useMemo(() => entries.filter((e) => e.date.startsWith(month)), [entries, month]);
  const spent = inMonth.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount, 0);
  const income = inMonth.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount, 0);
  const budget = config.budget ?? 0;
  const isThisMonth = month === todayKey().slice(0, 7);
  const elapsed = isThisMonth ? new Date().getDate() : daysInMonth;
  const avgPerDay = elapsed ? Math.round(spent / elapsed) : 0;

  // 일별 지출
  const daily = useMemo(() => {
    const arr = Array.from({ length: daysInMonth }, (_, i) => ({ key: `${month}-${String(i + 1).padStart(2, '0')}`, out: 0, n: 0 }));
    for (const e of inMonth) {
      if (e.kind !== 'out') continue;
      const d = Number(e.date.slice(8, 10));
      if (arr[d - 1]) {
        arr[d - 1].out += e.amount;
        arr[d - 1].n += 1;
      }
    }
    return arr;
  }, [inMonth, month, daysInMonth]);
  const dayMax = niceMax(Math.max(0, ...daily.map((d) => d.out)));
  const peak = daily.reduce((a, b) => (b.out > a.out ? b : a), daily[0]);

  // 분류별 지출 (금액 큰 순)
  const byCat = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>();
    for (const e of inMonth) {
      if (e.kind !== 'out') continue;
      const cur = map.get(e.cat) ?? { sum: 0, n: 0 };
      map.set(e.cat, { sum: cur.sum + e.amount, n: cur.n + 1 });
    }
    return [...map.entries()].sort((a, b) => b[1].sum - a[1].sum);
  }, [inMonth]);
  const catMax = byCat[0]?.[1].sum ?? 0;

  // 표: 걸러서 날짜별로 묶기
  const filtered = inMonth
    .filter((e) => filterKind === 'all' || e.kind === filterKind)
    .filter((e) => !filterCat || e.cat === filterCat)
    .filter((e) => {
      const q = query.trim().toLowerCase();
      return !q || e.memo.toLowerCase().includes(q) || e.cat.toLowerCase().includes(q) || (e.pay ?? '').toLowerCase().includes(q);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const groups: { date: string; items: Entry[] }[] = [];
  for (const e of filtered) {
    const last = groups[groups.length - 1];
    if (last?.date === e.date) last.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }

  const shift = (n: number) => setMonth(toKey(new Date(y, m - 1 + n, 1)).slice(0, 7));
  const save = (next: Partial<BudgetConfig>) => setConfig({ ...config, ...next });
  const updateEntry = (id: string, patch: Partial<Entry>) =>
    save({ entries: entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const removeEntry = (id: string) => save({ entries: entries.filter((e) => e.id !== id) });

  const add = (e: FormEvent) => {
    e.preventDefault();
    const n = parseAmount(amount);
    if (!n) return;
    save({ entries: [...entries, { id: uid(), date, kind, amount: n, cat, memo: memo.trim(), pay }] });
    setAmount('');
    setMemo('');
    if (!date.startsWith(month)) setMonth(date.slice(0, 7));
  };

  const pickKind = (k: EntryKind) => {
    setKind(k);
    setCat(catsOf(config, k)[0]);
  };

  const exportCsv = () => {
    const rows = [['날짜', '구분', '분류', '내용', '결제수단', '금액']];
    for (const e of [...inMonth].sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push([e.date, e.kind === 'out' ? '지출' : '수입', e.cat, e.memo, e.pay ?? '', String(e.kind === 'out' ? -e.amount : e.amount)]);
    }
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `가계부-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const editCats = (k: EntryKind, list: string[]) => save(k === 'out' ? { catsOut: list } : { catsIn: list });
  const allCats = [...new Set([...catsOf(config, 'out'), ...catsOf(config, 'in'), ...inMonth.map((e) => e.cat)])];

  const tickValues = [dayMax, dayMax / 2, 0];
  // x축 날짜: 1일·5일 간격·오늘만, 오늘 옆에 붙는 라벨은 빼서 겹치지 않게
  const todayIdx = isThisMonth ? new Date().getDate() - 1 : -1;
  const showTick = (i: number) => i === todayIdx || ((i === 0 || (i + 1) % 5 === 0) && Math.abs(i - todayIdx) > 1);
  const hovered = hoverDay ? daily.find((d) => d.key === hoverDay) : null;

  return (
    <div className="bd">
      {/* 달 이동 + 내보내기 */}
      <div className="bd-bar">
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => shift(-1)} title="이전 달">‹</button>
          <b className="bd-month">{y}년 {m}월</b>
          <button className="icon-btn" onClick={() => shift(1)} title="다음 달">›</button>
          {!isThisMonth && <button className="btn ghost small" onClick={() => setMonth(todayKey().slice(0, 7))}>이번 달</button>}
        </div>
        <button className="btn ghost small" onClick={exportCsv} disabled={!inMonth.length}>⬇ CSV 내보내기</button>
      </div>

      {/* 요약 */}
      <div className="bd-stats">
        <div className="bd-stat"><span>지출</span><b>{won(spent)}</b><small>{inMonth.filter((e) => e.kind === 'out').length}건</small></div>
        <div className="bd-stat"><span>수입</span><b>{won(income)}</b><small>{inMonth.filter((e) => e.kind === 'in').length}건</small></div>
        <div className="bd-stat"><span>남은 돈 (수입 − 지출)</span><b className={income - spent < 0 ? 'neg' : ''}>{won(income - spent)}</b></div>
        <div className="bd-stat"><span>하루 평균 지출</span><b>{won(avgPerDay)}</b><small>{elapsed}일 기준</small></div>
        <div className="bd-stat budget">
          <span>월 예산</span>
          <input
            className="field small"
            type="number"
            min="0"
            placeholder="정하지 않음"
            value={budget || ''}
            onChange={(e) => save({ budget: Math.max(0, Number(e.target.value) || 0) })}
          />
          {budget > 0 && (
            <>
              <div className={`bd-meter ${spent > budget ? 'over' : ''}`}>
                <span style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }} />
              </div>
              <small className={spent > budget ? 'neg' : ''}>
                {spent > budget ? `⚠ ${won(spent - budget)} 넘었어요` : `${won(budget - spent)} 남음 · ${Math.round((spent / budget) * 100)}% 사용`}
              </small>
            </>
          )}
        </div>
      </div>

      {/* 차트 두 개 */}
      <div className="bd-charts">
        <section className="bd-card">
          <header className="bd-card-head">
            <h3>일별 지출</h3>
            <span className="w-sub">{hovered ? `${formatDate(hovered.key)} · ${won(hovered.out)} (${hovered.n}건)` : peak.out ? `가장 많이 쓴 날 ${formatDate(peak.key)} · ${won(peak.out)}` : '이번 달 지출이 없어요'}</span>
          </header>
          <div className="bd-chart">
            <div className="bd-axis">
              {tickValues.map((t) => <span key={t}>{compactWon(t)}</span>)}
            </div>
            <div className="bd-plot" onMouseLeave={() => setHoverDay(null)}>
              {tickValues.map((t) => <div key={t} className="bd-grid" style={{ bottom: `${(t / dayMax) * 100}%` }} />)}
              {daily.map((d, i) => {
                const wd = parseKey(d.key).getDay();
                return (
                  <div
                    key={d.key}
                    className={`bd-col ${d.key === todayKey() ? 'today' : ''} ${hoverDay === d.key ? 'hover' : ''}`}
                    onMouseEnter={() => setHoverDay(d.key)}
                    title={`${formatDate(d.key)} (${WEEKDAYS[wd]}) · ${won(d.out)}`}
                  >
                    <div className="bd-bar-fill" style={{ height: `${(d.out / dayMax) * 100}%` }} />
                    {showTick(i) && <span className="bd-x">{i + 1}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bd-card">
          <header className="bd-card-head">
            <h3>분류별 지출</h3>
            {filterCat && <button className="btn ghost small" onClick={() => setFilterCat('')}>필터 풀기</button>}
          </header>
          {byCat.length === 0 ? (
            <div className="w-empty small">이번 달 지출이 없어요</div>
          ) : (
            <div className="bd-cats">
              {byCat.map(([c, v]) => (
                <button key={c} className={`bd-cat ${filterCat === c ? 'on' : ''}`} onClick={() => setFilterCat(filterCat === c ? '' : c)} title="이 분류만 보기">
                  <span className="bd-cat-name">{c}</span>
                  <span className="bd-cat-track"><span style={{ width: `${(v.sum / catMax) * 100}%` }} /></span>
                  <span className="bd-cat-val">{won(v.sum)}</span>
                  <span className="bd-cat-pct">{Math.round((v.sum / spent) * 100)}%</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 입력 */}
      <form className="bd-input" onSubmit={add}>
        <div className="segmented small">
          <button type="button" className={kind === 'out' ? 'on' : ''} onClick={() => pickKind('out')}>지출</button>
          <button type="button" className={kind === 'in' ? 'on' : ''} onClick={() => pickKind('in')}>수입</button>
        </div>
        <input className="field small" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className="field small" value={cat} onChange={(e) => setCat(e.target.value)}>
          {catsOf(config, kind).map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="field small grow" placeholder="내용 (예: 점심, 버스비)" value={memo} onChange={(e) => setMemo(e.target.value)} />
        <select className="field small" value={pay} onChange={(e) => setPay(e.target.value)}>
          {PAY_METHODS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <input className="field small amount" inputMode="numeric" placeholder="금액" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn">＋ 기록</button>
      </form>

      {/* 내역 */}
      <section className="bd-card">
        <header className="bd-card-head wrap">
          <h3>내역 <span className="count">{filtered.length}</span></h3>
          <div className="bd-filters">
            <div className="segmented small">
              {([['all', '전체'], ['out', '지출'], ['in', '수입']] as const).map(([k, l]) => (
                <button key={k} className={filterKind === k ? 'on' : ''} onClick={() => setFilterKind(k)}>{l}</button>
              ))}
            </div>
            <select className="field small" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
              <option value="">모든 분류</option>
              {allCats.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className="field small" placeholder="🔍 내용 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </header>
        {groups.length === 0 ? (
          <div className="w-empty small">기록이 없어요. 위에서 첫 기록을 남겨 보세요.</div>
        ) : (
          <table className="bd-table">
            <thead>
              <tr><th>구분</th><th>분류</th><th>내용</th><th>결제수단</th><th className="num">금액</th><th /></tr>
            </thead>
            {groups.map((g) => {
              const out = g.items.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount, 0);
              const inn = g.items.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount, 0);
              return (
                <tbody key={g.date}>
                  <tr className="bd-day">
                    <td colSpan={4}>{formatDate(g.date)} ({WEEKDAYS[parseKey(g.date).getDay()]})</td>
                    <td className="num" colSpan={2}>
                      {out > 0 && <span>−{won(out)}</span>}
                      {inn > 0 && <span className="plus">+{won(inn)}</span>}
                    </td>
                  </tr>
                  {g.items.map((e) => (
                    <tr key={e.id}>
                      <td><span className={`bd-kind ${e.kind}`}>{e.kind === 'out' ? '지출' : '수입'}</span></td>
                      <td>
                        <select className="cell-input" value={e.cat} onChange={(ev) => updateEntry(e.id, { cat: ev.target.value })}>
                          {[...new Set([e.cat, ...catsOf(config, e.kind)])].map((c) => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td><input className="cell-input" value={e.memo} placeholder="-" onChange={(ev) => updateEntry(e.id, { memo: ev.target.value })} /></td>
                      <td>
                        <select className="cell-input" value={e.pay ?? ''} onChange={(ev) => updateEntry(e.id, { pay: ev.target.value })}>
                          <option value="">-</option>
                          {PAY_METHODS.map((p) => <option key={p}>{p}</option>)}
                        </select>
                      </td>
                      <td className="num">
                        <input
                          className={`cell-input num ${e.kind === 'in' ? 'plus' : ''}`}
                          inputMode="numeric"
                          defaultValue={e.amount.toLocaleString('ko-KR')}
                          onBlur={(ev) => {
                            const n = parseAmount(ev.target.value);
                            if (n) updateEntry(e.id, { amount: n });
                            ev.target.value = (n ?? e.amount).toLocaleString('ko-KR');
                          }}
                        />
                      </td>
                      <td><button className="w-x show" title="지우기" onClick={() => removeEntry(e.id)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        )}
      </section>

      {/* 분류 관리 */}
      <section className="bd-card">
        <header className="bd-card-head"><h3>분류 관리</h3><span className="w-sub">지워도 이미 남긴 기록의 분류는 그대로예요</span></header>
        <div className="bd-catedit">
          {(['out', 'in'] as const).map((k) => {
            const list = catsOf(config, k);
            return (
              <div key={k}>
                <h4>{k === 'out' ? '지출 분류' : '수입 분류'}</h4>
                <div className="chips">
                  {list.map((c) => (
                    <span key={c} className="chip-tag">
                      {c}
                      {list.length > 1 && <button className="w-x show" title="지우기" onClick={() => editCats(k, list.filter((x) => x !== c))}>✕</button>}
                    </span>
                  ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = newCat[k].trim().slice(0, 20);
                      if (name && !list.includes(name)) editCats(k, [...list, name]);
                      setNewCat({ ...newCat, [k]: '' });
                    }}
                  >
                    <input className="field small" placeholder="＋ 새 분류" value={newCat[k]} onChange={(e) => setNewCat({ ...newCat, [k]: e.target.value })} />
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
