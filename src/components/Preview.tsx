import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BlockNoteEditor } from '@blocknote/core';

// 첨부파일 미리보기 창. 어디서든 openPreview() 로 연다 (문서 📎 첨부, 데이터베이스 파일 칸)
export type PreviewFile = { url: string; name: string; mime?: string; size?: number };

export function openPreview(files: PreviewFile[], index = 0) {
  window.dispatchEvent(new CustomEvent('pf:preview', { detail: { files, index } }));
}

type Kind = 'image' | 'pdf' | 'video' | 'audio' | 'markdown' | 'text' | 'none';

const TEXT_EXT = ['txt', 'csv', 'tsv', 'json', 'log', 'xml', 'yml', 'yaml', 'ini', 'toml', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'kt', 'dart', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'sh', 'sql', 'css', 'html'];

function kindOf(f: PreviewFile): Kind {
  const ext = (f.name || f.url).split('.').pop()?.toLowerCase() ?? '';
  const mime = f.mime ?? '';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'].includes(ext)) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video';
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(ext)) return 'audio';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (mime.startsWith('text/') || TEXT_EXT.includes(ext)) return 'text';
  return 'none';
}

// 너무 큰 글 파일은 앞부분만
const TEXT_LIMIT = 300_000;

// Markdown 은 에디터와 같은 방식으로 블록으로 읽어서 보여 준다 (스크립트는 들어오지 않음)
let mdEditor: BlockNoteEditor | null = null;
async function markdownToHtml(md: string) {
  mdEditor ??= BlockNoteEditor.create();
  const blocks = await mdEditor.tryParseMarkdownToBlocks(md);
  const html = await mdEditor.blocksToHTMLLossy(blocks);
  return html.replace(/(href|src)="\s*javascript:[^"]*"/gi, '$1="#"').replace(/\uFFFC/g, '');
}

function TextBody({ file, markdown }: { file: PreviewFile; markdown: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const [error, setError] = useState('');
  const [cut, setCut] = useState(false);

  useEffect(() => {
    let alive = true;
    setText(null);
    setHtml(null);
    setError('');
    fetch(file.url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('파일을 불러오지 못했어요.'))))
      .then(async (t) => {
        if (!alive) return;
        setCut(t.length > TEXT_LIMIT);
        const shown = t.slice(0, TEXT_LIMIT);
        setText(shown);
        if (markdown) {
          const h = await markdownToHtml(shown).catch(() => null);
          if (alive) setHtml(h);
        }
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [file.url, markdown]);

  if (error) return <div className="pv-empty">{error}</div>;
  if (text == null) return <div className="pv-empty">불러오는 중…</div>;
  return (
    <div className="pv-text-wrap">
      {markdown && html != null && (
        <div className="pv-switch">
          <button className={!raw ? 'on' : ''} onClick={() => setRaw(false)}>보기</button>
          <button className={raw ? 'on' : ''} onClick={() => setRaw(true)}>원문</button>
        </div>
      )}
      {markdown && html != null && !raw
        ? <div className="pv-md" dangerouslySetInnerHTML={{ __html: html }} />
        : <pre className="pv-text">{text}</pre>}
      {cut && <div className="pv-note">파일이 커서 앞부분만 보여 줘요. 전체는 내려받아서 보세요.</div>}
    </div>
  );
}

function Body({ file }: { file: PreviewFile }) {
  const kind = kindOf(file);
  if (kind === 'image') return <img className="pv-img" src={file.url} alt={file.name} />;
  if (kind === 'pdf') return <iframe className="pv-frame" src={file.url} title={file.name} />;
  if (kind === 'video') return <video className="pv-media" src={file.url} controls autoPlay={false} />;
  if (kind === 'audio') return <audio className="pv-audio" src={file.url} controls />;
  if (kind === 'markdown' || kind === 'text') return <TextBody key={file.url} file={file} markdown={kind === 'markdown'} />;
  return (
    <div className="pv-empty">
      <div className="pv-big">📄</div>
      이 형식은 미리보기를 할 수 없어요.
      <a className="pv-btn" href={file.url} download={file.name}>⬇ 내려받기</a>
    </div>
  );
}

// 앱에 하나만 두는 미리보기 창
export function PreviewHost() {
  const [state, setState] = useState<{ files: PreviewFile[]; index: number } | null>(null);
  const close = useCallback(() => setState(null), []);
  const step = useCallback((d: number) => setState((s) => (s ? { ...s, index: (s.index + d + s.files.length) % s.files.length } : s)), []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const { files, index } = (e as CustomEvent<{ files: PreviewFile[]; index: number }>).detail;
      if (files?.length) setState({ files, index: Math.min(Math.max(index, 0), files.length - 1) });
    };
    window.addEventListener('pf:preview', onOpen);
    return () => window.removeEventListener('pf:preview', onOpen);
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (state.files.length > 1 && e.key === 'ArrowLeft') step(-1);
      if (state.files.length > 1 && e.key === 'ArrowRight') step(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, close, step]);

  if (!state) return null;
  const file = state.files[state.index];
  const many = state.files.length > 1;
  return createPortal(
    <div className="overlay pv-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="pv" role="dialog" aria-label={`${file.name} 미리보기`}>
        <div className="pv-head">
          <span className="pv-name" title={file.name}>{file.name || '파일'}</span>
          {many && <span className="pv-count">{state.index + 1} / {state.files.length}</span>}
          <span className="pv-tools">
            {many && <button className="icon-btn" title="이전 (←)" onClick={() => step(-1)}>◀</button>}
            {many && <button className="icon-btn" title="다음 (→)" onClick={() => step(1)}>▶</button>}
            <a className="icon-btn" href={file.url} target="_blank" rel="noopener noreferrer" title="새 탭에서 열기">↗</a>
            <a className="icon-btn" href={file.url} download={file.name} title="내려받기">⬇</a>
            <button className="icon-btn" title="닫기 (Esc)" onClick={close}>✕</button>
          </span>
        </div>
        <div className="pv-body">
          <Body key={file.url} file={file} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
