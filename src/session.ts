import { createContext, useContext } from 'react';
import type { TagColor, User } from './api';

// 이 브라우저 탭을 구분하는 값. 내가 일으킨 변경 알림은 무시할 때 쓴다
export const CLIENT_ID = Math.random().toString(36).slice(2, 10);

// 빌드할 때 package.json 버전이 들어간다 (vite.config.ts)
declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__;

// 서버가 새 버전이면 새로고침 (예전 화면으로 문서를 고치면 새 요소가 지워질 수 있어서).
// 캐시 때문에 새로고침해도 그대로면 계속 돌지 않게 버전마다 한 번만
export function reloadForVersion(serverVersion: string) {
  if (!serverVersion || serverVersion === APP_VERSION) return;
  const key = `pf-reloaded:${serverVersion}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    /* 그냥 새로고침 */
  }
  location.reload();
}

export const MeContext = createContext<User | null>(null);
export const useMe = () => useContext(MeContext);

// 모든 사용자 (담당자 칸에서 이름·사진을 보여 줄 때)
export const UsersContext = createContext<User[]>([]);
export const useUsers = () => useContext(UsersContext);

// 다른 사람 커서·이름표 색 (밝은 배경에서도 잘 보이는 진한 쪽)
export const CURSOR_COLORS: Record<TagColor, string> = {
  p1: '#6e58c9',
  p2: '#2a8f6c',
  p3: '#c4643a',
  p4: '#2f76b3',
  p5: '#c04d7c',
  p6: '#937210',
};

export const wsUrl = (path: string) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`;
