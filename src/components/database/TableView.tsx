import { useEffect, useMemo, useState } from 'react';
import type { Property, Row } from '../../api';
import { byPosition, sortValue } from '../../database';
import { AddPropertyMenu, PropEditor, PropertyMenu, PropLabel } from './Cells';
import type { DbOps } from './DatabaseView';

type Sort = { propId: string | null; dir: 'asc' | 'desc' } | null; // propId null = 이름

export function TableView({ ops }: { ops: DbOps }) {
  const { schema, rows } = ops;
  const [sort, setSort] = useState<Sort>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; prop: Property | null } | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);

  const sorted = useMemo(() => {
    const list = [...rows].sort(byPosition);
    if (!sort) return list;
    const prop = sort.propId ? schema.properties.find((p) => p.id === sort.propId) ?? null : null;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const x = sortValue(a, prop);
      const y = sortValue(b, prop);
      return (x < y ? -1 : x > y ? 1 : 0) * sign;
    });
  }, [rows, sort, schema.properties]);

  const moveProp = (id: string, dir: -1 | 1) => {
    const list = [...schema.properties];
    const i = list.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    ops.saveSchema({ ...schema, properties: list });
  };

  const sortMark = (propId: string | null) =>
    sort && sort.propId === propId ? <span className="sort-mark">{sort.dir === 'asc' ? '↑' : '↓'}</span> : null;

  return (
    <div className="db-table-wrap">
      <table className="db-table">
        <thead>
          <tr>
            <th className="col-title">
              <button className="th-btn" onClick={(e) => setMenu({ anchor: e.currentTarget, prop: null })}>
                <span className="type-icon">𝐓</span><span className="prop-name">이름</span>{sortMark(null)}
              </button>
            </th>
            {schema.properties.map((p) => (
              <th key={p.id} className={`col-${p.type}`}>
                <button className="th-btn" onClick={(e) => setMenu({ anchor: e.currentTarget, prop: p })}>
                  <PropLabel prop={p} />{sortMark(p.id)}
                </button>
              </th>
            ))}
            <th className="col-add">
              <button className="th-btn add" title="속성 추가" onClick={(e) => setAddAnchor(e.currentTarget)}>＋</button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => <TableRow key={r.id} row={r} ops={ops} />)}
        </tbody>
      </table>
      {rows.length === 0 && <div className="db-empty">아직 항목이 없어요. 아래에서 새 항목을 만들어 보세요.</div>}
      <button className="db-add-row" onClick={() => ops.addRow({ position: (sorted[sorted.length - 1]?.position ?? 0) + 1 })}>
        ＋ 새 항목
      </button>

      {menu && (
        <PropertyMenu
          anchor={menu.anchor}
          prop={menu.prop}
          onClose={() => setMenu(null)}
          onSort={(dir) => setSort(dir ? { propId: menu.prop?.id ?? null, dir } : null)}
          {...(menu.prop
            ? {
                onRename: (name: string) => ops.updateProperty(menu.prop!.id, { name }),
                onChangeType: (type) => ops.changeType(menu.prop!.id, type),
                onMove: (dir) => moveProp(menu.prop!.id, dir),
                onDelete: () => ops.deleteProperty(menu.prop!.id),
              }
            : {})}
        />
      )}
      {addAnchor && <AddPropertyMenu anchor={addAnchor} onClose={() => setAddAnchor(null)} onAdd={ops.addProperty} />}
    </div>
  );
}

function TableRow({ row, ops }: { row: Row; ops: DbOps }) {
  const [title, setTitle] = useState(row.title);
  useEffect(() => setTitle(row.title), [row.title]);

  return (
    <tr>
      <td className="col-title">
        <div className="title-cell">
          {row.icon && <span className="row-icon">{row.icon}</span>}
          <input
            className="cell-input title"
            value={title}
            placeholder="제목 없음"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== row.title && ops.updateRow(row.id, { title })}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && (e.target as HTMLInputElement).blur()}
          />
          <button className="chip open-chip" onClick={() => ops.openRow(row.id)}>열기</button>
        </div>
      </td>
      {ops.schema.properties.map((p) => (
        <td key={p.id} className={`col-${p.type}`}>
          <PropEditor
            prop={p}
            value={row.props[p.id]}
            onChange={(v) => ops.updateRow(row.id, { props: { [p.id]: v } })}
            onOptionsChange={(o) => ops.setOptions(p.id, o)}
          />
        </td>
      ))}
      <td className="col-add" />
    </tr>
  );
}
