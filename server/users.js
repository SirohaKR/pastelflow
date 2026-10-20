import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { httpError } from './db.js';

// 사용자 계정, 로그인 세션, 초대 링크
const SESSION_DAYS = 30;
const INVITE_DAYS = 7;
const COLORS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const USERNAME = /^[a-z0-9][a-z0-9_.-]{2,19}$/;
// 전체 공용에서의 역할: 관리자 > 편집·삭제 > 편집 > 보기 전용
export const SITE_ROLES = ['admin', 'full', 'edit', 'view'];

const sha256 = (v) => createHash('sha256').update(v).digest('hex');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(String(password ?? ''), salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

// 사용자를 모를 때도 같은 시간이 걸리게 (아이디 있는지 알아내기 방지)
const DUMMY = hashPassword(randomBytes(8).toString('hex'));

export function cleanUsername(v) {
  const u = String(v ?? '').trim().toLowerCase();
  if (!USERNAME.test(u)) throw httpError(400, '아이디는 영어 소문자·숫자·_.- 로 3~20자예요.');
  return u;
}

export function cleanPassword(v) {
  const p = String(v ?? '');
  if (p.length < 8) throw httpError(400, '비밀번호는 8자 이상이어야 해요.');
  if (p.length > 200) throw httpError(400, '비밀번호가 너무 길어요.');
  return p;
}

export function cleanNickname(v) {
  const n = String(v ?? '').trim().slice(0, 20);
  if (!n) throw httpError(400, '별명을 적어 주세요.');
  return n;
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    avatar: u.avatar,
    color: u.color,
    role: u.role,
    disabled: !!u.disabled,
  };
}

export function createUserRepo(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      pw TEXT NOT NULL,
      nickname TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'p1',
      role TEXT NOT NULL DEFAULT 'member',
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS invites (
      code TEXT PRIMARY KEY,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_by TEXT,
      used_at INTEGER
    );
  `);
  // 0.7.0: 역할 4단계. 예전 '멤버'는 지금과 같게 '편집·삭제'로
  db.exec("UPDATE users SET role = 'full' WHERE role = 'member'");
  const inviteCols = new Set(db.prepare('PRAGMA table_info(invites)').all().map((c) => c.name));
  if (!inviteCols.has('role')) db.exec("ALTER TABLE invites ADD COLUMN role TEXT NOT NULL DEFAULT 'edit'");

  const stmt = {
    count: db.prepare('SELECT COUNT(*) AS n FROM users'),
    get: db.prepare('SELECT * FROM users WHERE id = ?'),
    byName: db.prepare('SELECT * FROM users WHERE username = ?'),
    list: db.prepare('SELECT * FROM users ORDER BY created_at'),
    admins: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0"),
    insert: db.prepare('INSERT INTO users (id, username, pw, nickname, avatar, color, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    sessionUser: db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0'),
    addSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'),
    delSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    delUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
    invite: db.prepare('SELECT * FROM invites WHERE code = ?'),
    invites: db.prepare('SELECT * FROM invites ORDER BY created_at DESC'),
    addInvite: db.prepare('INSERT INTO invites (code, created_by, created_at, expires_at, role) VALUES (?, ?, ?, ?, ?)'),
    useInvite: db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL'),
    delInvite: db.prepare('DELETE FROM invites WHERE code = ?'),
  };

  const repo = {
    count: () => stmt.count.get().n,
    get: (id) => stmt.get.get(id),
    list: () => stmt.list.all().map(publicUser),

    create({ username, password, nickname, role = 'edit' }) {
      if (!SITE_ROLES.includes(role)) role = 'edit';
      const name = cleanUsername(username);
      if (stmt.byName.get(name)) throw httpError(409, '이미 쓰고 있는 아이디예요.');
      const id = randomUUID();
      const color = COLORS[stmt.count.get().n % COLORS.length];
      stmt.insert.run(id, name, hashPassword(cleanPassword(password)), cleanNickname(nickname), '', color, role, Date.now());
      return stmt.get.get(id);
    },

    // 아이디·비밀번호 확인. 틀리면 null
    authenticate(username, password) {
      const u = stmt.byName.get(String(username ?? '').trim().toLowerCase());
      const ok = verifyPassword(password, u?.pw ?? DUMMY);
      return ok && u && !u.disabled ? u : null;
    },

    updateProfile(id, patch) {
      const u = stmt.get.get(id);
      if (!u) throw httpError(404, '사용자를 찾을 수 없어요.');
      const fields = [];
      const values = [];
      if (patch.nickname !== undefined) { fields.push('nickname = ?'); values.push(cleanNickname(patch.nickname)); }
      if (typeof patch.avatar === 'string') {
        if (patch.avatar && !/^\/uploads\/[\w.-]+$/.test(patch.avatar)) throw httpError(400, '프로필 사진 주소가 올바르지 않아요.');
        fields.push('avatar = ?'); values.push(patch.avatar);
      }
      if (COLORS.includes(patch.color)) { fields.push('color = ?'); values.push(patch.color); }
      if (fields.length) db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
      return stmt.get.get(id);
    },

    changePassword(id, current, next) {
      const u = stmt.get.get(id);
      if (!u || !verifyPassword(current, u.pw)) throw httpError(400, '지금 비밀번호가 맞지 않아요.');
      db.prepare('UPDATE users SET pw = ? WHERE id = ?').run(hashPassword(cleanPassword(next)), id);
    },

    // 관리자: 역할·사용 중지·비밀번호 초기화
    adminUpdate(actorId, id, patch) {
      const u = stmt.get.get(id);
      if (!u) throw httpError(404, '사용자를 찾을 수 없어요.');
      if (patch.role !== undefined && !SITE_ROLES.includes(patch.role)) throw httpError(400, '알 수 없는 역할이에요.');
      const losingAdmin = ((SITE_ROLES.includes(patch.role) && patch.role !== 'admin') || patch.disabled === true) && u.role === 'admin' && !u.disabled;
      if (losingAdmin && id === actorId) throw httpError(400, '나 자신의 관리자 권한은 뺄 수 없어요.');
      if (losingAdmin && stmt.admins.get().n <= 1) throw httpError(400, '관리자는 한 명 이상 있어야 해요.');
      if (SITE_ROLES.includes(patch.role)) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(patch.role, id);
      if (typeof patch.disabled === 'boolean') {
        db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(patch.disabled ? 1 : 0, id);
        if (patch.disabled) stmt.delUserSessions.run(id);
      }
      if (patch.password !== undefined) {
        db.prepare('UPDATE users SET pw = ? WHERE id = ?').run(hashPassword(cleanPassword(patch.password)), id);
        stmt.delUserSessions.run(id);
      }
      return stmt.get.get(id);
    },

    // ── 세션 ──
    createSession(userId) {
      const token = randomBytes(32).toString('hex');
      const now = Date.now();
      stmt.purgeSessions.run(now);
      stmt.addSession.run(sha256(token), userId, now + SESSION_DAYS * 86400_000, now);
      return token;
    },
    sessionUser: (token) => (token ? stmt.sessionUser.get(sha256(token), Date.now()) ?? null : null),
    endSession: (token) => token && stmt.delSession.run(sha256(token)),
    endAllSessions: (userId) => stmt.delUserSessions.run(userId),
    SESSION_DAYS,

    // ── 초대 ──
    // 가입할 사람의 전체 공용 역할을 미리 정한다 (관리자는 초대로 줄 수 없음)
    createInvite(by, role = 'edit') {
      const code = randomBytes(12).toString('base64url');
      const now = Date.now();
      stmt.addInvite.run(code, by, now, now + INVITE_DAYS * 86400_000, ['full', 'edit', 'view'].includes(role) ? role : 'edit');
      return stmt.invite.get(code);
    },
    listInvites: () => stmt.invites.all().map((i) => ({
      code: i.code, createdBy: i.created_by, createdAt: i.created_at, expiresAt: i.expires_at, usedBy: i.used_by, usedAt: i.used_at, role: i.role,
    })),
    deleteInvite: (code) => stmt.delInvite.run(code),
    // 쓸 수 있는 초대면 만든 사람을 돌려준다
    checkInvite(code) {
      const inv = stmt.invite.get(String(code ?? ''));
      if (!inv || inv.used_by || inv.expires_at < Date.now()) throw httpError(404, '초대 링크가 없거나 이미 쓰였거나 기한이 지났어요.');
      return stmt.get.get(inv.created_by);
    },
    register({ code, username, password, nickname }) {
      repo.checkInvite(code);
      const role = stmt.invite.get(code)?.role ?? 'edit';
      db.exec('BEGIN');
      try {
        const u = repo.create({ username, password, nickname, role });
        if (stmt.useInvite.run(u.id, Date.now(), code).changes !== 1) throw httpError(409, '초대 링크가 방금 쓰였어요.');
        db.exec('COMMIT');
        return u;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
  return repo;
}
