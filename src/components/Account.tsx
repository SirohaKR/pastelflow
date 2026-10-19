import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type Invite, type User } from '../api';
import { TAGS } from './home/model';
import { Modal } from './Popover';
import './account.css';

// ── 프로필 사진 (사진이 없으면 별명 첫 글자) ─────────────────────────
export function Avatar({ user, size = 28, ring = false }: { user: Pick<User, 'nickname' | 'avatar' | 'color'> | undefined; size?: number; ring?: boolean }) {
  const name = user?.nickname || '?';
  return (
    <span
      className={`avatar tag-${user?.color ?? 'p1'} ${ring ? 'ring' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      title={name}
    >
      {user?.avatar ? <img src={user.avatar} alt="" /> : [...name][0]}
    </span>
  );
}

// ── 관리자 만들기 / 로그인 / 초대 가입 ─────────────────────────────
type Mode = 'setup' | 'login' | 'register';

export function AuthScreen({ mode, inviteCode, onDone }: { mode: Mode; inviteCode?: string; onDone: (u: User) => void }) {
  const [form, setForm] = useState({ nickname: '', username: '', password: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ ok: boolean; by?: string; error?: string } | null>(null);

  useEffect(() => {
    if (mode !== 'register' || !inviteCode) return;
    api.checkInvite(inviteCode).then((r) => setInvite({ ok: true, by: r.by })).catch((e) => setInvite({ ok: false, error: e.message }));
  }, [mode, inviteCode]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (mode !== 'login' && form.password !== form.confirm) {
      setErr('비밀번호 확인이 맞지 않아요.');
      return;
    }
    setBusy(true);
    try {
      const body = { username: form.username, password: form.password, nickname: form.nickname };
      const u = mode === 'setup' ? await api.setup(body)
        : mode === 'register' ? await api.register({ ...body, code: inviteCode ?? '' })
          : await api.login(form.username, form.password);
      onDone(u);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'setup' ? '처음 오셨네요!' : mode === 'register' ? '파스텔플로우에 초대받았어요' : '파스텔플로우';
  const sub = mode === 'setup'
    ? '먼저 관리자 계정을 만들어 주세요. 다른 사람은 나중에 초대 링크로 들어올 수 있어요.'
    : mode === 'register'
      ? invite?.ok ? `${invite.by || '관리자'}님이 초대했어요. 계정을 만들어 주세요.` : invite ? invite.error : '초대 링크를 확인하는 중…'
      : '아이디와 비밀번호를 입력해 주세요';

  const blocked = mode === 'register' && !invite?.ok;

  return (
    <div className="login">
      <form onSubmit={submit} className="auth-form">
        <div className="brand-mark" style={{ justifyContent: 'center' }}><span /><span /><span /></div>
        <h1>{title}</h1>
        <p>{sub}</p>
        {!blocked && (
          <>
            {mode !== 'login' && (
              <input className="field" placeholder="별명 (다른 사람에게 보이는 이름)" autoComplete="nickname" value={form.nickname} onChange={set('nickname')} autoFocus />
            )}
            <input
              className="field"
              placeholder="아이디 (영어 소문자·숫자 3~20자)"
              autoComplete="username"
              autoCapitalize="none"
              value={form.username}
              onChange={set('username')}
              autoFocus={mode === 'login'}
            />
            <input className="field" type="password" placeholder="비밀번호 (8자 이상)" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={set('password')} />
            {mode !== 'login' && (
              <input className="field" type="password" placeholder="비밀번호 확인" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
            )}
            {err && <div className="error">{err}</div>}
            <button className="btn" disabled={busy} style={{ justifyContent: 'center', padding: 11 }}>
              {mode === 'login' ? '들어가기' : '계정 만들기'}
            </button>
          </>
        )}
        {mode === 'register' && (
          <a className="auth-link" href="/">이미 계정이 있어요 → 로그인</a>
        )}
        {mode === 'login' && <small className="w-sub">계정이 없다면 관리자에게 초대 링크를 받아 주세요.</small>}
      </form>
    </div>
  );
}

// ── 내 프로필 ─────────────────────────────────────────────
export function ProfileDialog({ me, onChange, onClose, onError }: { me: User; onChange: (u: User) => void; onClose: () => void; onError: (m: string) => void }) {
  const [nickname, setNickname] = useState(me.nickname);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async (patch: Partial<Pick<User, 'nickname' | 'avatar' | 'color'>>) => {
    try {
      onChange(await api.updateMe(patch));
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) return onError('이미지 파일만 올릴 수 있어요.');
    try {
      const { url } = await api.upload(file);
      await save({ avatar: url });
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return setPwMsg('새 비밀번호 확인이 맞지 않아요.');
    try {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg('✓ 바꿨어요. 다른 기기에서는 다시 로그인해야 해요.');
    } catch (e) {
      setPwMsg((e as Error).message);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="modal-head">
        <span>👤 내 프로필</span>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      <div className="modal-body settings">
        <section className="profile-top">
          <button className="avatar-edit" onClick={() => fileRef.current?.click()} title="사진 바꾸기">
            <Avatar user={{ ...me, nickname }} size={72} />
            <span>📷</span>
          </button>
          <div className="profile-names">
            <input
              className="field"
              value={nickname}
              maxLength={20}
              onChange={(e) => setNickname(e.target.value)}
              onBlur={() => nickname.trim() && nickname !== me.nickname && save({ nickname })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <small className="w-sub">@{me.username} · {me.role === 'admin' ? '관리자' : '멤버'}</small>
            {me.avatar && <button className="btn ghost small" onClick={() => save({ avatar: '' })}>사진 지우기</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        </section>

        <section>
          <h4>내 색 (커서와 이름표에 쓰여요)</h4>
          <div className="widget-colors">
            {TAGS.map((c) => (
              <button key={c} className={`color-dot big tag-${c} ${me.color === c ? 'on' : ''}`} onClick={() => save({ color: c })} aria-label={c} />
            ))}
          </div>
        </section>

        <section>
          <h4>비밀번호 바꾸기</h4>
          <form className="pw-form" onSubmit={changePw}>
            <input className="field small" type="password" placeholder="지금 비밀번호" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            <input className="field small" type="password" placeholder="새 비밀번호 (8자 이상)" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <input className="field small" type="password" placeholder="새 비밀번호 확인" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            <button className="btn small">바꾸기</button>
          </form>
          {pwMsg && <small className="w-sub">{pwMsg}</small>}
        </section>

        <button
          className="btn ghost"
          onClick={async () => {
            await api.logout();
            location.href = '/';
          }}
        >
          로그아웃
        </button>
      </div>
    </Modal>
  );
}

// ── 멤버 관리 (관리자) ─────────────────────────────────────────
export function MembersDialog({ me, onClose, onError }: { me: User; onClose: () => void; onError: (m: string) => void }) {
  const [tab, setTab] = useState<'members' | 'invites'>('members');
  const [list, setList] = useState<User[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copied, setCopied] = useState('');
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPw, setNewPw] = useState('');

  const load = () => {
    api.adminUsers().then(setList).catch((e) => onError(e.message));
    api.invites().then(setInvites).catch((e) => onError(e.message));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const link = (code: string) => `${location.origin}/invite/${code}`;
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(link(code));
      setCopied(code);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      // http 로 접속하면 클립보드가 막힐 수 있어서 직접 고르게 한다
      window.prompt('아래 링크를 복사해 주세요', link(code));
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      load();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const nameOf = (id: string | null) => list.find((u) => u.id === id)?.nickname ?? '알 수 없음';
  const now = Date.now();

  return (
    <Modal onClose={onClose}>
      <div className="modal-head">
        <span>👥 멤버 관리</span>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      <div className="modal-body settings">
        <div className="segmented">
          <button className={tab === 'members' ? 'on' : ''} onClick={() => setTab('members')}>멤버 {list.length}</button>
          <button className={tab === 'invites' ? 'on' : ''} onClick={() => setTab('invites')}>초대 링크</button>
        </div>

        {tab === 'members' && (
          <ul className="member-list">
            {list.map((u) => (
              <li key={u.id} className={u.disabled ? 'disabled' : ''}>
                <Avatar user={u} size={34} />
                <div className="member-name">
                  <b>{u.nickname}{u.id === me.id && ' (나)'}</b>
                  <small className="w-sub">@{u.username}{u.disabled ? ' · 사용 중지됨' : ''}</small>
                </div>
                <select
                  className="field small"
                  value={u.role}
                  disabled={u.id === me.id}
                  onChange={(e) => run(() => api.adminUpdateUser(u.id, { role: e.target.value as User['role'] }))}
                >
                  <option value="member">멤버</option>
                  <option value="admin">관리자</option>
                </select>
                {u.id !== me.id && (
                  <div className="member-actions">
                    <button className="btn ghost small" onClick={() => { setResetFor(resetFor === u.id ? null : u.id); setNewPw(''); }}>비밀번호 초기화</button>
                    <button
                      className={`btn small ${u.disabled ? '' : 'danger'}`}
                      onClick={() => (u.disabled || confirm(`${u.nickname}님 계정을 사용 중지할까요? 바로 로그아웃돼요.`))
                        && run(() => api.adminUpdateUser(u.id, { disabled: !u.disabled }))}
                    >
                      {u.disabled ? '다시 쓰기' : '사용 중지'}
                    </button>
                  </div>
                )}
                {resetFor === u.id && (
                  <form
                    className="pw-form full"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(() => api.adminUpdateUser(u.id, { password: newPw })).then(() => setResetFor(null));
                    }}
                  >
                    <input className="field small" type="text" placeholder="새 비밀번호 (8자 이상)" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                    <button className="btn small">정하기</button>
                    <small className="w-sub">본인에게 알려 주고, 로그인 후 바꾸게 해 주세요.</small>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {tab === 'invites' && (
          <div className="invite-box">
            <p className="w-sub">초대 링크는 한 사람만, 7일 동안 쓸 수 있어요.</p>
            <button className="btn" onClick={() => run(async () => { const inv = await api.createInvite(); await copy(inv.code); })}>
              ＋ 새 초대 링크 만들고 복사
            </button>
            <ul className="member-list">
              {invites.length === 0 && <li className="w-sub">아직 만든 초대 링크가 없어요.</li>}
              {invites.map((i) => {
                const state = i.usedBy ? `✓ ${nameOf(i.usedBy)}님이 가입함` : i.expiresAt < now ? '기한 지남' : `${Math.ceil((i.expiresAt - now) / 86400000)}일 남음`;
                const live = !i.usedBy && i.expiresAt >= now;
                return (
                  <li key={i.code} className={live ? '' : 'disabled'}>
                    <code className="invite-code">…{i.code.slice(-6)}</code>
                    <div className="member-name">
                      <b>{state}</b>
                      <small className="w-sub">{new Date(i.createdAt).toLocaleDateString('ko-KR')} · {nameOf(i.createdBy)}</small>
                    </div>
                    {live && <button className="btn ghost small" onClick={() => copy(i.code)}>{copied === i.code ? '✓ 복사됨' : '링크 복사'}</button>}
                    <button className="w-x show" title="지우기" onClick={() => run(() => api.deleteInvite(i.code))}>✕</button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
