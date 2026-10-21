import { useEffect, useRef, useState } from 'react';
import { CLIENT_ID, reloadForVersion, wsUrl } from './session';

// 서버 /events 연결: 다른 사람이 바꾼 내용 알림과, 누가 어느 페이지를 보고 있는지
export function useLive(enabled: boolean, pageId: string | null, onChanged: () => void) {
  const [viewers, setViewers] = useState<Record<string, string[]>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const pageRef = useRef(pageId);
  pageRef.current = pageId;
  const changedRef = useRef(onChanged);
  changedRef.current = onChanged;

  useEffect(() => {
    if (!enabled) return;
    let closed = false;
    let retry = 0;
    let timer: number | undefined;

    const connect = () => {
      const ws = new WebSocket(wsUrl('/events'));
      wsRef.current = ws;
      ws.onopen = () => {
        // 끊겼다가 다시 붙었으면 그 사이 바뀐 걸 받아 온다
        if (retry > 0) changedRef.current();
        retry = 0;
        ws.send(JSON.stringify({ type: 'hello', clientId: CLIENT_ID }));
        ws.send(JSON.stringify({ type: 'view', pageId: pageRef.current }));
      };
      ws.onmessage = (e) => {
        let msg: { type?: string; viewers?: Record<string, string[]>; by?: string | null; version?: string };
        try {
          msg = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (msg.type === 'version' && msg.version) reloadForVersion(msg.version);
        if (msg.type === 'presence' && msg.viewers) setViewers(msg.viewers);
        if (msg.type === 'changed' && msg.by !== CLIENT_ID) changedRef.current();
      };
      ws.onclose = () => {
        if (closed) return;
        retry += 1;
        timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(retry, 5)));
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
      setViewers({});
    };
  }, [enabled]);

  useEffect(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'view', pageId }));
  }, [pageId]);

  return viewers;
}
