import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { openDb, createRepo, httpError } from './db.js';
import { createWidgetRepo } from './widgets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5210);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PASSWORD = process.env.APP_PASSWORD || '';
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 20);
const COOKIE = 'pf_session';
const SESSION_DAYS = 30;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const sqlite = openDb(DATA_DIR);
const repo = createRepo(sqlite);
const widgets = createWidgetRepo(sqlite);

let secret = repo.getSecret();
if (!secret) {
  secret = randomBytes(32).toString('hex');
  repo.putSecret(secret);
}

// ── 로그인 (APP_PASSWORD 를 설정했을 때만) ────────────────────────────
const sign = (value) => createHmac('sha256', secret).update(value).digest('hex');

function makeToken() {
  const exp = String(Date.now() + SESSION_DAYS * 86400_000);
  return `${exp}.${sign(exp)}`;
}

function isValidToken(token) {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

const isAuthed = (req) => !PASSWORD || isValidToken(readCookie(req, COOKIE));

function passwordMatches(input) {
  const a = Buffer.from(sign(String(input ?? '')));
  const b = Buffer.from(sign(PASSWORD));
  return timingSafeEqual(a, b);
}

// ── 앱 ───────────────────────────────────────────────────────────────
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));

app.get('/api/auth/status', (req, res) => {
  res.json({ required: !!PASSWORD, authed: isAuthed(req) });
});

const loginAttempts = new Map();
app.post('/api/auth/login', (req, res) => {
  const key = req.ip;
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 10) return res.status(429).json({ error: '시도가 너무 많아요. 10분 뒤에 다시 해 주세요.' });
  if (!PASSWORD || passwordMatches(req.body?.password)) {
    loginAttempts.delete(key);
    res.setHeader('Set-Cookie', `${COOKIE}=${makeToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
    return res.json({ ok: true });
  }
  recent.push(now);
  loginAttempts.set(key, recent);
  res.status(401).json({ error: '비밀번호가 맞지 않아요.' });
});

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});

// 여기부터는 로그인 필요
app.use(['/api', '/uploads'], (req, res, next) => {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: '로그인이 필요해요.' });
});

// 올린 파일은 스크립트가 실행되지 않도록 격리해서 내려준다
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '30d',
  immutable: true,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', 'sandbox');
  },
}));

app.get('/api/pages', (_req, res) => res.json(repo.list()));

app.post('/api/pages', (req, res) => {
  const kind = req.body?.kind === 'database' ? 'database' : 'page';
  res.status(201).json(repo.create({ parentId: req.body?.parentId || null, kind, title: req.body?.title || '' }));
});

// 데이터베이스와 그 안의 행 목록
app.get('/api/databases/:id', (req, res) => res.json(repo.database(req.params.id)));

app.post('/api/databases/:id/rows', (req, res) => {
  const { title = '', props = {}, position } = req.body || {};
  res.status(201).json(repo.create({ parentId: req.params.id, kind: 'row', title, props, position }));
});

// 홈 위젯
app.get('/api/widgets', (_req, res) => res.json(widgets.list()));
app.post('/api/widgets', (req, res) => res.status(201).json(widgets.create(req.body || {})));
app.patch('/api/widgets/:id', (req, res) => res.json(widgets.update(req.params.id, req.body || {})));
app.delete('/api/widgets/:id', (req, res) => {
  widgets.remove(req.params.id);
  res.json({ ok: true });
});
// 할 일·캘린더 위젯이 보는 모든 데이터베이스
app.get('/api/agenda', (_req, res) => res.json(repo.allDatabases()));

app.get('/api/pages/:id', (req, res) => {
  const page = repo.get(req.params.id);
  if (!page) throw httpError(404, '페이지를 찾을 수 없습니다.');
  res.json(page);
});

app.patch('/api/pages/:id', (req, res) => res.json(repo.update(req.params.id, req.body || {})));

app.post('/api/pages/:id/trash', (req, res) => {
  repo.trash(req.params.id);
  res.json({ ok: true });
});

app.post('/api/pages/:id/restore', (req, res) => {
  repo.restore(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/pages/:id', (req, res) => {
  repo.destroy(req.params.id);
  res.json({ ok: true });
});

app.post('/api/trash/empty', (_req, res) => {
  repo.emptyTrash();
  res.json({ ok: true });
});

app.get('/api/settings', (_req, res) => res.json(repo.getSettings()));
app.put('/api/settings', (req, res) => res.json(repo.putSettings(req.body || {})));

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
  res.status(201).json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname });
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

app.listen(PORT, () => {
  console.log(`파스텔플로우 실행 중: http://localhost:${PORT} (데이터: ${DATA_DIR})`);
  if (!PASSWORD) console.log('APP_PASSWORD 가 비어 있어 로그인 없이 열려 있어요.');
});
