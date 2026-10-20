import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Database, type Property, type PropType, type PropValue, type Props, type Row, type Schema, type SelectOption } from '../../api';
import type { SaveState } from '../../useAutosave';
import { convertValue, newId, nextColor, PROP_TYPES, VIEWS, type ViewKind } from '../../database';
import { AddPropertyMenu } from './Cells';
import { TableView } from './TableView';
import { BoardView } from './BoardView';
import { CalendarView } from './CalendarView';
import { TimelineView } from './TimelineView';
import { RowPeek } from './RowPeek';

export type RowPatch = { title?: string; icon?: string; props?: Record<string, PropValue | null>; position?: number };

// 세 가지 보기가 함께 쓰는 데이터와 조작 함수
export type DbOps = {
  schema: Schema;
  rows: Row[];
  updateRow: (id: string, patch: RowPatch) => void;
  addRow: (init?: { title?: string; props?: Props; position?: number }, open?: boolean) => Promise<Row | undefined>;
  openRow: (id: string) => void;
  saveSchema: (next: Schema) => void;
  setOptions: (propId: string, options: SelectOption[]) => void;
  addProperty: (type: PropType, name?: string) => Property;
  updateProperty: (id: string, patch: Partial<Property>) => void;
  changeType: (id: string, type: PropType) => void;
  deleteProperty: (id: string) => void;
  readOnly?: boolean;
};

type Props_ = {
  dbId: string;
  dark: boolean;
  dataVersion: number;
  onSaveState: (s: SaveState) => void;
  onError: (msg: string) => void;
  onPagesChanged: () => void;
  // 내 권한 단계 (2 미만이면 보기만, 3 미만이면 항목 지우기 불가)
  access: number;
};

function loadView(dbId: string): ViewKind {
  try {
    const v = localStorage.getItem(`pf-view-${dbId}`);
    if (v === 'table' || v === 'board' || v === 'calendar' || v === 'timeline') return v;
  } catch {
    /* 무시 */
  }
  return 'table';
}

export function DatabaseView({ dbId, dark, dataVersion, onSaveState, onError, onPagesChanged, access }: Props_) {
  const readOnly = access < 2;
  const [db, setDb] = useState<Database | null>(null);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [view, setView] = useState<ViewKind>(() => loadView(dbId));
  const [query, setQuery] = useState('');
  const [peekId, setPeekId] = useState<string | null>(null);
  const [addPropAnchor, setAddPropAnchor] = useState<HTMLElement | null>(null);
  const schemaRef = useRef<Schema | null>(null);
  schemaRef.current = schema;
  const rowsRef = useRef<Row[]>([]);
  rowsRef.current = rows;

  useEffect(() => {
    let alive = true;
    api.getDatabase(dbId).then((d) => {
      if (!alive) return;
      setDb(d);
      setSchema(d.schema);
      setRows(d.rows);
    }).catch((e) => alive && onError(e.message));
    return () => {
      alive = false;
    };
  }, [dbId, dataVersion, onError]);

  const pickView = (v: ViewKind) => {
    setView(v);
    try {
      localStorage.setItem(`pf-view-${dbId}`, v);
    } catch {
      /* 무시 */
    }
  };

  // 저장 요청을 보내고 결과를 위쪽 '저장됨' 표시에 반영한다
  const inFlight = useRef(0);
  const track = useCallback(<T,>(p: Promise<T>) => {
    inFlight.current += 1;
    onSaveState('saving');
    return p
      .then((r) => {
        inFlight.current -= 1;
        if (!inFlight.current) onSaveState('saved');
        return r;
      })
      .catch((e) => {
        inFlight.current -= 1;
        onSaveState('error');
        onError(e.message);
        return undefined;
      });
  }, [onSaveState, onError]);

  const saveSchema = useCallback((next: Schema) => {
    schemaRef.current = next;
    setSchema(next);
    track(api.updatePage(dbId, { schema: next }));
  }, [dbId, track]);

  const patchLocal = useCallback((id: string, patch: RowPatch) => {
    setRows((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      const props = { ...r.props };
      for (const [k, v] of Object.entries(patch.props ?? {})) {
        if (v === null || v === '') delete props[k];
        else props[k] = v;
      }
      return {
        ...r,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
        props,
        updatedAt: Date.now(),
      };
    }));
  }, []);

  const updateRow = useCallback((id: string, patch: RowPatch) => {
    patchLocal(id, patch);
    track(api.updatePage(id, patch));
  }, [patchLocal, track]);

  const addRow = useCallback(async (init: { title?: string; props?: Props; position?: number } = {}, open = false) => {
    const page = await track(api.createRow(dbId, init));
    if (!page) return undefined;
    const row: Row = {
      id: page.id, title: page.title, icon: page.icon, props: page.props ?? {},
      position: page.position, createdAt: page.createdAt, updatedAt: page.updatedAt,
    };
    setRows((rs) => [...rs, row]);
    if (open) setPeekId(row.id);
    return row;
  }, [dbId, track]);

  const deleteRow = async (id: string) => {
    setPeekId(null);
    setRows((rs) => rs.filter((r) => r.id !== id));
    await track(api.trashPage(id));
    onPagesChanged();
  };

  const updateProperty = useCallback((id: string, patch: Partial<Property>) => {
    const s = schemaRef.current;
    if (!s) return;
    saveSchema({ ...s, properties: s.properties.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }, [saveSchema]);

  const setOptions = useCallback((propId: string, options: SelectOption[]) => updateProperty(propId, { options }), [updateProperty]);

  const addProperty = useCallback((type: PropType, name?: string) => {
    const s = schemaRef.current!;
    const label = name ?? PROP_TYPES.find((t) => t.type === type)!.label;
    const prop: Property = { id: newId(), name: label, type, ...(type === 'select' ? { options: [] } : {}) };
    const next: Schema = { ...s, properties: [...s.properties, prop] };
    if (type === 'select' && !next.board.groupBy) next.board = { groupBy: prop.id };
    if (type === 'date' && !next.calendar.dateProp) next.calendar = { dateProp: prop.id };
    saveSchema(next);
    return prop;
  }, [saveSchema]);

  // 종류를 바꾸면 행마다 값을 새 종류에 맞게 바꿔서 저장한다
  const changeType = useCallback((id: string, type: PropType) => {
    const s = schemaRef.current!;
    const prop = s.properties.find((p) => p.id === id);
    if (!prop || prop.type === type) return;
    let options: SelectOption[] = [];
    if (type === 'select') {
      const names = new Set<string>();
      for (const r of rowsRef.current) {
        const v = r.props[id];
        const text = prop.type === 'select' ? '' : typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
        if (text) names.add(text.slice(0, 100));
      }
      for (const n of [...names].slice(0, 50)) options.push({ id: newId(), name: n, color: nextColor(options) });
      if (prop.type === 'select') options = prop.options ?? [];
    }
    const nextProp: Property = { id, name: prop.name, type, ...(type === 'select' ? { options } : {}) };
    saveSchema({ ...s, properties: s.properties.map((p) => (p.id === id ? nextProp : p)) });
    if (prop.type === 'select' && type === 'select') return;
    for (const r of rowsRef.current) {
      if (r.props[id] === undefined) continue;
      const v = convertValue(r.props[id], prop, type, options);
      updateRow(r.id, { props: { [id]: v } });
    }
  }, [saveSchema, updateRow]);

  const deleteProperty = useCallback((id: string) => {
    const s = schemaRef.current!;
    const prop = s.properties.find((p) => p.id === id);
    if (!prop || !confirm(`'${prop.name || '이름 없음'}' 속성을 지울까요? 모든 항목에서 이 값이 사라져요.`)) return;
    saveSchema({ ...s, properties: s.properties.filter((p) => p.id !== id) });
    for (const r of rowsRef.current) if (r.props[id] !== undefined) updateRow(r.id, { props: { [id]: null } });
  }, [saveSchema, updateRow]);

  const visibleRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term || !schema) return rows;
    return rows.filter((r) => {
      if (r.title.toLowerCase().includes(term)) return true;
      return schema.properties.some((p) => {
        const v = r.props[p.id];
        if (p.type === 'select') return p.options?.find((o) => o.id === v)?.name.toLowerCase().includes(term);
        return (p.type === 'text' || p.type === 'number') && v != null && String(v).toLowerCase().includes(term);
      });
    });
  }, [rows, schema, query]);

  if (!db || !schema) return <div className="db-loading">데이터베이스를 불러오는 중…</div>;

  // 보기 전용이면 고치는 동작을 막고 알려 준다 (서버에서도 막는다)
  const denied = () => onError('보기 전용이라 고칠 수 없어요.');
  const ops: DbOps = readOnly
    ? {
      schema, rows: visibleRows, openRow: setPeekId,
      updateRow: denied, addRow: async () => { denied(); return undefined; }, saveSchema: denied, setOptions: denied,
      addProperty: (type) => { denied(); return { id: '', name: '', type }; }, updateProperty: denied, changeType: denied, deleteProperty: denied,
      readOnly: true,
    }
    : {
      schema, rows: visibleRows, updateRow, addRow, openRow: setPeekId, saveSchema, setOptions,
      addProperty, updateProperty, changeType, deleteProperty,
    };
  const peekRow = rows.find((r) => r.id === peekId);

  return (
    <div className={`db ${readOnly ? 'readonly' : ''}`}>
      <div className="db-toolbar">
        <div className="db-tabs" role="tablist">
          {VIEWS.map((v) => (
            <button key={v.key} role="tab" aria-selected={view === v.key} className={`db-tab ${view === v.key ? 'on' : ''}`} onClick={() => pickView(v.key)}>
              <span className="db-tab-icon">{v.icon}</span> {v.label}
            </button>
          ))}
        </div>
        <div className="db-tools">
          <input className="field small db-search" placeholder="🔍 항목 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
          {!readOnly && (
            <>
              <button className="btn ghost" onClick={(e) => setAddPropAnchor(e.currentTarget)}>＋ 속성</button>
              <button className="btn" onClick={() => addRow({}, true)}>＋ 새 항목</button>
            </>
          )}
        </div>
      </div>

      {view === 'table' && <TableView ops={ops} />}
      {view === 'board' && <BoardView ops={ops} />}
      {view === 'calendar' && <CalendarView ops={ops} />}
      {view === 'timeline' && <TimelineView ops={ops} />}

      {addPropAnchor && <AddPropertyMenu anchor={addPropAnchor} onClose={() => setAddPropAnchor(null)} onAdd={addProperty} />}

      {peekRow && (
        <RowPeek
          key={peekRow.id}
          row={peekRow}
          ops={ops}
          dark={dark}
          onLocalChange={patchLocal}
          onClose={() => setPeekId(null)}
          onDelete={() => deleteRow(peekRow.id)}
          access={access}
          onSaveState={onSaveState}
          onError={onError}
        />
      )}
    </div>
  );
}
