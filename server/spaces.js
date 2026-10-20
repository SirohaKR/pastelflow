import { randomUUID } from 'node:crypto';
import { httpError } from './db.js';

// 스페이스: 디스코드 채널처럼 멤버만 안의 페이지를 보는 공용 구역
const COLORS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
// 스페이스 안 역할: 스페이스 관리자 > 편집·삭제 > 편집 > 보기 전용
export const SPACE_ROLES = ['owner', 'full', 'edit', 'view'];
const ROLES = SPACE_ROLES;

export function createSpaceRepo(db, users) {
  // 0.7.0: 예전 '멤버'는 지금과 같게 '편집·삭제'로
  db.exec("UPDATE space_members SET role = 'full' WHERE role = 'member'");
  const stmt = {
    get: db.prepare('SELECT * FROM spaces WHERE id = ?'),
    all: db.prepare('SELECT * FROM spaces ORDER BY position, created_at'),
    mine: db.prepare(`SELECT s.*, m.role AS my_role FROM spaces s JOIN space_members m ON m.space_id = s.id
      WHERE m.user_id = ? ORDER BY s.position, s.created_at`),
    members: db.prepare('SELECT user_id, role FROM space_members WHERE space_id = ?'),
    member: db.prepare('SELECT role FROM space_members WHERE space_id = ? AND user_id = ?'),
    maxPos: db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM spaces'),
    insert: db.prepare('INSERT INTO spaces (id, name, icon, image, color, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    addMember: db.prepare('INSERT OR REPLACE INTO space_members (space_id, user_id, role) VALUES (?, ?, ?)'),
    clearMembers: db.prepare('DELETE FROM space_members WHERE space_id = ?'),
    removeMember: db.prepare('DELETE FROM space_members WHERE space_id = ? AND user_id = ?'),
    remove: db.prepare('DELETE FROM spaces WHERE id = ?'),
  };

  const toSpace = (row, myRole = null) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    image: row.image ?? '',
    color: row.color,
    position: row.position,
    createdBy: row.created_by,
    createdAt: row.created_at,
    myRole: myRole ?? row.my_role ?? null,
    members: stmt.members.all(row.id).map((m) => ({ userId: m.user_id, role: m.role })),
  });

  // 아이콘 사진은 올린 파일 주소만 받는다 (빈 값이면 이모지)
  const cleanImage = (v) => (typeof v === 'string' && /^\/uploads\/[\w.-]+$/.test(v) ? v : '');

  const cleanName = (v) => {
    const n = String(v ?? '').trim().slice(0, 40);
    if (!n) throw httpError(400, '스페이스 이름을 적어 주세요.');
    return n;
  };

  function find(id) {
    const s = stmt.get.get(id);
    if (!s) throw httpError(404, '스페이스를 찾을 수 없어요.');
    return s;
  }

  // 스페이스 관리자이거나 전체 관리자
  function assertManager(spaceId, user) {
    const s = find(spaceId);
    if (user.role === 'admin') return s;
    if (stmt.member.get(spaceId, user.id)?.role !== 'owner') throw httpError(403, '스페이스 관리자만 할 수 있어요.');
    return s;
  }

  // 멤버 목록을 정리한다: 있는 사람만, 중복 없이, 관리자는 한 명 이상
  function cleanMembers(list, fallbackOwner) {
    const map = new Map();
    for (const m of Array.isArray(list) ? list : []) {
      const uid = typeof m === 'string' ? m : m?.userId;
      const role = ROLES.includes(m?.role) ? m.role : 'edit';
      const u = uid && users.get(uid);
      if (u && !u.disabled) map.set(uid, map.get(uid) === 'owner' ? 'owner' : role);
    }
    if (fallbackOwner && !map.has(fallbackOwner)) map.set(fallbackOwner, 'owner');
    if (![...map.values()].includes('owner')) throw httpError(400, '스페이스 관리자가 한 명 이상 있어야 해요.');
    return map;
  }

  const repo = {
    listMine: (uid) => stmt.mine.all(uid).map((r) => toSpace(r)),
    listAll: () => stmt.all.all().map((r) => toSpace(r)),
    isMember: (spaceId, uid) => !!stmt.member.get(spaceId, uid),

    create({ name, icon = '', image = '', color, members = [] } = {}, user) {
      if (user.role === 'view') throw httpError(403, '보기 전용 계정은 스페이스를 만들 수 없어요.');
      const id = randomUUID();
      const map = cleanMembers(members, user.id);
      map.set(user.id, 'owner'); // 만든 사람은 관리자
      db.exec('BEGIN');
      try {
        stmt.insert.run(id, cleanName(name), String(icon).slice(0, 16), cleanImage(image), COLORS.includes(color) ? color : 'p1', stmt.maxPos.get().m + 1, user.id, Date.now());
        for (const [uid, role] of map) stmt.addMember.run(id, uid, role);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return toSpace(stmt.get.get(id), 'owner');
    },

    update(id, patch, user) {
      assertManager(id, user);
      const fields = [];
      const values = [];
      if (patch.name !== undefined) { fields.push('name = ?'); values.push(cleanName(patch.name)); }
      if (typeof patch.icon === 'string') { fields.push('icon = ?'); values.push(patch.icon.slice(0, 16)); }
      if (typeof patch.image === 'string') { fields.push('image = ?'); values.push(cleanImage(patch.image)); }
      if (COLORS.includes(patch.color)) { fields.push('color = ?'); values.push(patch.color); }
      if (typeof patch.position === 'number' && Number.isFinite(patch.position)) { fields.push('position = ?'); values.push(patch.position); }
      if (fields.length) db.prepare(`UPDATE spaces SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
      return toSpace(stmt.get.get(id), stmt.member.get(id, user.id)?.role ?? null);
    },

    setMembers(id, list, user) {
      assertManager(id, user);
      const map = cleanMembers(list);
      db.exec('BEGIN');
      try {
        stmt.clearMembers.run(id);
        for (const [uid, role] of map) stmt.addMember.run(id, uid, role);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return toSpace(stmt.get.get(id), stmt.member.get(id, user.id)?.role ?? null);
    },

    leave(id, user) {
      find(id);
      const me = stmt.member.get(id, user.id);
      if (!me) throw httpError(400, '이 스페이스의 멤버가 아니에요.');
      const owners = stmt.members.all(id).filter((m) => m.role === 'owner');
      if (me.role === 'owner' && owners.length <= 1) {
        throw httpError(400, '마지막 스페이스 관리자는 나갈 수 없어요. 다른 사람을 관리자로 정하거나 스페이스를 지워 주세요.');
      }
      stmt.removeMember.run(id, user.id);
    },

    // 지우면 안의 페이지는 지운 사람의 휴지통(개인)으로 옮긴다. 되돌리면 그 사람의 '내 페이지'로 돌아온다
    remove(id, user) {
      assertManager(id, user);
      const now = Date.now();
      db.exec('BEGIN');
      try {
        db.prepare('UPDATE pages SET space_id = NULL, private_owner = ?, category_id = NULL, deleted_at = COALESCE(deleted_at, ?) WHERE space_id = ?').run(user.id, now, id);
        db.prepare('DELETE FROM categories WHERE space_id = ?').run(id);
        stmt.clearMembers.run(id);
        stmt.remove.run(id);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
  return repo;
}
