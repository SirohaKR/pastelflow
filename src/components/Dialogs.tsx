import { useMemo, useState, type FormEvent } from 'react';
import { api, type PageMeta } from '../api';
import { ACCENTS, type Settings } from '../theme';
import { ancestors, displayTitle, dotColor, timeAgo } from '../tree';
import { Modal } from './Popover';

const PageIcon = ({ p }: { p: PageMeta }) =>
  p.icon ? <span style={{ width: 22, textAlign: 'center' }}>{p.icon}</span> : (
    <span className="tree-dot" style={{ background: dotColor(p.id) }} />
  );

export function SearchDialog({ pages, onOpen, onClose }: { pages: PageMeta[]; onOpen: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  const results = useMemo(() => {
    const live = pages.filter((p) => p.deletedAt == null);
    const term = q.trim().toLowerCase();
    const list = term ? live.filter((p) => displayTitle(p).toLowerCase().includes(term)) : live;
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
  }, [pages, q]);

  const pick = (id: string) => {
    onOpen(id);
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <input
        className="modal-search"
        autoFocus
        placeholder="페이지 제목으로 찾기…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (e.key === 'Enter' && results[sel]) pick(results[sel].id);
        }}
      />
      <div className="modal-body">
        {!q && <div className="side-label">최근 수정한 페이지</div>}
        {results.length === 0 && <div className="list-empty">찾는 페이지가 없어요.</div>}
        {results.map((p, i) => {
          const path = ancestors(pages, p.parentId).map(displayTitle).join(' / ');
          return (
            <button key={p.id} className={`list-item ${i === sel ? 'selected' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pick(p.id)}>
              <PageIcon p={p} />
              <span className="tree-title">{displayTitle(p)}</span>
              <span className="sub">{path || timeAgo(p.updatedAt)}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export function TrashDialog({ pages, onChanged, onClose }: { pages: PageMeta[]; onChanged: () => void; onClose: () => void }) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  // 휴지통에 들어간 묶음의 맨 위 페이지만 보여 준다
  const items = pages
    .filter((p) => p.deletedAt != null && !(p.parentId && byId.get(p.parentId)?.deletedAt != null))
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

  const run = async (fn: () => Promise<unknown>) => {
    await fn();
    onChanged();
  };

  return (
    <Modal onClose={onClose}>
      <div className="modal-head">
        <span>🗑️ 휴지통</span>
        {items.length > 0 && (
          <button
            className="btn danger"
            onClick={() => confirm('휴지통을 비우면 되돌릴 수 없어요. 비울까요?') && run(api.emptyTrash)}
          >
            모두 비우기
          </button>
        )}
      </div>
      <div className="modal-body">
        {items.length === 0 && <div className="list-empty">휴지통이 비어 있어요.</div>}
        {items.map((p) => (
          <div key={p.id} className="list-item">
            <PageIcon p={p} />
            <span className="tree-title">{displayTitle(p)}</span>
            <span className="sub">{timeAgo(p.deletedAt!)}</span>
            {(p.access ?? 4) >= 3 ? (
              <>
                <button className="btn ghost" onClick={() => run(() => api.restorePage(p.id))}>되돌리기</button>
                <button
                  className="btn ghost"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => confirm(`'${displayTitle(p)}'와 하위 페이지를 완전히 지울까요?`) && run(() => api.deletePage(p.id))}
                >
                  완전 삭제
                </button>
              </>
            ) : (
              <span className="sub">지울 권한이 있는 사람만 되돌릴 수 있어요</span>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function SettingsDialog({
  settings, onChange, onClose,
}: { settings: Settings; onChange: (s: Settings) => void; onClose: () => void }) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  return (
    <Modal onClose={onClose}>
      <div className="modal-head">
        <span>🎨 테마 설정</span>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      <div className="modal-body settings">
        <section>
          <h4>강조색</h4>
          <div className="accent-grid">
            {ACCENTS.map((a) => (
              <button key={a.key} className={`accent-opt ${settings.accent === a.key ? 'selected' : ''}`} onClick={() => set({ accent: a.key })}>
                <span className="dot" style={{ background: a.color }} />
                {a.label}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h4>화면 모드</h4>
          <div className="segmented">
            {([['light', '☀️ 라이트'], ['dark', '🌙 다크'], ['system', '💻 시스템']] as const).map(([k, label]) => (
              <button key={k} className={settings.mode === k ? 'on' : ''} onClick={() => set({ mode: k })}>{label}</button>
            ))}
          </div>
        </section>
        <section>
          <h4>페이지 폭</h4>
          <div className="segmented">
            {([['wide', '넓게'], ['normal', '보통']] as const).map(([k, label]) => (
              <button key={k} className={settings.width === k ? 'on' : ''} onClick={() => set({ width: k })}>{label}</button>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
