import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openDb, createRepo, httpError } from './db.js';
import { createWidgetRepo } from './widgets.js';
import { createUserRepo, publicUser } from './users.js';
import { setupRealtime } from './realtime.js';
import { createSpaceRepo } from './spaces.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5210);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 20);
const COOKIE = 'pf_session';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const sqlite = openDb(DATA_DIR);
const repo = createRepo(sqlite);
const widgets = createWidgetRepo(sqlite);
const users = createUserRepo(sqlite);
const spaces = createSpaceRepo(sqlite, users);
// 0.7.1: 예전 공용 즐겨찾기는 가장 먼저 만든 관리자에게 넘긴다
const firstAdmin = sqlite.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1").get();
if (firstAdmin) repo.claimLegacyFavorites(firstAdmin.id);

// ── 로그인 세션 쿠키 ─────────────────────────────────────────────
export function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

const sessionToken = (req) => readCookie(req, COOKIE);
export const userFromRequest = (req) => users.sessionUser(sessionToken(req));

function setSession(req, res, userId) {
  const token = users.createSession(userId);
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${users.SESSION_DAYS * 86400}${secure}`);
}

// 아이디·IP 마다 10분에 10번까지
const attempts = new Map();
function limit(key) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 10) throw httpError(429, '시도가 너무 많아요. 10분 뒤에 다시 해 주세요.');
  recent.push(now);
  attempts.set(key, recent);
}

// ── 앱 ───────────────────────────────────────────────────────────────
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));

app.get('/api/auth/status', (req, res) => {
  res.json({ setup: users.count() === 0, user: publicUser(userFromRequest(req)) });
});

// 처음 한 번: 관리자 계정 만들기. 예전 데이터(위젯·화면 설정)는 이 사람에게 넘긴다
app.post('/api/auth/setup', (req, res) => {
  if (users.count() > 0) throw httpError(409, '이미 관리자 계정이 있어요.');
  const u = users.create({ ...req.body, role: 'admin' });
  widgets.claimLegacy(u.id);
  repo.claimLegacySettings(u.id);
  repo.claimLegacyFavorites(u.id);
  setSession(req, res, u.id);
  res.status(201).json(publicUser(u));
});

app.post('/api/auth/login', (req, res) => {
  limit(`ip:${req.ip}`);
  const u = users.authenticate(req.body?.username, req.body?.password);
  if (!u) throw httpError(401, '아이디나 비밀번호가 맞지 않아요.');
  attempts.delete(`ip:${req.ip}`);
  setSession(req, res, u.id);
  res.json(publicUser(u));
});

app.post('/api/auth/logout', (req, res) => {
  users.endSession(sessionToken(req));
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});

// 초대 링크 확인과 가입 (로그인 전)
app.get('/api/invites/:code', (req, res) => {
  limit(`invite:${req.ip}`);
  const by = users.checkInvite(req.params.code);
  res.json({ ok: true, by: by?.nickname ?? '' });
});

app.post('/api/auth/register', (req, res) => {
  limit(`invite:${req.ip}`);
  const u = users.register(req.body || {});
  setSession(req, res, u.id);
  res.status(201).json(publicUser(u));
});

// 여기부터는 로그인 필요
app.use(['/api', '/uploads'], (req, res, next) => {
  const u = userFromRequest(req);
  if (!u) return res.status(401).json({ error: '로그인이 필요해요.' });
  req.user = u;
  next();
});

// 페이지·데이터베이스를 바꾸면 다른 사람 화면에 알린다
let realtime = null;
app.use(['/api/pages', '/api/databases', '/api/trash', '/api/spaces', '/api/categories', '/api/admin/users', '/api/me'], (req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400 && !res.locals.quiet) realtime?.broadcastChange(String(req.get('x-client-id') || ''));
    });
  }
  next();
});

const requireAdmin = (req, _res, next) => next(req.user.role === 'admin' ? undefined : httpError(403, '관리자만 할 수 있어요.'));

// 올린 파일은 스크립트가 실행되지 않도록 격리해서 내려준다
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '30d',
  immutable: true,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', 'sandbox');
  },
}));

// ── 나와 다른 사람들 ──
app.get('/api/users', (_req, res) => res.json(users.list().filter((u) => !u.disabled)));
app.patch('/api/me', (req, res) => res.json(publicUser(users.updateProfile(req.user.id, req.body || {}))));
app.post('/api/me/password', (req, res) => {
  users.changePassword(req.user.id, req.body?.current, req.body?.next);
  // 다른 기기에서는 다시 로그인하게 하고, 지금 기기는 새 세션으로
  users.endAllSessions(req.user.id);
  setSession(req, res, req.user.id);
  res.json({ ok: true });
});

// ── 관리자 ──
app.get('/api/admin/users', requireAdmin, (_req, res) => res.json(users.list()));
app.patch('/api/admin/users/:id', requireAdmin, (req, res) => res.json(publicUser(users.adminUpdate(req.user.id, req.params.id, req.body || {}))));
app.get('/api/admin/invites', requireAdmin, (_req, res) => res.json(users.listInvites()));
app.post('/api/admin/invites', requireAdmin, (req, res) => {
  const inv = users.createInvite(req.user.id, req.body?.role);
  res.status(201).json({ code: inv.code, expiresAt: inv.expires_at, role: inv.role });
});
app.delete('/api/admin/invites/:code', requireAdmin, (req, res) => {
  users.deleteInvite(req.params.code);
  res.json({ ok: true });
});

// ── 스페이스 ──
app.get('/api/spaces', (req, res) => res.json(spaces.listMine(req.user.id)));
app.post('/api/spaces', (req, res) => res.status(201).json(spaces.create(req.body || {}, req.user)));
app.patch('/api/spaces/:id', (req, res) => res.json(spaces.update(req.params.id, req.body || {}, req.user)));
app.put('/api/spaces/:id/members', (req, res) => res.json(spaces.setMembers(req.params.id, req.body?.members, req.user)));
app.post('/api/spaces/:id/leave', (req, res) => {
  spaces.leave(req.params.id, req.user);
  res.json({ ok: true });
});
app.delete('/api/spaces/:id', (req, res) => {
  spaces.remove(req.params.id, req.user);
  res.json({ ok: true });
});
app.get('/api/admin/spaces', requireAdmin, (_req, res) => res.json(spaces.listAll()));

// ── 카테고리 (구역마다 최상위 페이지 묶음) ──
app.get('/api/categories', (req, res) => res.json(repo.listCategories(req.user.id)));
app.post('/api/categories', (req, res) => res.status(201).json(repo.createCategory(req.body || {}, req.user.id)));
app.patch('/api/categories/:id', (req, res) => res.json(repo.updateCategory(req.params.id, req.body || {}, req.user.id)));
app.delete('/api/categories/:id', (req, res) => {
  repo.removeCategory(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ── 페이지 ──
app.get('/api/pages', (req, res) => res.json(repo.list(req.user.id)));

app.post('/api/pages', (req, res) => {
  const kind = req.body?.kind === 'database' ? 'database' : 'page';
  const page = repo.create({
    parentId: req.body?.parentId || null, kind, title: req.body?.title || '',
    private: req.body?.private === true, spaceId: typeof req.body?.spaceId === 'string' ? req.body.spaceId : null,
    categoryId: typeof req.body?.categoryId === 'string' ? req.body.categoryId : null,
  }, req.user.id);
  res.status(201).json(page);
});

// 데이터베이스와 그 안의 행 목록
app.get('/api/databases/:id', (req, res) => res.json(repo.database(req.params.id, req.user.id)));

app.post('/api/databases/:id/rows', (req, res) => {
  const { title = '', props = {}, position } = req.body || {};
  res.status(201).json(repo.create({ parentId: req.params.id, kind: 'row', title, props, position }, req.user.id));
});

// 홈 위젯 (사람마다 따로)
app.get('/api/widgets', (req, res) => res.json(widgets.list(req.user.id)));
app.post('/api/widgets', (req, res) => res.status(201).json(widgets.create(req.body || {}, req.user.id)));
app.patch('/api/widgets/:id', (req, res) => res.json(widgets.update(req.params.id, req.body || {}, req.user.id)));
app.delete('/api/widgets/:id', (req, res) => {
  widgets.remove(req.params.id, req.user.id);
  res.json({ ok: true });
});
// 할 일·캘린더 위젯이 보는 모든 데이터베이스
app.get('/api/agenda', (req, res) => res.json(repo.allDatabases(req.user.id)));

app.get('/api/pages/:id', (req, res) => {
  const page = repo.get(req.params.id, req.user.id);
  if (!page) throw httpError(404, '페이지를 찾을 수 없습니다.');
  res.json(page);
});

app.patch('/api/pages/:id', (req, res) => {
  const body = req.body || {};
  // 즐겨찾기만 바꾸면 내 것이라 다른 사람에게 알리지 않는다
  const keys = Object.keys(body);
  res.locals.quiet = keys.length > 0 && keys.every((k) => k === 'favorite');
  res.json(repo.update(req.params.id, body, req.user.id));
});

app.post('/api/pages/:id/duplicate', (req, res) => res.status(201).json(repo.duplicate(req.params.id, req.user.id)));

app.post('/api/pages/:id/trash', (req, res) => {
  repo.trash(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.post('/api/pages/:id/restore', (req, res) => {
  repo.restore(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.delete('/api/pages/:id', (req, res) => {
  repo.destroy(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.post('/api/trash/empty', (req, res) => {
  repo.emptyTrash(req.user.id);
  res.json({ ok: true });
});

app.get('/api/settings', (req, res) => res.json(repo.getSettings(req.user.id)));
app.put('/api/settings', (req, res) => res.json(repo.putSettings(req.user.id, req.body || {})));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

app.post('/api/uploads', upload.single('file'), (req, res) => {
  if (!req.file) throw httpError(400, '파일이 없습니다.');
  // multer 는 파일 이름을 latin1 로 읽으므로 한글 이름을 되살린다
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  res.status(201).json({ url: `/uploads/${req.file.filename}`, name, mime: req.file.mimetype, size: req.file.size });
});

app.use('/api', (_req, _res, next) => next(httpError(404, '없는 주소예요.')));

// 빌드된 화면
const DIST = path.join(ROOT, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  const message = err.code === 'LIMIT_FILE_SIZE' ? `파일은 ${MAX_UPLOAD_MB}MB까지 올릴 수 있어요.` : err.message;
  res.status(status).json({ error: status >= 500 ? '서버 오류가 났어요.' : message });
});

const server = app.listen(PORT, () => {
  console.log(`파스텔플로우 실행 중: http://localhost:${PORT} (데이터: ${DATA_DIR})`);
  if (users.count() === 0) console.log('아직 계정이 없어요. 브라우저로 접속해서 관리자 계정을 만들어 주세요.');
  if (process.env.APP_PASSWORD) console.log('APP_PASSWORD 는 0.5.0 부터 쓰지 않아요. 계정으로 로그인해 주세요.');
});

realtime = setupRealtime(server, { repo, userFromRequest });

export { app, server, repo, users };
