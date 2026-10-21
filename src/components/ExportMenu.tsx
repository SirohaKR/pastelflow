import { useState } from 'react';
import { Popover } from './Popover';

// 페이지 내려받기 메뉴: PDF(인쇄 화면) / Markdown / HTML
export function ExportMenu({ pageId }: { pageId: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const url = (format: string) => `/api/pages/${pageId}/export?format=${format}`;
  return (
    <>
      <button className="icon-btn" title="내려받기" onClick={(e) => setAnchor(e.currentTarget)}>⬇</button>
      {anchor && (
        <Popover anchor={anchor} align="right" onClose={() => setAnchor(null)}>
          <div className="menu">
            <div className="pop-head">이 페이지 내려받기</div>
            <button onClick={() => { window.open(url('print'), '_blank', 'noopener'); setAnchor(null); }}>
              📕 PDF <small className="menu-sub">인쇄 창에서 'PDF로 저장'</small>
            </button>
            <a className="menu-link" href={url('md')} download onClick={() => setAnchor(null)}>📝 Markdown (.md)</a>
            <a className="menu-link" href={url('html')} download onClick={() => setAnchor(null)}>🌐 HTML (.html)</a>
          </div>
        </Popover>
      )}
    </>
  );
}
