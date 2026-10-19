import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, type Page, type PagePatch } from '../api';
import type { Width } from '../theme';
import { Editor } from './Editor';
import { CoverPicker, EmojiPicker, randomCover, randomEmoji } from './Pickers';

export type SaveState = 'saved' | 'saving' | 'error';

type Props = {
  page: Page;
  dark: boolean;
  width: Width;
  autoFocusTitle: boolean;
  onMetaChange: (id: string, patch: PagePatch) => void;
  onSaveState: (s: SaveState) => void;
  onError: (msg: string) => void;
};

const SAVE_DELAY = 700;

export function PageView({ page, dark, width, autoFocusTitle, onMetaChange, onSaveState, onError }: Props) {
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [cover, setCover] = useState(page.cover);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [coverAnchor, setCoverAnchor] = useState<HTMLElement | null>(null);

  // 바뀐 내용을 모았다가 잠깐 멈추면 한 번에 저장
  const pending = useRef<PagePatch>({});
  const timer = useRef<number>();
  const pageId = page.id;

  // 긴 제목은 줄바꿈해서 보여 준다
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title, width]);

  const flush = (keepalive = false) => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    onSaveState('saving');
    api
      .updatePage(pageId, patch, keepalive)
      .then(() => {
        if (!Object.keys(pending.current).length) onSaveState('saved');
      })
      .catch((e) => {
        onSaveState('error');
        onError(e.message);
      });
  };

  const queue = (patch: PagePatch, immediate = false) => {
    pending.current = { ...pending.current, ...patch };
    onSaveState('saving');
    window.clearTimeout(timer.current);
    if (immediate) flush();
    else timer.current = window.setTimeout(flush, SAVE_DELAY);
  };

  useEffect(() => {
    const onLeave = () => flush(true);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      flush(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  const updateMeta = (patch: PagePatch, immediate = false) => {
    onMetaChange(pageId, patch);
    queue(patch, immediate);
  };

  const uploadCover = async (file: File) => {
    try {
      const { url } = await api.upload(file);
      setCover(url);
      updateMeta({ cover: url }, true);
      setCoverAnchor(null);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const coverStyle = cover
    ? cover.startsWith('#')
      ? { background: cover }
      : { backgroundImage: `url("${cover}")` }
    : undefined;

  return (
    <div className={cover ? 'has-cover' : ''}>
      {cover && (
        <div className="cover" style={coverStyle}>
          <div className="cover-tools">
            <button className="chip" onClick={(e) => setCoverAnchor(e.currentTarget)}>커버 바꾸기</button>
          </div>
        </div>
      )}

      <div className={`page ${width}`}>
        <div className="page-head">
          {icon && (
            <button className="page-icon" onClick={(e) => setEmojiAnchor(e.currentTarget)} title="아이콘 바꾸기">
              {icon}
            </button>
          )}
          <div className="page-head-tools">
            {!icon && (
              <button
                className="btn ghost"
                onClick={() => {
                  const e = randomEmoji();
                  setIcon(e);
                  updateMeta({ icon: e }, true);
                }}
              >
                😊 아이콘 추가
              </button>
            )}
            {!cover && (
              <button
                className="btn ghost"
                onClick={() => {
                  const c = randomCover();
                  setCover(c);
                  updateMeta({ cover: c }, true);
                }}
              >
                🖼️ 커버 추가
              </button>
            )}
          </div>
          <textarea
            ref={titleRef}
            rows={1}
            className="title-input"
            value={title}
            placeholder="제목 없음"
            autoFocus={autoFocusTitle}
            onChange={(e) => {
              const v = e.target.value.replace(/\n/g, ' ');
              setTitle(v);
              updateMeta({ title: v });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                (document.querySelector('.editor-wrap [contenteditable]') as HTMLElement | null)?.focus();
              }
            }}
          />
        </div>

        <Editor
          initialContent={page.content}
          dark={dark}
          onChange={(content) => queue({ content })}
        />
      </div>

      {emojiAnchor && (
        <EmojiPicker
          anchor={emojiAnchor}
          onClose={() => setEmojiAnchor(null)}
          onPick={(e) => {
            setIcon(e);
            updateMeta({ icon: e }, true);
            setEmojiAnchor(null);
          }}
        />
      )}
      {coverAnchor && (
        <CoverPicker
          anchor={coverAnchor}
          value={cover}
          onClose={() => setCoverAnchor(null)}
          onUpload={uploadCover}
          onPick={(c) => {
            setCover(c);
            updateMeta({ cover: c }, true);
            setCoverAnchor(null);
          }}
        />
      )}
    </div>
  );
}
