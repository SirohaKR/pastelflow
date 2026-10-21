import { fontSource } from '../server/shared/fonts.js';

// 글꼴 파일은 처음 쓰일 때 한 번만 <head> 에 넣는다 (같은 CSS 파일을 쓰는 글꼴끼리도 한 번)
const loaded = new Set<string>();

export function ensureFont(id: string) {
  if (!id || loaded.has(id)) return;
  loaded.add(id);
  const src = fontSource(id);
  if (!src) return;
  if (src.href) {
    if (loaded.has(src.href)) return;
    loaded.add(src.href);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = src.href;
    document.head.appendChild(link);
  } else if (src.css) {
    const style = document.createElement('style');
    style.dataset.font = id;
    style.textContent = src.css;
    document.head.appendChild(style);
  }
}

// root 안에 글꼴이 입혀진 글자가 생기면 그 글꼴을 불러온다
export function watchFonts(root: HTMLElement) {
  const scan = () => root.querySelectorAll<HTMLElement>('[data-font]').forEach((el) => ensureFont(el.dataset.font ?? ''));
  scan();
  const mo = new MutationObserver(scan);
  mo.observe(root, { childList: true, subtree: true });
  return () => mo.disconnect();
}
