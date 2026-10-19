import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { welcomeContent } from './seed.js';

export function openDb(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'pastelflow.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      title TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      cover TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '[]',
      position REAL NOT NULL DEFAULT 0,
      favorite INTEGER NOT NULL DEFAULT 0,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(parent_id);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // 0.2.0: 페이지 종류(문서/데이터베이스/행), 행 속성 값, 데이터베이스 속성 정의
  const cols = new Set(db.prepare('PRAGMA table_info(pages)').all().map((c) => c.name));
  if (!cols.has('kind')) db.exec("ALTER TABLE pages ADD COLUMN kind TEXT NOT NULL DEFAULT 'page'");
  if (!cols.has('props')) db.exec("ALTER TABLE pages ADD COLUMN props TEXT NOT NULL DEFAULT '{}'");
  if (!cols.has('schema')) db.exec('ALTER TABLE pages ADD COLUMN schema TEXT');
  return db;
}

const LIST_COLUMNS = 'id, parent_id, kind, title, icon, cover, position, favorite, deleted_at, created_at, updated_at';
const ROW_COLUMNS = 'id, title, icon, props, position, created_at, updated_at';

const KINDS = ['page', 'database', 'row'];
const PROP_TYPES = ['text', 'select', 'date', 'checkbox', 'number'];
const TAG_COLORS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

const shortId = () => randomUUID().slice(0, 8);

// 새 데이터베이스에 처음 들어가는 속성과 보기 설정
function defaultSchema() {
  const status = shortId();
  const date = shortId();
  return {
    properties: [
      {
        id: status, name: '상태', type: 'select', options: [
          { id: shortId(), name: '할 일', color: 'p5' },
          { id: shortId(), name: '진행 중', color: 'p4' },
          { id: shortId(), name: '완료', color: 'p2' },
        ],
      },
      { id: date, name: '날짜', type: 'date' },
      { id: shortId(), name: '중요', type: 'checkbox' },
    ],
    board: { groupBy: status },
    calendar: { dateProp: date },
  };
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// 화면에서 보낸 속성 정의를 믿을 수 있는 모양으로 정리한다
function cleanSchema(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.properties)) throw httpError(400, '속성 정의가 올바르지 않아요.');
  const seen = new Set();
  const properties = [];
  for (const p of raw.properties.slice(0, 60)) {
    if (!p || typeof p.id !== 'string' || !p.id || seen.has(p.id) || !PROP_TYPES.includes(p.type)) continue;
    seen.add(p.id);
    const prop = { id: p.id.slice(0, 40), name: str(p.name, 100), type: p.type };
    if (p.type === 'select') {
      prop.options = (Array.isArray(p.options) ? p.options : [])
        .filter((o) => o && typeof o.id === 'string' && o.id)
        .slice(0, 100)
        .map((o) => ({ id: o.id.slice(0, 40), name: str(o.name, 100), color: TAG_COLORS.includes(o.color) ? o.color : 'p1' }));
    }
    properties.push(prop);
  }
  const pick = (id, type) => (properties.some((p) => p.id === id && p.type === type) ? id : null);
  return {
    properties,
    board: { groupBy: pick(raw.board?.groupBy, 'select') },
    calendar: { dateProp: pick(raw.calendar?.dateProp, 'date') },
  };
}

// 행 속성 값은 문자열, 숫자, 참/거짓만 받는다. null 이나 빈 문자열이면 값을 지운다.
function mergeProps(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw httpError(400, '속성 값이 올바르지 않아요.');
  const next = { ...current };
  for (const [key, value] of Object.entries(patch).slice(0, 100)) {
    const k = key.slice(0, 40);
    if (value === null || value === '') delete next[k];
    else if (typeof value === 'string') next[k] = value.slice(0, 2000);
    else if (typeof value === 'boolean') next[k] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) next[k] = value;
  }
  return next;
}

function toRow(row) {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    props: JSON.parse(row.props),
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPage(row, withContent = false) {
  if (!row) return null;
  const page = {
    id: row.id,
    parentId: row.parent_id,
    kind: row.kind,
    title: row.title,
    icon: row.icon,
    cover: row.cover,
    position: row.position,
    favorite: !!row.favorite,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (withContent) {
    page.content = JSON.parse(row.content);
    if (row.kind === 'database') page.schema = row.schema ? JSON.parse(row.schema) : defaultSchema();
    if (row.kind === 'row') page.props = JSON.parse(row.props);
  }
  return page;
}

export function createRepo(db) {
  const stmt = {
    // 데이터베이스 행은 사이드바에 보이지 않는다 (휴지통에 들어간 행만 함께 내려준다)
    list: db.prepare(`SELECT ${LIST_COLUMNS} FROM pages WHERE kind != 'row' OR deleted_at IS NOT NULL ORDER BY position, created_at`),
    rows: db.prepare(`SELECT ${ROW_COLUMNS} FROM pages WHERE parent_id = ? AND kind = 'row' AND deleted_at IS NULL ORDER BY position, created_at`),
    get: db.prepare('SELECT * FROM pages WHERE id = ?'),
    children: db.prepare('SELECT id FROM pages WHERE parent_id = ?'),
    maxPos: db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM pages WHERE parent_id IS ?'),
    insert: db.prepare(`INSERT INTO pages (id, parent_id, kind, title, icon, cover, content, props, schema, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    setDeleted: db.prepare('UPDATE pages SET deleted_at = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM pages WHERE id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM pages'),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    putSetting: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  };

  // 하위 페이지까지 포함한 id 목록 (자기 자신 포함)
  function subtree(id) {
    const ids = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      ids.push(cur);
      for (const r of stmt.children.all(cur)) stack.push(r.id);
    }
    return ids;
  }

  const repo = {
    list: () => stmt.list.all().map((r) => toPage(r)),
    get: (id) => toPage(stmt.get.get(id), true),

    create({ parentId = null, kind = 'page', title = '', icon = '', cover = '', content = [], props = {}, position } = {}) {
      if (!KINDS.includes(kind)) throw httpError(400, '알 수 없는 페이지 종류예요.');
      const parent = parentId ? stmt.get.get(parentId) : null;
      if (parentId && !parent) throw httpError(400, '상위 페이지가 없습니다.');
      if (kind === 'row' && parent?.kind !== 'database') throw httpError(400, '행은 데이터베이스 안에만 만들 수 있어요.');
      if (kind !== 'row' && parent && parent.kind !== 'page') throw httpError(400, '데이터베이스 안에는 하위 페이지를 만들 수 없어요.');
      const id = randomUUID();
      const now = Date.now();
      const pos = typeof position === 'number' && Number.isFinite(position) ? position : stmt.maxPos.get(parentId).m + 1;
      const schema = kind === 'database' ? JSON.stringify(defaultSchema()) : null;
      const rowProps = kind === 'row' ? JSON.stringify(mergeProps({}, props)) : '{}';
      stmt.insert.run(id, parentId, kind, str(title, 300), icon, cover, JSON.stringify(content), rowProps, schema, pos, now, now);
      return repo.get(id);
    },

    database(id) {
      const page = repo.get(id);
      if (!page || page.kind !== 'database') throw httpError(404, '데이터베이스를 찾을 수 없어요.');
      return { ...page, rows: stmt.rows.all(id).map(toRow) };
    },

    update(id, patch) {
      const cur = stmt.get.get(id);
      if (!cur) throw httpError(404, '페이지를 찾을 수 없습니다.');
      const fields = [];
      const values = [];
      const set = (col, val) => { fields.push(`${col} = ?`); values.push(val); };

      if (typeof patch.title === 'string') set('title', patch.title.slice(0, 300));
      if (typeof patch.icon === 'string') set('icon', patch.icon.slice(0, 32));
      if (typeof patch.cover === 'string') set('cover', patch.cover.slice(0, 500));
      if (Array.isArray(patch.content)) set('content', JSON.stringify(patch.content));
      if (typeof patch.favorite === 'boolean') set('favorite', patch.favorite ? 1 : 0);
      if (typeof patch.position === 'number' && Number.isFinite(patch.position)) set('position', patch.position);
      if (patch.schema !== undefined) {
        if (cur.kind !== 'database') throw httpError(400, '데이터베이스가 아니에요.');
        set('schema', JSON.stringify(cleanSchema(patch.schema)));
      }
      if (patch.props !== undefined) {
        if (cur.kind !== 'row') throw httpError(400, '데이터베이스 행이 아니에요.');
        set('props', JSON.stringify(mergeProps(JSON.parse(cur.props), patch.props)));
      }
      // 행은 다른 곳으로 옮기지 않는다
      if ('parentId' in patch && cur.kind !== 'row') {
        const parentId = patch.parentId || null;
        if (parentId) {
          const parent = stmt.get.get(parentId);
          if (!parent) throw httpError(400, '상위 페이지가 없습니다.');
          if (parent.kind !== 'page') throw httpError(400, '데이터베이스 안으로는 옮길 수 없어요.');
          if (subtree(id).includes(parentId)) throw httpError(400, '자기 자신이나 하위 페이지 안으로는 옮길 수 없습니다.');
        }
        set('parent_id', parentId);
      }
      if (!fields.length) return repo.get(id);
      set('updated_at', Date.now());
      db.prepare(`UPDATE pages SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
      return repo.get(id);
    },

    trash(id) {
      if (!stmt.get.get(id)) throw httpError(404, '페이지를 찾을 수 없습니다.');
      const now = Date.now();
      for (const pid of subtree(id)) {
        const row = stmt.get.get(pid);
        if (row.deleted_at == null) stmt.setDeleted.run(now, pid);
      }
    },

    restore(id) {
      const row = stmt.get.get(id);
      if (!row) throw httpError(404, '페이지를 찾을 수 없습니다.');
      // 상위 페이지가 휴지통에 있으면 최상위로 꺼낸다
      if (row.parent_id) {
        const parent = stmt.get.get(row.parent_id);
        if (row.kind === 'row' && (!parent || parent.deleted_at != null)) {
          throw httpError(400, '이 행이 들어 있던 데이터베이스를 먼저 되돌려 주세요.');
        }
        if (!parent || parent.deleted_at != null) {
          db.prepare('UPDATE pages SET parent_id = NULL WHERE id = ?').run(id);
        }
      }
      for (const pid of subtree(id)) stmt.setDeleted.run(null, pid);
    },

    destroy(id) {
      const ids = subtree(id).reverse();
      for (const pid of ids) stmt.remove.run(pid);
    },

    emptyTrash() {
      const trashed = db.prepare('SELECT id FROM pages WHERE deleted_at IS NOT NULL').all();
      for (const r of trashed) if (stmt.get.get(r.id)) repo.destroy(r.id);
    },

    getSettings() {
      const row = stmt.getSetting.get('ui');
      return row ? JSON.parse(row.value) : {};
    },
    putSettings(value) {
      stmt.putSetting.run('ui', JSON.stringify(value));
      return value;
    },
    getSecret() {
      return stmt.getSetting.get('session_secret')?.value;
    },
    putSecret(value) {
      stmt.putSetting.run('session_secret', value);
    },
  };

  if (stmt.count.get().n === 0) {
    repo.create({ title: '파스텔플로우에 오신 걸 환영해요', icon: '🌷', cover: '#e5dcfb', content: welcomeContent });
  }

  return repo;
}

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
