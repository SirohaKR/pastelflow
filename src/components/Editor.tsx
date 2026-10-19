import { useEffect, useState } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { ko } from '@blocknote/core/locales';
import { withCollaboration } from '@blocknote/core/yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { api, type User } from '../api';
import { CLIENT_ID, CURSOR_COLORS, useMe, wsUrl } from '../session';

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
type Props = { pageId: string; dark: boolean };

// 본문은 서버와 실시간으로 맞춰지고 저장도 서버가 한다. 다른 사람 커서가 이름표와 함께 보인다
export function Editor({ pageId, dark }: Props) {
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
      <CollabEditor key={pageId} conn={conn} dark={dark} me={me} />
    </>
  );
}

function CollabEditor({ conn, dark, me }: { conn: Conn; dark: boolean; me: User }) {
  const editor = useCreateBlockNote(
    withCollaboration({
      dictionary,
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

  return (
    <div className="editor-wrap">
      <BlockNoteView editor={editor} theme={dark ? 'dark' : 'light'} />
    </div>
  );
}
