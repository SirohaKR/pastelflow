import { useState } from 'react';
import type { PropValue, User } from '../../api';
import { useUsers } from '../../session';
import { Avatar } from '../Account';
import { Popover } from '../Popover';

// 담당자(사람) 속성 값: 사용자 id 목록
export const asPeople = (v: PropValue | undefined): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function Person({ user }: { user: User | undefined }) {
  return (
    <span className="person">
      <Avatar user={user} size={20} />
      <span className="person-name">{user?.nickname ?? '알 수 없음'}</span>
    </span>
  );
}

// 읽기 전용 미리보기 (표 칸·칸반 카드)
export function PeoplePreview({ ids, max = 4 }: { ids: string[]; max?: number }) {
  const users = useUsers();
  if (!ids.length) return null;
  return (
    <span className="people">
      {ids.slice(0, max).map((id) => <Person key={id} user={users.find((u) => u.id === id)} />)}
      {ids.length > max && <span className="file-more">+{ids.length - max}</span>}
    </span>
  );
}

type Props = {
  value: PropValue | undefined;
  onChange: (v: PropValue | null) => void;
  readOnly?: boolean;
};

// 눌러서 담당자를 고르는 칸 (여러 명)
export function PersonCell({ value, onChange, readOnly = false }: Props) {
  const users = useUsers();
  const ids = asPeople(value);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [q, setQ] = useState('');

  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    onChange(next.length ? next : null);
  };

  const active = users.filter((u) => !u.disabled || ids.includes(u.id));
  const term = q.trim().toLowerCase();
  const list = term ? active.filter((u) => u.nickname.toLowerCase().includes(term) || u.username.toLowerCase().includes(term)) : active;

  return (
    <>
      <button
        className="cell-select cell-people"
        disabled={readOnly}
        onClick={(e) => {
          setQ('');
          setAnchor(e.currentTarget);
        }}
      >
        {ids.length ? <PeoplePreview ids={ids} max={6} /> : <span className="cell-empty">비어 있음</span>}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)}>
          <div className="menu people-menu">
            <input className="people-search" autoFocus placeholder="이름 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
            {list.map((u) => (
              <button key={u.id} className={ids.includes(u.id) ? 'on' : ''} onClick={() => toggle(u.id)}>
                <Avatar user={u} size={22} />
                <span className="people-item-name">{u.nickname}</span>
                {ids.includes(u.id) && <span className="check">✓</span>}
              </button>
            ))}
            {!list.length && <div className="list-empty">찾는 사람이 없어요.</div>}
          </div>
        </Popover>
      )}
    </>
  );
}
