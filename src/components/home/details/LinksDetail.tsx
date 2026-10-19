import { useState, type FormEvent } from 'react';
import { uid, type WidgetProps } from '../meta';
import { catColor, hostOf, normalizeUrl, type Link, type LinksConfig } from '../model';

type Sort = 'manual' | 'name' | 'recent';

export function LinksDetail({ config, setConfig }: WidgetProps<LinksConfig>) {
  const links = config.links ?? [];
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('manual');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', url: '', cat: '', memo: '' });
  const [bad, setBad] = useState(false);

  const cats = [...new Set(links.map((l) => l.cat?.trim()).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'ko'));
  const save = (next: Link[]) => setConfig({ ...config, links: next });
  const update = (id: string, patch: Partial<Link>) => save(links.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const q = query.trim().toLowerCase();
  let shown = links.filter((l) => (cat === null || (cat === '' ? !l.cat : l.cat === cat)))
    .filter((l) => !q || [l.title, l.url, l.cat ?? '', l.memo ?? ''].some((v) => v.toLowerCase().includes(q)));
  if (sort === 'name') shown = [...shown].sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  if (sort === 'recent') shown = [...shown].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  const add = (e: FormEvent) => {
    e.preventDefault();
    const href = normalizeUrl(form.url);
    if (!href) {
      setBad(true);
      return;
    }
    setBad(false);
    save([...links, {
      id: uid(), title: form.title.trim() || hostOf(href), url: href,
      cat: form.cat.trim() || (cat ?? '') || undefined, memo: form.memo.trim() || undefined, createdAt: Date.now(),
    }]);
    setForm({ title: '', url: '', cat: form.cat, memo: '' });
  };

  // 끌어 놓은 줄 앞으로 옮긴다 (직접 순서일 때만)
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const moving = links.find((l) => l.id === dragId)!;
    const rest = links.filter((l) => l.id !== dragId);
    const idx = rest.findIndex((l) => l.id === targetId);
    save([...rest.slice(0, idx), moving, ...rest.slice(idx)]);
  };

  return (
    <div className="ld">
      <div className="ld-bar">
        <div className="chips">
          <button className={`chip-filter ${cat === null ? 'on' : ''}`} onClick={() => setCat(null)}>전체 <small>{links.length}</small></button>
          {cats.map((c) => (
            <button key={c} className={`chip-filter tag-${catColor(c)} ${cat === c ? 'on' : ''}`} onClick={() => setCat(cat === c ? null : c)}>
              <span className="w-dot" />{c} <small>{links.filter((l) => l.cat === c).length}</small>
            </button>
          ))}
          {links.some((l) => !l.cat) && cats.length > 0 && (
            <button className={`chip-filter ${cat === '' ? 'on' : ''}`} onClick={() => setCat(cat === '' ? null : '')}>분류 없음</button>
          )}
        </div>
        <div className="ld-tools">
          <input className="field small" placeholder="🔍 링크 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="field small" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="manual">직접 정한 순서</option>
            <option value="name">이름순</option>
            <option value="recent">최근 추가순</option>
          </select>
        </div>
      </div>

      <section className="bd-card flush">
        <table className="ld-table">
          <thead>
            <tr>
              <th className="grip-col" />
              <th>이름</th>
              <th>주소</th>
              <th>분류</th>
              <th>메모</th>
              <th className="date-col">추가한 날</th>
              <th className="act-col" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={7} className="ld-empty">{links.length ? '찾는 링크가 없어요' : '아래에서 첫 링크를 넣어 보세요 🔗'}</td></tr>
            )}
            {shown.map((l) => (
              <tr
                key={l.id}
                className={`${dragId === l.id ? 'dragging' : ''} ${overId === l.id ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  if (!dragId || sort !== 'manual') return;
                  e.preventDefault();
                  if (overId !== l.id) setOverId(l.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(l.id);
                  setDragId(null);
                  setOverId(null);
                }}
              >
                <td className="grip-col">
                  {sort === 'manual' && (
                    <span
                      className="ld-grip"
                      draggable
                      title="끌어서 순서 바꾸기"
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', l.id);
                        setDragId(l.id);
                      }}
                      onDragEnd={() => { setDragId(null); setOverId(null); }}
                    >
                      ⠿
                    </span>
                  )}
                </td>
                <td>
                  <div className="ld-name">
                    <span className={`w-link-badge small tag-${catColor(l.cat || l.title)}`}>{[...l.title][0]?.toUpperCase()}</span>
                    <input className="cell-input strong" value={l.title} onChange={(e) => update(l.id, { title: e.target.value })} />
                  </div>
                </td>
                <td>
                  <input
                    className="cell-input url"
                    defaultValue={l.url}
                    title={l.url}
                    onBlur={(e) => {
                      const href = normalizeUrl(e.target.value);
                      if (href && href !== l.url) update(l.id, { url: href });
                      e.target.value = href || l.url;
                    }}
                  />
                </td>
                <td>
                  <input
                    className={`cell-input tag-input ${l.cat ? `tag-${catColor(l.cat)}` : ''}`}
                    list="ld-cats"
                    value={l.cat ?? ''}
                    placeholder="＋ 분류"
                    onChange={(e) => update(l.id, { cat: e.target.value.slice(0, 20) || undefined })}
                  />
                </td>
                <td><input className="cell-input" value={l.memo ?? ''} placeholder="-" onChange={(e) => update(l.id, { memo: e.target.value || undefined })} /></td>
                <td className="date-col w-sub">{l.createdAt ? new Date(l.createdAt).toLocaleDateString('ko-KR') : '-'}</td>
                <td className="act-col">
                  <a className="icon-btn" href={l.url} target="_blank" rel="noopener noreferrer" title="새 탭에서 열기">↗</a>
                  <button className="w-x show" title="지우기" onClick={() => save(links.filter((x) => x.id !== l.id))}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="grip-col">＋</td>
              <td colSpan={6}>
                <form className="ld-add" onSubmit={add}>
                  <input className="field small" placeholder="이름 (비우면 주소로)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  <input className={`field small grow ${bad ? 'bad' : ''}`} placeholder="주소 (예: github.com)" value={form.url} onChange={(e) => { setForm({ ...form, url: e.target.value }); setBad(false); }} />
                  <input className="field small" list="ld-cats" placeholder="분류" value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} />
                  <input className="field small" placeholder="메모" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
                  <button className="btn small">추가</button>
                </form>
                {bad && <div className="error">주소를 확인해 주세요. http 나 https 주소만 넣을 수 있어요.</div>}
              </td>
            </tr>
          </tfoot>
        </table>
        <datalist id="ld-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      </section>
      {sort !== 'manual' && <p className="cal-hint">순서를 끌어서 바꾸려면 '직접 정한 순서'로 보세요.</p>}
    </div>
  );
}
