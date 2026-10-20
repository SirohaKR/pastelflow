import { useState } from 'react';
import { api, type Space, type SpaceMember, type TagColor, type User } from '../api';
import { TAGS } from './home/model';
import { Avatar } from './Account';
import { EmojiPicker } from './Pickers';
import { Modal } from './Popover';
import './spaces.css';

type Props = {
  // 없으면 새로 만들기
  space: Space | null;
  me: User;
  users: User[];
  onSaved: () => void;
  onClose: () => void;
  onError: (msg: string) => void;
};

export function SpaceDialog({ space, me, users, onSaved, onClose, onError }: Props) {
  const canManage = !space || space.myRole === 'owner' || me.role === 'admin';
  const [name, setName] = useState(space?.name ?? '');
  const [icon, setIcon] = useState(space?.icon ?? '💬');
  const [color, setColor] = useState<TagColor>(space?.color ?? 'p1');
  const [members, setMembers] = useState<SpaceMember[]>(space?.members ?? [{ userId: me.id, role: 'owner' }]);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);

  const roleOf = (uid: string) => members.find((m) => m.userId === uid)?.role ?? null;
  const toggle = (uid: string) =>
    setMembers((ms) => (ms.some((m) => m.userId === uid) ? ms.filter((m) => m.userId !== uid) : [...ms, { userId: uid, role: 'member' }]));
  const setRole = (uid: string, role: SpaceMember['role']) => setMembers((ms) => ms.map((m) => (m.userId === uid ? { ...m, role } : m)));

  const save = async () => {
    if (!name.trim()) return onError('스페이스 이름을 적어 주세요.');
    if (!members.some((m) => m.role === 'owner')) return onError('스페이스 관리자가 한 명 이상 있어야 해요.');
    setBusy(true);
    try {
      if (space) {
        await api.updateSpace(space.id, { name, icon, color });
        await api.setSpaceMembers(space.id, members);
      } else {
        await api.createSpace({ name, icon, color, members });
      }
      onSaved();
      onClose();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!space) return;
    if (!confirm(`'${space.name}' 스페이스를 지울까요?\n안의 페이지는 내 휴지통으로 옮겨져요. 되돌리면 '내 페이지'로 돌아와요.`)) return;
    try {
      await api.deleteSpace(space.id);
      onSaved();
      onClose();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  // 사용 중지되지 않은 사람만, 나를 맨 위로
  const people = users.filter((u) => !u.disabled).sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.nickname.localeCompare(b.nickname, 'ko')));

  return (
    <Modal onClose={onClose}>
      <div className="modal-head">
        <span>{space ? (canManage ? '⚙ 스페이스 설정' : '👥 스페이스 멤버') : '＋ 새 스페이스'}</span>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      <div className="modal-body settings">
        <section className="space-top">
          <button className={`space-icon tag-${color}`} disabled={!canManage} onClick={(e) => setEmojiAnchor(e.currentTarget)} title="아이콘 바꾸기">
            {icon || '#'}
          </button>
          <div className="space-names">
            <input className="field" placeholder="스페이스 이름 (예: 디자인팀)" value={name} maxLength={40} disabled={!canManage} onChange={(e) => setName(e.target.value)} autoFocus={!space} />
            <div className="widget-colors">
              {TAGS.map((c) => (
                <button key={c} disabled={!canManage} className={`color-dot tag-${c} ${color === c ? 'on' : ''}`} onClick={() => setColor(c)} aria-label={c} />
              ))}
            </div>
          </div>
        </section>

        <section>
          <h4>멤버 {members.length}명 <span className="w-sub">· 멤버만 이 스페이스와 안의 페이지를 볼 수 있어요</span></h4>
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
                      <option value="member">멤버</option>
                      <option value="owner">스페이스 관리자</option>
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {canManage && (
          <div className="space-actions">
            {space && <button className="btn danger" onClick={remove}>스페이스 지우기</button>}
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
            setEmojiAnchor(null);
          }}
        />
      )}
    </Modal>
  );
}
