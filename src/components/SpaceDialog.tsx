import { useRef, useState } from 'react';
import { api, type Space, type SpaceMember, type TagColor, type User } from '../api';
import { TAGS } from './home/model';
import { Avatar } from './Account';
import { EmojiPicker } from './Pickers';
import { Modal } from './Popover';
import { SPACE_ROLES } from '../roles';
import { SpaceIcon, type SpaceDialogMode } from './SpaceHome';
import './spaces.css';

type Props = {
  // 없으면 새로 만들기
  space: Space | null;
  // 있는 스페이스: 설정(이름·아이콘·색) 또는 멤버·권한
  mode?: SpaceDialogMode;
  me: User;
  users: User[];
  onSaved: (space?: Space) => void;
  onClose: () => void;
  onError: (msg: string) => void;
};

export function SpaceDialog({ space, mode = 'settings', me, users, onSaved, onClose, onError }: Props) {
  const canManage = !space || space.myRole === 'owner' || me.role === 'admin';
  const showLook = !space || mode === 'settings';
  const showMembers = !space || mode === 'members';
  const [name, setName] = useState(space?.name ?? '');
  const [icon, setIcon] = useState(space?.icon ?? '💬');
  const [image, setImage] = useState(space?.image ?? '');
  const [color, setColor] = useState<TagColor>(space?.color ?? 'p1');
  const [members, setMembers] = useState<SpaceMember[]>(space?.members ?? [{ userId: me.id, role: 'owner' }]);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const roleOf = (uid: string) => members.find((m) => m.userId === uid)?.role ?? null;
  const toggle = (uid: string) =>
    setMembers((ms) => (ms.some((m) => m.userId === uid) ? ms.filter((m) => m.userId !== uid) : [...ms, { userId: uid, role: 'edit' }]));
  const setRole = (uid: string, role: SpaceMember['role']) => setMembers((ms) => ms.map((m) => (m.userId === uid ? { ...m, role } : m)));

  const uploadImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return onError('사진 파일만 올릴 수 있어요.');
    setBusy(true);
    try {
      setImage((await api.upload(file)).url);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (showLook && !name.trim()) return onError('스페이스 이름을 적어 주세요.');
    if (showMembers && !members.some((m) => m.role === 'owner')) return onError('스페이스 관리자가 한 명 이상 있어야 해요.');
    setBusy(true);
    try {
      let saved: Space;
      if (!space) saved = await api.createSpace({ name, icon, image, color, members });
      else if (mode === 'settings') saved = await api.updateSpace(space.id, { name, icon, image, color });
      else saved = await api.setSpaceMembers(space.id, members);
      onSaved(saved);
      onClose();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // 사용 중지되지 않은 사람만, 나를 맨 위로
  const people = users.filter((u) => !u.disabled).sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.nickname.localeCompare(b.nickname, 'ko')));
  const title = !space ? '＋ 새 스페이스' : mode === 'settings' ? '⚙ 스페이스 설정' : '👥 멤버·권한 관리';

  return (
    <Modal onClose={onClose}>
      <div className="modal-head">
        <span>{title}</span>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      <div className="modal-body settings">
        {showLook && (
          <section className="space-top">
            <button className="space-icon-btn" disabled={!canManage} onClick={(e) => setEmojiAnchor(e.currentTarget)} title="이모지 고르기">
              <SpaceIcon space={{ icon, image, color }} size={72} round />
            </button>
            <div className="space-names">
              <input className="field" placeholder="스페이스 이름 (예: 디자인팀)" value={name} maxLength={40} disabled={!canManage} onChange={(e) => setName(e.target.value)} autoFocus={!space} />
              <div className="widget-colors">
                {TAGS.map((c) => (
                  <button key={c} disabled={!canManage} className={`color-dot tag-${c} ${color === c ? 'on' : ''}`} onClick={() => setColor(c)} aria-label={c} />
                ))}
              </div>
              <div className="space-photo">
                <button className="btn ghost small" disabled={!canManage || busy} onClick={() => fileRef.current?.click()}>🖼 사진 올리기</button>
                {image && <button className="btn ghost small" disabled={!canManage} onClick={() => setImage('')}>사진 빼기 (이모지로)</button>}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { uploadImage(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
            </div>
          </section>
        )}

        {showMembers && (
          <section>
            <h4>멤버 {members.length}명 <span className="w-sub">· 멤버만 이 스페이스와 안의 페이지를 볼 수 있어요. 역할은 사람마다 따로 정해요</span></h4>
            <ul className="member-list compact">
              {people.map((u) => {
                const role = roleOf(u.id);
                return (
                  <li key={u.id} className={role ? 'on' : 'off'}>
                    <label className="member-pick">
                      <input type="checkbox" checked={!!role} disabled={!canManage} onChange={() => toggle(u.id)} />
                      <Avatar user={u} size={28} />
                      <span className="member-name">
                        <b>{u.nickname}{u.id === me.id && ' (나)'}</b>
                        <small className="w-sub">@{u.username}</small>
                      </span>
                    </label>
                    {role && (
                      <select className="field small" value={role} disabled={!canManage} onChange={(e) => setRole(u.id, e.target.value as SpaceMember['role'])}>
                        {SPACE_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {canManage && (
          <div className="space-actions">
            <button className="btn" disabled={busy} onClick={save}>{space ? '저장' : '만들기'}</button>
          </div>
        )}
      </div>

      {emojiAnchor && (
        <EmojiPicker
          anchor={emojiAnchor}
          onClose={() => setEmojiAnchor(null)}
          onPick={(e) => {
            setIcon(e);
            setImage('');
            setEmojiAnchor(null);
          }}
        />
      )}
    </Modal>
  );
}
