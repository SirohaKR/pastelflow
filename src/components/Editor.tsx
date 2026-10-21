import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type MouseEvent } from 'react';
import {
  FormattingToolbar,
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react';
import { filterSuggestionItems } from '@blocknote/core';
import { TextSelection } from '@tiptap/pm/state';
import { BlockNoteView } from '@blocknote/mantine';
import { ko } from '@blocknote/core/locales';
import { withCollaboration } from '@blocknote/core/yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { api, type User } from '../api';
import { CLIENT_ID, CURSOR_COLORS, useMe, wsUrl } from '../session';
import { editorSchema } from '../../server/shared/editorSchema.js';
import { guessLanguage, syntaxHighlighter } from '../codeHighlight';
import { watchFonts } from '../fonts';
import { FontButton } from './FontButton';

// 클립보드에 글 넣기 (http 로 접속하면 navigator.clipboard 가 없어서 예전 방식으로)
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    /* 예전 방식으로 */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

const dictionary = {
  ...ko,
  placeholders: {
    ...ko.placeholders,
    default: "내용을 입력하거나 '/' 를 눌러 블록을 추가하세요",
    emptyDocument: "여기에 쓰기 시작하세요. '/' 로 블록을 넣을 수 있어요",
  },
};

// 서버(server/realtime.js)와 같은 이름
const FRAGMENT = 'document-store';

type Conn = { doc: Y.Doc; provider: HocuspocusProvider };
type Props = { pageId: string; dark: boolean; readOnly?: boolean };

// 본문은 서버와 실시간으로 맞춰지고 저장도 서버가 한다. 다른 사람 커서가 이름표와 함께 보인다
export function Editor({ pageId, dark, readOnly = false }: Props) {
  const me = useMe();
  const [conn, setConn] = useState<Conn | null>(null);
  const [synced, setSynced] = useState(false);
  const [slow, setSlow] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: wsUrl(`/collab?client=${CLIENT_ID}`),
      name: pageId,
      document: doc,
      token: 'session',
      onSynced: () => setSynced(true),
      onStatus: ({ status }) => setOnline(status === 'connected'),
      onAuthenticationFailed: () => setOnline(false),
    });
    setConn({ doc, provider });
    setSynced(false);
    setSlow(false);
    const t = window.setTimeout(() => setSlow(true), 5000);
    return () => {
      window.clearTimeout(t);
      provider.destroy();
      doc.destroy();
      setConn(null);
    };
  }, [pageId]);

  if (!conn || !me) return null;
  if (!synced) {
    return (
      <div className="editor-wrap editor-wait">
        {slow ? '실시간 연결이 늦어지고 있어요. 서버가 켜져 있는지 확인해 주세요…' : '본문을 불러오는 중…'}
      </div>
    );
  }
  return (
    <>
      {!online && <div className="editor-offline">⚠ 연결이 끊겼어요. 다시 연결되면 고친 내용이 자동으로 합쳐져요.</div>}
      <CollabEditor key={pageId} conn={conn} dark={dark} me={me} readOnly={readOnly} />
    </>
  );
}

function CollabEditor({ conn, dark, me, readOnly }: { conn: Conn; dark: boolean; me: User; readOnly: boolean }) {
  const pickRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const editor = useCreateBlockNote(
    withCollaboration({
      schema: editorSchema,
      dictionary,
      // 코드 블록 색 강조
      extensions: [syntaxHighlighter],
      uploadFile: async (file: File) => (await api.upload(file)).url,
      collaboration: {
        provider: { awareness: conn.provider.awareness ?? undefined },
        fragment: conn.doc.getXmlFragment(FRAGMENT),
        user: { name: me.nickname, color: CURSOR_COLORS[me.color] ?? CURSOR_COLORS.p1 },
        showCursorLabels: 'always',
      },
    }),
    [conn],
  );

  // 파일을 올려서 지금 커서 자리에 📎 첨부로 넣는다 (표 칸 안에도 들어간다)
  const insertFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploading((n) => n + files.length);
    for (const f of files) {
      try {
        const r = await api.upload(f);
        editor.insertInlineContent([
          { type: 'attachment', props: { url: r.url, name: r.name || f.name, mime: r.mime || f.type } },
          ' ',
        ]);
      } catch (e) {
        alert((e as Error).message);
      }
      setUploading((n) => n - 1);
    }
  };

  const inTableCell = (el: EventTarget | Node | null) => {
    const node = el instanceof Element ? el : (el as Node | null)?.parentElement;
    return !!node?.closest?.('.bn-editor td, .bn-editor th');
  };

  // 표 칸에 파일을 끌어 놓으면 블록 대신 칸 안에 첨부로 넣는다
  const onDropCapture = (e: DragEvent) => {
    if (readOnly || !e.dataTransfer?.files.length || !inTableCell(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    const view = editor.prosemirrorView;
    const at = view?.posAtCoords({ left: e.clientX, top: e.clientY });
    if (view && at) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))));
    insertFiles([...e.dataTransfer.files]);
  };

  // 언어를 아직 안 고른 코드 블록에 코드를 붙여 넣으면 언어를 알아맞혀서 색을 입힌다
  const guessAfterPaste = () => {
    let block;
    try {
      block = editor.getTextCursorPosition().block;
    } catch {
      return;
    }
    if (block.type !== 'codeBlock' || block.props.language !== 'text') return;
    const id = block.id;
    window.setTimeout(() => {
      const cur = editor.getBlock(id);
      if (!cur || cur.type !== 'codeBlock' || cur.props.language !== 'text') return;
      const text = (Array.isArray(cur.content) ? cur.content : []).map((c) => ('text' in c ? c.text : '')).join('');
      const lang = guessLanguage(text);
      if (lang) editor.updateBlock(id, { props: { language: lang } });
    }, 0);
  };

  // 표 칸에서 파일을 붙여 넣어도 칸 안에 첨부로
  const onPasteCapture = (e: ClipboardEvent) => {
    if (!readOnly && !e.clipboardData?.files.length) guessAfterPaste();
    if (readOnly || !e.clipboardData?.files.length || !inTableCell(window.getSelection()?.anchorNode ?? null)) return;
    e.preventDefault();
    e.stopPropagation();
    insertFiles([...e.clipboardData.files]);
  };

  // 마우스를 올린 코드 블록 오른쪽 위에 복사 버튼
  const wrapRef = useRef<HTMLDivElement>(null);
  const [codeHover, setCodeHover] = useState<{ el: HTMLElement; top: number; right: number } | null>(null);
  const [copied, setCopied] = useState(false);
  // 문서에 쓰인 글꼴 파일 불러오기
  useEffect(() => (wrapRef.current ? watchFonts(wrapRef.current) : undefined), []);
  const onMouseMove = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.code-copy')) return;
    const el = t.closest<HTMLElement>('.bn-block-content[data-content-type="codeBlock"]');
    if (!el || !wrapRef.current) {
      if (codeHover) setCodeHover(null);
      return;
    }
    if (codeHover?.el === el) return;
    const w = wrapRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setCopied(false);
    setCodeHover({ el, top: r.top - w.top + 8, right: w.right - r.right + 10 });
  };
  const copyCode = async () => {
    if (!codeHover) return;
    await copyText(codeHover.el.querySelector('pre code')?.textContent ?? '');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      ref={wrapRef}
      className="editor-wrap"
      onDropCapture={onDropCapture}
      onPasteCapture={onPasteCapture}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setCodeHover(null)}
    >
      {codeHover && (
        <button className={`code-copy ${copied ? 'done' : ''}`} style={{ top: codeHover.top, right: codeHover.right }} onClick={copyCode} title="코드 복사">
          {copied ? '✓ 복사됨' : '⧉ 복사'}
        </button>
      )}
      <BlockNoteView editor={editor} theme={dark ? 'dark' : 'light'} editable={!readOnly} slashMenu={false} formattingToolbar={false}>
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar>
              {getFormattingToolbarItems().flatMap((item) => (item.key === 'colorStyleButton' ? [item, <FontButton key="fontButton" />] : [item]))}
            </FormattingToolbar>
          )}
        />
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => filterSuggestionItems([
            ...getDefaultReactSlashMenuItems(editor),
            {
              title: '파일 첨부 (줄 안에)',
              subtext: '글자처럼 줄 안에 넣어요. 표 칸 안에도 들어가요',
              aliases: ['첨부', '파일', 'attach', 'file', 'clip', 'ckqn'],
              group: '기타',
              icon: <span className="slash-icon">📎</span>,
              onItemClick: () => pickRef.current?.click(),
            },
          ], query)}
        />
      </BlockNoteView>
      {uploading > 0 && <div className="attach-busy">📎 올리는 중… {uploading}</div>}
      <input
        ref={pickRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) insertFiles([...e.target.files]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
