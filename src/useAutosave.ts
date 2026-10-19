import { useEffect, useRef } from 'react';
import { api, type PagePatch } from './api';

export type SaveState = 'saved' | 'saving' | 'error';

const SAVE_DELAY = 700;

// 바뀐 내용을 모았다가 잠깐 멈추면 한 번에 저장한다. 페이지를 떠날 때도 남은 걸 저장.
export function useAutosave(pageId: string, onSaveState: (s: SaveState) => void, onError: (msg: string) => void) {
  const pending = useRef<PagePatch>({});
  const timer = useRef<number>();

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
    // props 는 덮어쓰지 않고 합친다
    const props = patch.props ? { ...pending.current.props, ...patch.props } : pending.current.props;
    pending.current = { ...pending.current, ...patch, ...(props ? { props } : {}) };
    onSaveState('saving');
    window.clearTimeout(timer.current);
    if (immediate) flush();
    else timer.current = window.setTimeout(flush, SAVE_DELAY);
  };

  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    const onLeave = () => flushRef.current(true);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      flushRef.current(true);
    };
  }, [pageId]);

  return { queue, flush };
}
