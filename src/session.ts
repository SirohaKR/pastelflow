import { createContext, useContext } from 'react';
import type { TagColor, User } from './api';

// 이 브라우저 탭을 구분하는 값. 내가 일으킨 변경 알림은 무시할 때 쓴다
export const CLIENT_ID = Math.random().toString(36).slice(2, 10);

export const MeContext = createContext<User | null>(null);
export const useMe = () => useContext(MeContext);

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
