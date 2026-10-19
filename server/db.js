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
  return db;
}

const LIST_COLUMNS = 'id, parent_id, title, icon, cover, position, favorite, deleted_at, created_at, updated_at';

function toPage(row, withContent = false) {
  if (!row) return null;
  const page = {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    icon: row.icon,
    cover: row.cover,
    position: row.position,
    favorite: !!row.favorite,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (withContent) page.content = JSON.parse(row.content);
  return page;
}

export function createRepo(db) {
  const stmt = {
    list: db.prepare(`SELECT ${LIST_COLUMNS} FROM pages ORDER BY position, created_at`),
    get: db.prepare('SELECT * FROM pages WHERE id = ?'),
    children: db.prepare('SELECT id FROM pages WHERE parent_id = ?'),
    maxPos: db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM pages WHERE parent_id IS ?'),
    insert: db.prepare(`INSERT INTO pages (id, parent_id, title, icon, cover, content, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
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

    create({ parentId = null, title = '', icon = '', cover = '', content = [] } = {}) {
      if (parentId && !stmt.get.get(parentId)) throw httpError(400, '상위 페이지가 없습니다.');
      const id = randomUUID();
      const now = Date.now();
      const position = stmt.maxPos.get(parentId).m + 1;
      stmt.insert.run(id, parentId, title, icon, cover, JSON.stringify(content), position, now, now);
      return repo.get(id);
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
      if ('parentId' in patch) {
        const parentId = patch.parentId || null;
        if (parentId) {
          if (!stmt.get.get(parentId)) throw httpError(400, '상위 페이지가 없습니다.');
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
