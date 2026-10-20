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
  // 0.5.0: 개인 페이지 주인 (NULL 이면 공용), 동시 편집 문서 상태
  if (!cols.has('private_owner')) db.exec('ALTER TABLE pages ADD COLUMN private_owner TEXT');
  if (!cols.has('ydoc')) db.exec('ALTER TABLE pages ADD COLUMN ydoc BLOB');
  // 0.6.0: 스페이스 (멤버만 보는 공용 구역)
  if (!cols.has('space_id')) db.exec('ALTER TABLE pages ADD COLUMN space_id TEXT');
  // 0.7.0: 관리자만 편집 (하위 페이지에도 적용)
  if (!cols.has('locked')) db.exec('ALTER TABLE pages ADD COLUMN locked INTEGER NOT NULL DEFAULT 0');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pages_space ON pages(space_id);
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'p1',
      position REAL NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS space_members (
      space_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      PRIMARY KEY (space_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_space_members_user ON space_members(user_id);
    -- 0.7.1: 즐겨찾기는 사람마다 따로 (pages.favorite 는 예전 값을 옮기기 전까지만 쓴다)
    CREATE TABLE IF NOT EXISTS favorites (
      user_id TEXT NOT NULL,
      page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, page_id)
    );
    CREATE INDEX IF NOT EXISTS idx_favorites_page ON favorites(page_id);
  `);
  return db;
}

// 즐겨찾기는 요청한 사람 기준 (uid 를 한 번 넘긴다)
const LIST_COLUMNS = 'id, parent_id, kind, title, icon, cover, position, EXISTS (SELECT 1 FROM favorites f WHERE f.user_id = ? AND f.page_id = pages.id) AS favorite, deleted_at, created_at, updated_at, private_owner, space_id, locked';

// 권한 단계: 보기 < 편집 < 편집·삭제 < 관리
export const VIEW = 1;
export const EDIT = 2;
export const DELETE = 3;
export const MANAGE = 4;
const ROLE_LEVEL = { admin: MANAGE, owner: MANAGE, full: DELETE, edit: EDIT, view: VIEW };
const DENIED = {
  [EDIT]: '이 문서를 고칠 권한이 없어요.',
  [DELETE]: '이 문서를 지울 권한이 없어요.',
  [MANAGE]: '관리자만 할 수 있어요.',
};

// 볼 수 있는 페이지 조건 (uid 를 두 번 넘긴다): 내 개인 페이지이거나, 전체 공용이거나, 내가 멤버인 스페이스
export const VISIBLE_SQL = `(private_owner = ? OR (private_owner IS NULL AND (space_id IS NULL
  OR space_id IN (SELECT space_id FROM space_members WHERE user_id = ?))))`;
const ROW_COLUMNS = 'id, title, icon, props, position, created_at, updated_at';

const KINDS = ['page', 'database', 'row'];
const PROP_TYPES = ['text', 'select', 'date', 'checkbox', 'number'];
const TAG_COLORS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

const shortId = () => randomUUID().slice(0, 8);

// 새 데이터베이스에 처음 들어가는 속성과 보기 설정
function defaultSchema() {
  const status = shortId();
  const date = shortId();
  const end = shortId();
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
      { id: end, name: '마감일', type: 'date' },
      { id: shortId(), name: '중요', type: 'checkbox' },
    ],
    board: { groupBy: status },
    calendar: { dateProp: date },
    timeline: { startProp: date, endProp: end, groupBy: status },
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
    timeline: {
      startProp: pick(raw.timeline?.startProp, 'date'),
      endProp: pick(raw.timeline?.endProp, 'date'),
      groupBy: pick(raw.timeline?.groupBy, 'select'),
    },
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
    favorite: false,
    private: row.private_owner != null,
    spaceId: row.space_id ?? null,
    locked: !!row.locked,
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
    list: db.prepare(`SELECT ${LIST_COLUMNS} FROM pages
      WHERE (kind != 'row' OR deleted_at IS NOT NULL) AND ${VISIBLE_SQL}
      ORDER BY position, created_at`),
    rows: db.prepare(`SELECT ${ROW_COLUMNS} FROM pages WHERE parent_id = ? AND kind = 'row' AND deleted_at IS NULL ORDER BY position, created_at`),
    get: db.prepare('SELECT * FROM pages WHERE id = ?'),
    children: db.prepare('SELECT id FROM pages WHERE parent_id = ?'),
    maxPos: db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM pages WHERE parent_id IS ?'),
    insert: db.prepare(`INSERT INTO pages (id, parent_id, kind, title, icon, cover, content, props, schema, position, created_at, updated_at, private_owner, space_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    setScope: db.prepare('UPDATE pages SET private_owner = ?, space_id = ? WHERE id = ?'),
    isMember: db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?'),
    setDeleted: db.prepare('UPDATE pages SET deleted_at = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM pages WHERE id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM pages'),
    isFav: db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND page_id = ?'),
    addFav: db.prepare('INSERT OR IGNORE INTO favorites (user_id, page_id, created_at) VALUES (?, ?, ?)'),
    removeFav: db.prepare('DELETE FROM favorites WHERE user_id = ? AND page_id = ?'),
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

  // 볼 수 있는 페이지인가 (공용이거나 내 개인 페이지)
  const isMember = (spaceId, uid) => !!uid && !!stmt.isMember.get(spaceId, uid);
  const visible = (row, uid) => {
    if (!row) return false;
    if (row.private_owner != null) return row.private_owner === uid;
    return row.space_id == null || isMember(row.space_id, uid);
  };
  // 최상위에 놓을 자리(전체 공용 / 스페이스 / 내 페이지)
  function rootScope({ private: isPrivate, spaceId }, uid) {
    if (isPrivate) return { owner: uid, space: null };
    if (spaceId) {
      if (!isMember(spaceId, uid)) throw httpError(403, '그 스페이스의 멤버가 아니에요.');
      return { owner: null, space: spaceId };
    }
    return { owner: null, space: null };
  }
  // ── 권한 ──
  const siteRole = (uid) => (uid ? db.prepare('SELECT role FROM users WHERE id = ? AND disabled = 0').get(uid)?.role ?? null : null);
  // 자리(개인 / 스페이스 / 전체 공용)에서의 내 권한 단계
  function scopeLevel(owner, space, uid) {
    if (owner != null) return owner === uid ? MANAGE : 0;
    const site = siteRole(uid);
    if (site === 'admin') return MANAGE;
    if (space != null) return ROLE_LEVEL[stmt.isMember.get(space, uid)?.role] ?? 0;
    return ROLE_LEVEL[site] ?? 0;
  }
  // 자기나 상위 페이지 중 하나라도 잠겼는지
  function lockedChain(row, get = (id) => stmt.get.get(id)) {
    let cur = row;
    for (let i = 0; cur && i < 100; i++) {
      if (cur.locked) return true;
      cur = cur.parent_id ? get(cur.parent_id) : null;
    }
    return false;
  }
  // 이 페이지에서의 내 권한 단계 (잠긴 문서는 관리자가 아니면 보기만)
  function levelFor(row, uid, base = scopeLevel(row.private_owner, row.space_id, uid), locked = lockedChain(row)) {
    return locked && base < MANAGE ? Math.min(base, VIEW) : base;
  }
  function need(row, uid, level) {
    if (levelFor(row, uid) < level) throw httpError(403, DENIED[level]);
  }
  function needScope(scope, uid, level) {
    if (scopeLevel(scope.owner, scope.space, uid) < level) throw httpError(403, DENIED[level]);
  }
  // 화면에 알려 줄 권한 정보
  const withAccess = (page, row, uid, base, locked) => ({ ...page, lockedAny: locked, access: levelFor(row, uid, base, locked) });

  function access(id, uid) {
    const row = stmt.get.get(id);
    if (!visible(row, uid)) throw httpError(404, '페이지를 찾을 수 없습니다.');
    return row;
  }
  const view = (id) => toPage(stmt.get.get(id), true);
  const viewFor = (id, uid) => {
    const row = stmt.get.get(id);
    const page = { ...toPage(row, true), favorite: !!uid && !!stmt.isFav.get(uid, id) };
    return withAccess(page, row, uid, scopeLevel(row.private_owner, row.space_id, uid), lockedChain(row));
  };

  const repo = {
    list(uid) {
      const rows = stmt.list.all(uid, uid, uid);
      const byId = new Map(rows.map((r) => [r.id, r]));
      const get = (id) => byId.get(id) ?? stmt.get.get(id);
      const levels = new Map();
      return rows.map((r) => {
        const key = `${r.private_owner}|${r.space_id}`;
        if (!levels.has(key)) levels.set(key, scopeLevel(r.private_owner, r.space_id, uid));
        return withAccess({ ...toPage(r), favorite: !!r.favorite }, r, uid, levels.get(key), lockedChain(r, get));
      });
    },
    get: (id, uid) => (visible(stmt.get.get(id), uid) ? viewFor(id, uid) : null),
    canAccess: (id, uid) => visible(stmt.get.get(id), uid),
    canEdit: (id, uid) => {
      const row = stmt.get.get(id);
      return visible(row, uid) && levelFor(row, uid) >= EDIT;
    },
    // 그 자리(전체 공용 / 스페이스)에서의 내 권한 단계
    scopeLevel: (space, uid) => scopeLevel(null, space ?? null, uid),
    // 권한 확인 없이 (동시 편집 서버가 이미 확인한 뒤 쓴다)
    getRaw: (id) => view(id),

    // private: 최상위에 만들 때 개인 페이지로 만들지. 하위 페이지는 부모를 따른다
    create({ parentId = null, kind = 'page', title = '', icon = '', cover = '', content = [], props = {}, position, private: isPrivate = false, spaceId = null } = {}, uid = null) {
      if (!KINDS.includes(kind)) throw httpError(400, '알 수 없는 페이지 종류예요.');
      const parent = parentId ? stmt.get.get(parentId) : null;
      if (parentId && !visible(parent, uid)) throw httpError(400, '상위 페이지가 없습니다.');
      if (kind === 'row' && parent?.kind !== 'database') throw httpError(400, '행은 데이터베이스 안에만 만들 수 있어요.');
      if (kind !== 'row' && parent && parent.kind !== 'page') throw httpError(400, '데이터베이스 안에는 하위 페이지를 만들 수 없어요.');
      const id = randomUUID();
      const now = Date.now();
      const pos = typeof position === 'number' && Number.isFinite(position) ? position : stmt.maxPos.get(parentId).m + 1;
      const schema = kind === 'database' ? JSON.stringify(defaultSchema()) : null;
      const rowProps = kind === 'row' ? JSON.stringify(mergeProps({}, props)) : '{}';
      const scope = parent ? { owner: parent.private_owner, space: parent.space_id } : rootScope({ private: isPrivate && !!uid, spaceId }, uid);
      // uid 가 없으면 서버가 직접 만드는 것 (첫 실행 안내 페이지)
      if (uid != null) {
        if (parent) need(parent, uid, EDIT);
        else needScope(scope, uid, EDIT);
      }
      stmt.insert.run(id, parentId, kind, str(title, 300), icon, cover, JSON.stringify(content), rowProps, schema, pos, now, now, scope.owner, scope.space);
      return viewFor(id, uid);
    },

    // 홈 위젯이 쓰는 모든 데이터베이스 (휴지통 제외)와 행
    allDatabases(uid) {
      const dbs = db.prepare(`SELECT * FROM pages WHERE kind = 'database' AND deleted_at IS NULL
        AND ${VISIBLE_SQL} ORDER BY position, created_at`).all(uid, uid);
      return dbs.map((row) => {
        const page = toPage(row, true);
        return { id: page.id, title: page.title, icon: page.icon, schema: page.schema, rows: stmt.rows.all(page.id).map(toRow) };
      });
    },

    database(id, uid) {
      const page = repo.get(id, uid);
      if (!page || page.kind !== 'database') throw httpError(404, '데이터베이스를 찾을 수 없어요.');
      // (page 에 access·lockedAny 가 들어 있다)
      return { ...page, rows: stmt.rows.all(id).map(toRow) };
    },

    update(id, patch, uid) {
      const cur = access(id, uid);
      let owner = cur.private_owner;
      let space = cur.space_id;
      // 최상위로 옮길 때 자리를 정했는지 (private 또는 spaceId)
      const placed = typeof patch.private === 'boolean' || 'spaceId' in patch;
      // 즐겨찾기만 바꾸는 건 보기 권한으로도 된다. 잠금은 관리자만, 나머지는 편집 권한
      const keys = Object.keys(patch);
      if (keys.some((k) => k !== 'favorite' && k !== 'locked')) need(cur, uid, EDIT);
      const fields = [];
      const values = [];
      const set = (col, val) => { fields.push(`${col} = ?`); values.push(val); };

      if (typeof patch.title === 'string') set('title', patch.title.slice(0, 300));
      if (typeof patch.icon === 'string') set('icon', patch.icon.slice(0, 32));
      if (typeof patch.cover === 'string') set('cover', patch.cover.slice(0, 500));
      if (Array.isArray(patch.content)) {
        set('content', JSON.stringify(patch.content));
        // 본문을 통째로 바꾸면 동시 편집 상태는 다음에 열 때 새로 만든다
        set('ydoc', null);
      }
      // 즐겨찾기는 내 목록에만 넣고 뺀다 (페이지 수정 시각은 그대로)
      if (typeof patch.favorite === 'boolean') {
        if (patch.favorite) stmt.addFav.run(uid, id, Date.now());
        else stmt.removeFav.run(uid, id);
      }
      if (typeof patch.locked === 'boolean') {
        if (scopeLevel(cur.private_owner, cur.space_id, uid) < MANAGE) throw httpError(403, DENIED[MANAGE]);
        set('locked', patch.locked ? 1 : 0);
      }
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
          if (!visible(parent, uid)) throw httpError(400, '상위 페이지가 없습니다.');
          if (parent.kind !== 'page') throw httpError(400, '데이터베이스 안으로는 옮길 수 없어요.');
          if (subtree(id).includes(parentId)) throw httpError(400, '자기 자신이나 하위 페이지 안으로는 옮길 수 없습니다.');
          need(parent, uid, EDIT);
          owner = parent.private_owner;
          space = parent.space_id;
        } else if (placed) {
          ({ owner, space } = rootScope({ private: patch.private === true, spaceId: patch.spaceId || null }, uid));
          needScope({ owner, space }, uid, EDIT);
        } else {
          needScope({ owner, space }, uid, EDIT);
        }
        set('parent_id', parentId);
      } else if (placed && !cur.parent_id && cur.kind !== 'row') {
        // 최상위 페이지를 다른 자리(전체 공용 / 스페이스 / 내 페이지)로 옮기기
        ({ owner, space } = rootScope({ private: patch.private === true, spaceId: patch.spaceId || null }, uid));
        needScope({ owner, space }, uid, EDIT);
      }
      const moved = owner !== cur.private_owner || space !== cur.space_id;
      if (moved) {
        // 하위 페이지·데이터베이스 항목도 같이 옮긴다
        for (const pid of subtree(id)) stmt.setScope.run(owner, space, pid);
      }
      if (!fields.length && !moved) return viewFor(id, uid);
      set('updated_at', Date.now());
      db.prepare(`UPDATE pages SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
      return viewFor(id, uid);
    },

    // 페이지를 하위 페이지·데이터베이스 항목까지 통째로 복사해서 바로 아래에 놓는다
    duplicate(id, uid) {
      const src = access(id, uid);
      if (src.deleted_at != null) throw httpError(404, '페이지를 찾을 수 없습니다.');
      // 복사본은 원본 옆에 생기므로 그 자리에 만들 권한이 있어야 한다 (복사본은 잠기지 않는다)
      if (src.parent_id) need(stmt.get.get(src.parent_id), uid, EDIT);
      else needScope({ owner: src.private_owner, space: src.space_id }, uid, EDIT);
      const next = db.prepare('SELECT MIN(position) AS p FROM pages WHERE parent_id IS ? AND position > ? AND deleted_at IS NULL')
        .get(src.parent_id, src.position).p;
      const position = next == null ? src.position + 1 : (src.position + next) / 2;
      const kids = db.prepare('SELECT * FROM pages WHERE parent_id = ? AND deleted_at IS NULL ORDER BY position, created_at');
      const now = Date.now();
      let count = 0;
      const copy = (row, parentId, pos, title) => {
        if (++count > 5000) throw httpError(413, '복사할 페이지가 너무 많아요.');
        const newId = randomUUID();
        stmt.insert.run(newId, parentId, row.kind, title, row.icon, row.cover, row.content, row.props, row.schema, pos, now, now, row.private_owner, row.space_id);
        for (const child of kids.all(row.id)) copy(child, newId, child.position, child.title);
        return newId;
      };
      db.exec('BEGIN');
      try {
        const title = `${src.title.trim() || '제목 없음'} (사본)`.slice(0, 300);
        const newId = copy(src, src.parent_id, position, title);
        db.exec('COMMIT');
        return viewFor(newId, uid);
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    trash(id, uid) {
      need(access(id, uid), uid, DELETE);
      const now = Date.now();
      for (const pid of subtree(id)) {
        const row = stmt.get.get(pid);
        if (row.deleted_at == null) stmt.setDeleted.run(now, pid);
      }
    },

    restore(id, uid) {
      const row = access(id, uid);
      need(row, uid, DELETE);
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

    destroy(id, uid) {
      need(access(id, uid), uid, DELETE);
      const ids = subtree(id).reverse();
      for (const pid of ids) stmt.remove.run(pid);
    },

    emptyTrash(uid) {
      const trashed = db.prepare(`SELECT id FROM pages WHERE deleted_at IS NOT NULL AND ${VISIBLE_SQL}`).all(uid, uid);
      // 지울 권한이 있는 것만 비운다
      for (const r of trashed) {
        const row = stmt.get.get(r.id);
        if (row && levelFor(row, uid) >= DELETE) repo.destroy(r.id, uid);
      }
    },

    // 화면 설정은 사람마다 따로 (예전 공용 설정은 첫 관리자에게 넘긴다)
    getSettings(uid) {
      const row = stmt.getSetting.get('ui:' + uid);
      return row ? JSON.parse(row.value) : {};
    },
    putSettings(uid, value) {
      stmt.putSetting.run('ui:' + uid, JSON.stringify(value));
      return value;
    },
    claimLegacySettings(uid) {
      const row = stmt.getSetting.get('ui');
      if (row && !stmt.getSetting.get('ui:' + uid)) stmt.putSetting.run('ui:' + uid, row.value);
    },
    // 예전 공용 즐겨찾기(pages.favorite)는 첫 관리자의 즐겨찾기로 옮긴다
    claimLegacyFavorites(uid) {
      db.prepare('INSERT OR IGNORE INTO favorites (user_id, page_id, created_at) SELECT ?, id, ? FROM pages WHERE favorite = 1').run(uid, Date.now());
      db.prepare('UPDATE pages SET favorite = 0 WHERE favorite = 1').run();
    },
    // 동시 편집 문서 상태
    getYdoc: (id) => stmt.get.get(id)?.ydoc ?? null,
    saveYdoc(id, state, content) {
      db.prepare('UPDATE pages SET ydoc = ?, content = ?, updated_at = ? WHERE id = ?').run(state, JSON.stringify(content), Date.now(), id);
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
