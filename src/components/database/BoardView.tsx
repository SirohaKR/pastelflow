import { useState, type DragEvent } from 'react';
import type { Property, Row, SelectOption } from '../../api';
import { between, byPosition, defaultBoardProp, findOption, newId, nextColor, rowTitle } from '../../database';
import { PropPreview, Tag } from './Cells';
import { asFiles, isImage } from './FileCell';
import type { DbOps } from './DatabaseView';

const NONE = '__none__';

export function BoardView({ ops }: { ops: DbOps }) {
  const { schema, rows } = ops;
  const group = defaultBoardProp(schema);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ col: string; before: string | null } | null>(null);
  const [newCol, setNewCol] = useState('');

  const selects = schema.properties.filter((p) => p.type === 'select');

  if (!group) {
    return (
      <div className="db-empty big">
        <p>칸반으로 보려면 <b>선택</b> 속성이 하나 있어야 해요.</p>
        <button className="btn" onClick={() => ops.addProperty('select', '상태')}>🏷️ 선택 속성 만들기</button>
      </div>
    );
  }

  const options = group.options ?? [];
  const columns: { key: string; option: SelectOption | null }[] = [
    ...options.map((o) => ({ key: o.id, option: o })),
    { key: NONE, option: null },
  ];
  const valueOf = (r: Row) => (findOption(group, r.props[group.id]) ? String(r.props[group.id]) : NONE);
  const cardsOf = (key: string) => rows.filter((r) => valueOf(r) === key).sort(byPosition);

  // 끌어다 놓은 곳에 맞춰 선택 값과 순서를 바꾼다
  const drop = (col: string, beforeId: string | null) => {
    const row = rows.find((r) => r.id === dragId);
    setDragId(null);
    setOver(null);
    if (!row) return;
    const list = cardsOf(col).filter((r) => r.id !== row.id);
    const idx = beforeId ? list.findIndex((r) => r.id === beforeId) : list.length;
    const at = idx < 0 ? list.length : idx;
    const position = between(list[at - 1], list[at]);
    const value = col === NONE ? null : col;
    if (valueOf(row) === col && position === row.position) return;
    ops.updateRow(row.id, { position, props: { [group.id]: value } });
  };

  const onColOver = (e: DragEvent, col: string, before: string | null) => {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    if (over?.col !== col || over.before !== before) setOver({ col, before });
  };

  const addColumn = () => {
    const name = newCol.trim();
    if (!name) return;
    ops.setOptions(group.id, [...options, { id: newId(), name, color: nextColor(options) }]);
    setNewCol('');
  };

  return (
    <div className="board-wrap">
      {selects.length > 1 && (
        <div className="view-setting">
          묶는 기준
          <select
            className="field small inline"
            value={group.id}
            onChange={(e) => ops.saveSchema({ ...schema, board: { groupBy: e.target.value } })}
          >
            {selects.map((p) => <option key={p.id} value={p.id}>{p.name || '이름 없음'}</option>)}
          </select>
        </div>
      )}
      <div className="board">
        {columns.map(({ key, option }) => {
          const cards = cardsOf(key);
          if (key === NONE && cards.length === 0 && !dragId) return null;
          return (
            <section
              key={key}
              className={`board-col ${over?.col === key ? 'drag-over' : ''}`}
              onDragOver={(e) => onColOver(e, key, null)}
              onDrop={(e) => { e.preventDefault(); drop(key, null); }}
            >
              <header className="board-head">
                {option ? <Tag option={option} /> : <span className="tag tag-none">미분류</span>}
                <span className="count">{cards.length}</span>
                <button
                  className="icon-btn"
                  title="이 칸에 새 항목"
                  onClick={() => ops.addRow({ props: option ? { [group.id]: option.id } : {}, position: (cards[cards.length - 1]?.position ?? 0) + 1 }, true)}
                >
                  ＋
                </button>
              </header>
              <div className="board-cards">
                {cards.map((r) => (
                  <Card
                    key={r.id}
                    row={r}
                    props={schema.properties.filter((p) => p.id !== group.id)}
                    dragging={dragId === r.id}
                    dropBefore={over?.col === key && over.before === r.id}
                    onOpen={() => ops.openRow(r.id)}
                    onDragStart={() => setDragId(r.id)}
                    onDragEnd={() => { setDragId(null); setOver(null); }}
                    onDragOver={(e) => onColOver(e, key, r.id)}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(key, r.id); }}
                  />
                ))}
                <button
                  className="board-add"
                  onClick={() => ops.addRow({ props: option ? { [group.id]: option.id } : {}, position: (cards[cards.length - 1]?.position ?? 0) + 1 }, true)}
                >
                  ＋ 새 항목
                </button>
              </div>
            </section>
          );
        })}
        <section className="board-col add-col">
          <input
            className="field small"
            placeholder="＋ 새 칸 이름"
            value={newCol}
            onChange={(e) => setNewCol(e.target.value)}
            onBlur={addColumn}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && addColumn()}
          />
        </section>
      </div>
    </div>
  );
}

type CardProps = {
  row: Row;
  props: Property[];
  dragging: boolean;
  dropBefore: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
};

function Card({ row, props, dragging, dropBefore, onOpen, onDragStart, onDragEnd, onDragOver, onDrop }: CardProps) {
  const shown = props.filter((p) => {
    const v = row.props[p.id];
    return v !== undefined && v !== false && v !== '';
  });
  // 파일 속성의 첫 이미지를 카드 위에 크게
  const cover = props.filter((p) => p.type === 'file').flatMap((p) => asFiles(row.props[p.id])).find(isImage);
  return (
    <div
      className={`card ${dragging ? 'dragging' : ''} ${dropBefore ? 'drop-before' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      {cover && <img className="card-cover" src={cover.url} alt="" loading="lazy" />}
      <div className={`card-title ${row.title.trim() ? '' : 'untitled'}`}>
        {row.icon && <span className="row-icon">{row.icon}</span>}
        {rowTitle(row)}
      </div>
      {shown.length > 0 && (
        <div className="card-props">
          {shown.filter((p) => !(cover && p.type === 'file' && asFiles(row.props[p.id]).every(isImage))).map((p) => <PropPreview key={p.id} prop={p} value={row.props[p.id]} />)}
        </div>
      )}
    </div>
  );
}
