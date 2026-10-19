import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type Page, type Row } from '../../api';
import { useAutosave, type SaveState } from '../../useAutosave';
import { Editor } from '../Editor';
import { EmojiPicker, randomEmoji } from '../Pickers';
import { AddPropertyMenu, PropEditor, PropLabel } from './Cells';
import type { DbOps, RowPatch } from './DatabaseView';

type Props = {
  row: Row;
  ops: DbOps;
  dark: boolean;
  onLocalChange: (id: string, patch: RowPatch) => void;
  onClose: () => void;
  onDelete: () => void;
  onSaveState: (s: SaveState) => void;
  onError: (msg: string) => void;
};

function loadWide() {
  try {
    return localStorage.getItem('pf-peek-wide') === '1';
  } catch {
    return false;
  }
}

// 행을 오른쪽 패널로 열어 속성과 본문(BlockNote)을 고친다
export function RowPeek({ row, ops, dark, onLocalChange, onClose, onDelete, onSaveState, onError }: Props) {
  const [page, setPage] = useState<Page | null>(null);
  const [title, setTitle] = useState(row.title);
  const [icon, setIcon] = useState(row.icon);
  const [wide, setWide] = useState(loadWide);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const { queue } = useAutosave(row.id, onSaveState, onError);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    api.getPage(row.id).then((p) => alive && setPage(p)).catch((e) => alive && onError(e.message));
    return () => {
      alive = false;
    };
  }, [row.id, onError]);

  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title, wide]);

  // 에디터 안의 메뉴를 닫는 Esc 는 건드리지 않는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.('.bn-container, .popover')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setMeta = (patch: { title?: string; icon?: string }, immediate = false) => {
    onLocalChange(row.id, patch);
    queue(patch, immediate);
  };

  const toggleWide = () => {
    setWide((w) => {
      try {
        localStorage.setItem('pf-peek-wide', w ? '0' : '1');
      } catch {
        /* 무시 */
      }
      return !w;
    });
  };

  return createPortal(
    <div className="peek-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={`peek ${wide ? 'wide' : ''}`} role="dialog" aria-label="항목 열기">
        <div className="peek-bar">
          <button className="icon-btn" title="닫기" onClick={onClose}>»</button>
          <button className="icon-btn" title={wide ? '패널로 보기' : '넓게 보기'} onClick={toggleWide}>{wide ? '⇥' : '⤢'}</button>
          <span className="peek-spacer" />
          <button
            className="btn ghost danger-text"
            onClick={() => confirm('이 항목을 휴지통으로 옮길까요?') && onDelete()}
          >
            🗑️ 휴지통으로
          </button>
        </div>

        <div className="peek-scroll">
          <div className="peek-body">
            <div className="peek-head">
              {icon ? (
                <button className="page-icon small" title="아이콘 바꾸기" onClick={(e) => setEmojiAnchor(e.currentTarget)}>{icon}</button>
              ) : (
                <button
                  className="btn ghost add-icon"
                  onClick={() => {
                    const e = randomEmoji();
                    setIcon(e);
                    setMeta({ icon: e }, true);
                  }}
                >
                  😊 아이콘 추가
                </button>
              )}
              <textarea
                ref={titleRef}
                rows={1}
                className="title-input peek-title"
                value={title}
                placeholder="제목 없음"
                autoFocus={!row.title}
                onChange={(e) => {
                  const v = e.target.value.replace(/\n/g, ' ');
                  setTitle(v);
                  setMeta({ title: v });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    (document.querySelector('.peek .editor-wrap [contenteditable]') as HTMLElement | null)?.focus();
                  }
                }}
              />
            </div>

            <div className="peek-props">
              {ops.schema.properties.map((p) => (
                <div key={p.id} className="peek-prop">
                  <div className="peek-prop-label"><PropLabel prop={p} /></div>
                  <div className="peek-prop-value">
                    <PropEditor
                      prop={p}
                      value={row.props[p.id]}
                      onChange={(v) => ops.updateRow(row.id, { props: { [p.id]: v } })}
                      onOptionsChange={(o) => ops.setOptions(p.id, o)}
                    />
                  </div>
                </div>
              ))}
              <button className="btn ghost add-prop" onClick={(e) => setAddAnchor(e.currentTarget)}>＋ 속성 추가</button>
            </div>

            <div className="peek-divider" />

            {page ? (
              <Editor initialContent={page.content} dark={dark} onChange={(content) => queue({ content })} />
            ) : (
              <div className="db-loading">본문을 불러오는 중…</div>
            )}
          </div>
        </div>
      </aside>

      {emojiAnchor && (
        <EmojiPicker
          anchor={emojiAnchor}
          onClose={() => setEmojiAnchor(null)}
          onPick={(e) => {
            setIcon(e);
            setMeta({ icon: e }, true);
            setEmojiAnchor(null);
          }}
        />
      )}
      {addAnchor && <AddPropertyMenu anchor={addAnchor} onClose={() => setAddAnchor(null)} onAdd={ops.addProperty} />}
    </div>,
    document.body,
  );
}
