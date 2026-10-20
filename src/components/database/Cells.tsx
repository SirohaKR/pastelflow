import { useEffect, useState } from 'react';
import type { Property, PropType, PropValue, SelectOption, TagColor } from '../../api';
import { findOption, formatDate, formatNumber, newId, nextColor, PROP_TYPES, TAG_COLORS, typeIcon } from '../../database';
import { Popover } from '../Popover';
import { asFiles, FileCell, FilePreview } from './FileCell';

export const Tag = ({ option, onRemove }: { option: SelectOption; onRemove?: () => void }) => (
  <span className={`tag tag-${option.color}`}>
    {option.name || '이름 없음'}
    {onRemove && (
      <button className="tag-x" aria-label="선택 지우기" onClick={(e) => { e.stopPropagation(); onRemove(); }}>✕</button>
    )}
  </span>
);

// 표 칸, 칸반 카드, 행 페이지에서 쓰는 속성 값 미리보기 (읽기 전용)
export function PropPreview({ prop, value }: { prop: Property; value: PropValue | undefined }) {
  if (prop.type === 'file') return <FilePreview files={asFiles(value)} />;
  if (Array.isArray(value)) return null;
  if (prop.type === 'select') {
    const opt = findOption(prop, value);
    return opt ? <Tag option={opt} /> : null;
  }
  if (prop.type === 'checkbox') return value === true ? <span className="check-mark">☑️ {prop.name}</span> : null;
  if (prop.type === 'date') return typeof value === 'string' ? <span className="prop-chip">📅 {formatDate(value)}</span> : null;
  if (prop.type === 'number') return typeof value === 'number' ? <span className="prop-chip"># {formatNumber(value)}</span> : null;
  return typeof value === 'string' && value ? <span className="prop-text">{value}</span> : null;
}

type EditorProps = {
  prop: Property;
  value: PropValue | undefined;
  onChange: (v: PropValue | null) => void;
  onOptionsChange: (options: SelectOption[]) => void;
  // 항목 패널처럼 넓은 곳 (파일을 크게 보여 줌)
  large?: boolean;
  readOnly?: boolean;
};

// 속성 값을 바로 고치는 칸. 텍스트·숫자는 칸을 벗어나거나 Enter 를 누르면 저장.
export function PropEditor({ prop, value, onChange, onOptionsChange, large = false, readOnly = false }: EditorProps) {
  const text = value == null || Array.isArray(value) ? '' : String(value);
  const [draft, setDraft] = useState(text);
  const [selectAnchor, setSelectAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => setDraft(text), [text]);

  if (prop.type === 'file') return <FileCell value={value} onChange={onChange} large={large} readOnly={readOnly} />;

  if (prop.type === 'checkbox') {
    return (
      <label className="cell-check">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      </label>
    );
  }

  if (prop.type === 'date') {
    return (
      <input
        className="cell-input"
        type="date"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || null)}
      />
    );
  }

  if (prop.type === 'select') {
    const opt = findOption(prop, value);
    return (
      <>
        <button className="cell-select" onClick={(e) => setSelectAnchor(e.currentTarget)}>
          {opt ? <Tag option={opt} /> : <span className="cell-empty">비어 있음</span>}
        </button>
        {selectAnchor && (
          <SelectMenu
            anchor={selectAnchor}
            prop={prop}
            value={typeof value === 'string' ? value : null}
            onClose={() => setSelectAnchor(null)}
            onPick={(id) => {
              onChange(id);
              setSelectAnchor(null);
            }}
            onOptionsChange={onOptionsChange}
          />
        )}
      </>
    );
  }

  const commit = () => {
    if (prop.type === 'number') {
      const t = draft.trim().replace(/,/g, '');
      if (!t) return onChange(null);
      const n = Number(t);
      if (Number.isFinite(n)) onChange(n);
      else setDraft(text);
      return;
    }
    if (draft !== text) onChange(draft || null);
  };

  return (
    <input
      className={`cell-input ${prop.type === 'number' ? 'num' : ''}`}
      inputMode={prop.type === 'number' ? 'decimal' : undefined}
      value={draft}
      placeholder="비어 있음"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(text);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

// 선택 속성: 옵션 고르기, 새로 만들기, 이름·색 바꾸기, 지우기
export function SelectMenu({
  anchor, prop, value, onClose, onPick, onOptionsChange,
}: {
  anchor: HTMLElement;
  prop: Property;
  value: string | null;
  onClose: () => void;
  onPick: (id: string | null) => void;
  onOptionsChange: (options: SelectOption[]) => void;
}) {
  const options = prop.options ?? [];
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const term = q.trim();
  const shown = term ? options.filter((o) => o.name.toLowerCase().includes(term.toLowerCase())) : options;
  const exact = options.find((o) => o.name === term);

  const create = () => {
    if (!term) return;
    if (exact) return onPick(exact.id);
    const opt: SelectOption = { id: newId(), name: term, color: nextColor(options) };
    onOptionsChange([...options, opt]);
    onPick(opt.id);
  };

  const patchOption = (id: string, patch: Partial<SelectOption>) =>
    onOptionsChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  return (
    <Popover anchor={anchor} onClose={onClose}>
      <div className="select-menu">
        <input
          className="field small"
          autoFocus
          placeholder="찾거나 새로 만들기…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (shown.length === 1 && !term) onPick(shown[0].id);
              else create();
            }
          }}
        />
        <div className="select-list">
          {value && (
            <button className="select-item muted" onClick={() => onPick(null)}>선택 지우기</button>
          )}
          {shown.map((o) => (
            <div key={o.id}>
              <div className={`select-item ${o.id === value ? 'on' : ''}`}>
                <button className="select-pick" onClick={() => onPick(o.id)}>
                  <Tag option={o} />
                </button>
                <button
                  className="icon-btn"
                  title="옵션 고치기"
                  onClick={() => setEditing(editing === o.id ? null : o.id)}
                >
                  ⋯
                </button>
              </div>
              {editing === o.id && (
                <div className="option-edit">
                  <input
                    className="field small"
                    defaultValue={o.name}
                    onBlur={(e) => e.target.value !== o.name && patchOption(o.id, { name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && (e.target as HTMLInputElement).blur()}
                  />
                  <div className="color-row">
                    {TAG_COLORS.map((c) => (
                      <button
                        key={c.key}
                        className={`color-dot tag-${c.key} ${o.color === c.key ? 'on' : ''}`}
                        title={c.label}
                        aria-label={c.label}
                        onClick={() => patchOption(o.id, { color: c.key as TagColor })}
                      />
                    ))}
                  </div>
                  <button
                    className="select-item danger"
                    onClick={() => {
                      onOptionsChange(options.filter((x) => x.id !== o.id));
                      setEditing(null);
                    }}
                  >
                    🗑️ 옵션 지우기
                  </button>
                </div>
              )}
            </div>
          ))}
          {term && !exact && (
            <button className="select-item" onClick={create}>
              <span className="muted">만들기</span>
              <Tag option={{ id: '', name: term, color: nextColor(options) }} />
            </button>
          )}
          {!term && options.length === 0 && <div className="select-hint">이름을 입력하고 Enter 를 눌러 옵션을 만들어요.</div>}
        </div>
      </div>
    </Popover>
  );
}

// 속성 머리글 메뉴: 이름, 종류, 정렬, 순서, 삭제
export function PropertyMenu({
  anchor, prop, onClose, onRename, onChangeType, onSort, onMove, onDelete,
}: {
  anchor: HTMLElement;
  prop: Property | null; // null 이면 '이름' 칸
  onClose: () => void;
  onRename?: (name: string) => void;
  onChangeType?: (type: PropType) => void;
  onSort?: (dir: 'asc' | 'desc' | null) => void;
  onMove?: (dir: -1 | 1) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(prop?.name ?? '');
  const done = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <Popover anchor={anchor} onClose={() => {
      if (prop && onRename && name !== prop.name) onRename(name);
      onClose();
    }}>
      <div className="menu prop-menu">
        {prop && onRename && (
          <input
            className="field small"
            autoFocus
            value={name}
            placeholder="속성 이름"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                onRename(name);
                onClose();
              }
            }}
          />
        )}
        {onSort && (
          <>
            <div className="menu-label">정렬</div>
            <button onClick={done(() => onSort('asc'))}>↑ 오름차순</button>
            <button onClick={done(() => onSort('desc'))}>↓ 내림차순</button>
            <button onClick={done(() => onSort(null))}>↕ 정렬 없애기</button>
          </>
        )}
        {prop && onChangeType && (
          <>
            <div className="menu-label">종류</div>
            {PROP_TYPES.map((t) => (
              <button key={t.type} className={prop.type === t.type ? 'on' : ''} onClick={done(() => onChangeType(t.type))}>
                <span className="type-icon">{t.icon}</span> {t.label}
                {prop.type === t.type && <span className="check">✓</span>}
              </button>
            ))}
          </>
        )}
        {prop && onMove && (
          <>
            <div className="menu-label">순서</div>
            <button onClick={done(() => onMove(-1))}>← 왼쪽으로</button>
            <button onClick={done(() => onMove(1))}>→ 오른쪽으로</button>
          </>
        )}
        {prop && onDelete && (
          <button className="danger" onClick={done(onDelete)}>🗑️ 속성 지우기</button>
        )}
      </div>
    </Popover>
  );
}

export const PropLabel = ({ prop }: { prop: Property }) => (
  <>
    <span className="type-icon">{typeIcon(prop.type)}</span>
    <span className="prop-name">{prop.name || '이름 없음'}</span>
  </>
);

export function AddPropertyMenu({ anchor, onClose, onAdd }: { anchor: HTMLElement; onClose: () => void; onAdd: (type: PropType) => void }) {
  return (
    <Popover anchor={anchor} onClose={onClose} align="right">
      <div className="menu">
        <div className="menu-label">새 속성 종류</div>
        {PROP_TYPES.map((t) => (
          <button key={t.type} onClick={() => { onAdd(t.type); onClose(); }}>
            <span className="type-icon">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>
    </Popover>
  );
}
