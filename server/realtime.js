import { Hocuspocus } from '@hocuspocus/server';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';

// 실시간 기능
//  /collab  : 문서 본문 동시 편집 (Yjs + Hocuspocus). 다른 사람 커서도 이 연결로 오간다
//  /events  : "페이지가 바뀌었어요" 알림과 누가 어느 페이지를 보고 있는지
export const FRAGMENT = 'document-store';

export function setupRealtime(server, { repo, userFromRequest }) {
  const blocknote = ServerBlockNoteEditor.create();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 20 * 1024 * 1024 });

  // ── 이벤트 채널 ──
  const clients = new Set(); // { ws, user, clientId, pageId }

  function send(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  // 사람마다 볼 수 있는 페이지의 접속자만 알려 준다
  function broadcastPresence() {
    const viewers = {};
    for (const c of clients) {
      if (!c.pageId) continue;
      (viewers[c.pageId] ??= new Set()).add(c.user.id);
    }
    for (const c of clients) {
      const mine = {};
      for (const [pageId, ids] of Object.entries(viewers)) {
        if (pageId.startsWith('w:') || repo.canAccess(pageId, c.user.id)) mine[pageId] = [...ids];
      }
      send(c.ws, { type: 'presence', viewers: mine });
    }
  }

  // 페이지·데이터베이스가 바뀌었다고 알린다 (by: 바꾼 탭. 그 탭은 무시한다)
  function broadcastChange(by) {
    for (const c of clients) send(c.ws, { type: 'changed', by: by || null });
  }

  let presenceTimer;
  const schedulePresence = () => {
    clearTimeout(presenceTimer);
    presenceTimer = setTimeout(broadcastPresence, 150);
  };

  function onEventsConnection(ws, user) {
    const client = { ws, user, clientId: null, pageId: null };
    clients.add(client);
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg?.type === 'hello') client.clientId = String(msg.clientId || '').slice(0, 40);
      if (msg?.type === 'view') {
        client.pageId = typeof msg.pageId === 'string' ? msg.pageId.slice(0, 60) : null;
        schedulePresence();
      }
    });
    ws.on('close', () => {
      clients.delete(client);
      schedulePresence();
    });
    // 연결이 끊긴 채로 남지 않게
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    schedulePresence();
  }

  const ping = setInterval(() => {
    for (const c of clients) {
      if (!c.ws.isAlive) {
        c.ws.terminate();
        continue;
      }
      c.ws.isAlive = false;
      c.ws.ping();
    }
  }, 30_000);
  ping.unref?.();

  // ── 동시 편집 ──
  const hocuspocus = new Hocuspocus({
    quiet: true,
    debounce: 1500,
    maxDebounce: 8000,
    // 페이지마다 볼 수 있는 사람만 들어온다
    async onAuthenticate({ documentName, context }) {
      if (!context?.user || !repo.canAccess(documentName, context.user.id)) throw new Error('forbidden');
    },
    // 처음 열 때: 저장된 Yjs 상태가 없으면 지금까지의 JSON 본문으로 만든다
    async onLoadDocument({ documentName, document }) {
      const state = repo.getYdoc(documentName);
      if (state && state.length) {
        Y.applyUpdate(document, new Uint8Array(state));
        return document;
      }
      const page = repo.getRaw(documentName);
      const blocks = Array.isArray(page?.content) ? page.content : [];
      if (blocks.length) {
        try {
          blocknote.blocksToYXmlFragment(blocks, document.getXmlFragment(FRAGMENT));
        } catch (err) {
          console.error('본문을 동시 편집 문서로 바꾸지 못했어요:', documentName, err);
        }
      }
      return document;
    },
    // 저장: Yjs 상태와, 검색·복사·홈 위젯이 쓰는 JSON 본문을 함께
    async onStoreDocument({ documentName, document, context }) {
      let blocks = [];
      try {
        blocks = blocknote.yXmlFragmentToBlocks(document.getXmlFragment(FRAGMENT));
      } catch (err) {
        console.error('동시 편집 문서를 본문으로 바꾸지 못했어요:', documentName, err);
        return;
      }
      repo.saveYdoc(documentName, Buffer.from(Y.encodeStateAsUpdate(document)), blocks);
      broadcastChange(context?.clientId);
    },
  });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname !== '/collab' && pathname !== '/events') return socket.destroy();
    const user = userFromRequest(req);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (pathname === '/events') return onEventsConnection(ws, user);
      const request = new Request(`http://localhost${req.url}`, { headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string') });
      const clientId = new URL(req.url, 'http://localhost').searchParams.get('client') || null;
      const conn = hocuspocus.handleConnection(ws, request, { user, clientId });
      ws.on('message', (data) => conn.handleMessage(new Uint8Array(data)));
      ws.on('close', (code, reason) => conn.handleClose({ code, reason: String(reason) }));
      ws.on('pong', () => conn.touch?.());
    });
  });

  // 종료할 때 아직 저장 안 한 문서를 저장
  const flush = () => hocuspocus.flushPendingStores();
  process.on('SIGTERM', () => { flush(); setTimeout(() => process.exit(0), 500); });
  process.on('SIGINT', () => { flush(); setTimeout(() => process.exit(0), 500); });

  return { broadcastChange };
}
