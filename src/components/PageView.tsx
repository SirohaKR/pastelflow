import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, type Page, type PageMeta, type PagePatch } from '../api';
import type { Width } from '../theme';
import { useAutosave, type SaveState } from '../useAutosave';
import { Editor } from './Editor';
import { CoverPicker, EmojiPicker, randomCover, randomEmoji } from './Pickers';
import { DatabaseView } from './database/DatabaseView';

export type { SaveState };

type Props = {
  page: Page;
  dark: boolean;
  width: Width;
  autoFocusTitle: boolean;
  onMetaChange: (id: string, patch: PagePatch) => void;
  onSaveState: (s: SaveState) => void;
  onError: (msg: string) => void;
  // 휴지통에서 되돌리기 등으로 페이지 목록이 바뀔 때마다 올라가는 숫자 (데이터베이스 행을 다시 불러옴)
  dataVersion: number;
  onPagesChanged: () => void;
  // 다른 사람이 바꾼 제목·아이콘·커버를 받아오는 최신 목록 값
  meta?: PageMeta;
};

export function PageView({ page, dark, width, autoFocusTitle, onMetaChange, onSaveState, onError, dataVersion, onPagesChanged, meta }: Props) {
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [cover, setCover] = useState(page.cover);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [coverAnchor, setCoverAnchor] = useState<HTMLElement | null>(null);

  const pageId = page.id;
  const isDb = page.kind === 'database';
  const { queue } = useAutosave(pageId, onSaveState, onError);

  // 긴 제목은 줄바꿈해서 보여 준다
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title, width]);

  // 다른 사람이 바꾼 값 반영 (내가 제목을 쓰고 있을 때는 건드리지 않는다)
  useEffect(() => {
    if (!meta) return;
    if (document.activeElement !== titleRef.current) setTitle(meta.title);
    setIcon(meta.icon);
    setCover(meta.cover);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.title, meta?.icon, meta?.cover]);

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

      <div className={`page ${isDb ? 'full' : width}`}>
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
                if (!isDb) (document.querySelector('.editor-wrap [contenteditable]') as HTMLElement | null)?.focus();
              }
            }}
          />
        </div>

        {isDb ? (
          <DatabaseView
            dbId={pageId}
            dark={dark}
            dataVersion={dataVersion}
            onSaveState={onSaveState}
            onError={onError}
            onPagesChanged={onPagesChanged}
          />
        ) : (
          <Editor pageId={pageId} dark={dark} />
        )}
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
