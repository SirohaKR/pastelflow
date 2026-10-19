import { randomUUID } from 'node:crypto';
import { httpError } from './db.js';

// 홈 화면 위젯. 위젯마다 자기 데이터(메모 내용, 링크, 습관 기록 등)를 config 에 담는다.
export const WIDGET_TYPES = ['today', 'todo', 'calendar', 'dday', 'habits', 'memo', 'recent', 'links', 'budget', 'goals'];
const SIZES = ['s', 'm', 'l'];
const COLORS = ['', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const MAX_CONFIG = 200_000;

// 처음 홈을 열었을 때 깔리는 위젯들
const STARTER = [
  ['today', 'm', 'p1'],
  ['calendar', 's', ''],
  ['dday', 's', 'p5'],
  ['todo', 'm', ''],
  ['habits', 'm', 'p2'],
  ['goals', 's', 'p4'],
  ['memo', 's', 'p6'],
  ['budget', 'm', 'p3'],
  ['links', 's', ''],
  ['recent', 's', ''],
];

function toWidget(row) {
  return {
    id: row.id,
    type: row.type,
    size: row.size,
    color: row.color,
    position: row.position,
    config: JSON.parse(row.config),
    updatedAt: row.updated_at,
  };
}

export function createWidgetRepo(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS widgets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      size TEXT NOT NULL DEFAULT 's',
      color TEXT NOT NULL DEFAULT '',
      position REAL NOT NULL DEFAULT 0,
      config TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    );
  `);
  // 0.5.0: 위젯은 사람마다 따로
  const cols = new Set(db.prepare('PRAGMA table_info(widgets)').all().map((c) => c.name));
  if (!cols.has('user_id')) db.exec('ALTER TABLE widgets ADD COLUMN user_id TEXT');

  const stmt = {
    list: db.prepare('SELECT * FROM widgets WHERE user_id = ? ORDER BY position'),
    get: db.prepare('SELECT * FROM widgets WHERE id = ?'),
    maxPos: db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM widgets WHERE user_id = ?'),
    insert: db.prepare('INSERT INTO widgets (id, type, size, color, position, config, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    remove: db.prepare('DELETE FROM widgets WHERE id = ? AND user_id = ?'),
    getFlag: db.prepare('SELECT value FROM settings WHERE key = ?'),
    setFlag: db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')"),
  };

  const mine = (id, uid) => {
    const row = stmt.get.get(id);
    if (!row || row.user_id !== uid) throw httpError(404, '위젯을 찾을 수 없어요.');
    return row;
  };

  const repo = {
    list(uid) {
      // 사람마다 처음 한 번만 기본 위젯을 깔아 준다 (다 지운 뒤에 다시 생기지 않게)
      const flag = 'widgets_seeded:' + uid;
      if (!stmt.getFlag.get(flag)) {
        STARTER.forEach(([type, size, color], i) => {
          stmt.insert.run(randomUUID(), type, size, color, i + 1, '{}', Date.now(), uid);
        });
        stmt.setFlag.run(flag);
      }
      return stmt.list.all(uid).map(toWidget);
    },

    // 계정이 생기기 전에 쓰던 위젯은 첫 관리자에게 넘긴다
    claimLegacy(uid) {
      const n = db.prepare('UPDATE widgets SET user_id = ? WHERE user_id IS NULL').run(uid).changes;
      if (n || stmt.getFlag.get('widgets_seeded')) stmt.setFlag.run('widgets_seeded:' + uid);
    },

    create({ type, size = 's', color = '' } = {}, uid) {
      if (!WIDGET_TYPES.includes(type)) throw httpError(400, '알 수 없는 위젯이에요.');
      const id = randomUUID();
      stmt.insert.run(id, type, SIZES.includes(size) ? size : 's', COLORS.includes(color) ? color : '', stmt.maxPos.get(uid).m + 1, '{}', Date.now(), uid);
      return toWidget(stmt.get.get(id));
    },

    update(id, patch = {}, uid) {
      const cur = mine(id, uid);
      const fields = [];
      const values = [];
      const set = (col, val) => { fields.push(`${col} = ?`); values.push(val); };
      if (SIZES.includes(patch.size)) set('size', patch.size);
      if (COLORS.includes(patch.color)) set('color', patch.color);
      if (typeof patch.position === 'number' && Number.isFinite(patch.position)) set('position', patch.position);
      if (patch.config !== undefined) {
        if (!patch.config || typeof patch.config !== 'object' || Array.isArray(patch.config)) throw httpError(400, '위젯 설정이 올바르지 않아요.');
        const json = JSON.stringify(patch.config);
        if (json.length > MAX_CONFIG) throw httpError(413, '위젯에 담은 내용이 너무 많아요.');
        set('config', json);
      }
      if (!fields.length) return toWidget(cur);
      set('updated_at', Date.now());
      db.prepare(`UPDATE widgets SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
      return toWidget(stmt.get.get(id));
    },

    remove(id, uid) {
      stmt.remove.run(id, uid);
    },
  };

  return repo;
}
