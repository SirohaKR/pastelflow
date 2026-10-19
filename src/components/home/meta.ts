import type { AgendaDb, PageMeta, PropValue, Props, Widget, WidgetSize, WidgetType } from '../../api';

export const WIDGETS: { type: WidgetType; label: string; icon: string; desc: string; size: WidgetSize }[] = [
  { type: 'today', label: '오늘 한눈에', icon: '☀️', desc: '날짜, 인사말, 오늘 일정 수', size: 'm' },
  { type: 'todo', label: '오늘 할 일', icon: '✅', desc: '데이터베이스에서 오늘 할 일을 모아 체크', size: 'm' },
  { type: 'calendar', label: '미니 캘린더', icon: '📅', desc: '이번 달 달력과 그날 일정', size: 's' },
  { type: 'dday', label: 'D-day', icon: '⏳', desc: '중요한 날까지 남은 날', size: 's' },
  { type: 'habits', label: '습관 체크', icon: '🌱', desc: '매일 하는 일을 7일 칸으로 체크', size: 'm' },
  { type: 'goals', label: '목표 진행률', icon: '🎯', desc: '목표를 막대로 채워 가기', size: 's' },
  { type: 'memo', label: '빠른 메모', icon: '📝', desc: '포스트잇처럼 바로 적는 메모', size: 's' },
  { type: 'budget', label: '가계부', icon: '💰', desc: '이번 달 수입·지출과 분류별 합계', size: 'm' },
  { type: 'links', label: '링크 모음', icon: '🔗', desc: '자주 가는 사이트 바로가기', size: 's' },
  { type: 'recent', label: '최근·즐겨찾기', icon: '🕘', desc: '최근 고친 페이지와 즐겨찾기', size: 's' },
];

export const widgetMeta = (t: WidgetType) => WIDGETS.find((w) => w.type === t)!;

// 위젯들이 함께 쓰는 데이터와 동작
export type HomeCtx = {
  pages: PageMeta[];
  agenda: AgendaDb[];
  openPage: (id: string) => void;
  updateRow: (dbId: string, rowId: string, props: Record<string, PropValue | null>) => void;
  addRow: (dbId: string, title: string, props: Props) => Promise<void>;
  onError: (msg: string) => void;
};

export type WidgetProps<C> = {
  widget: Widget;
  config: C;
  setConfig: (next: C) => void;
  ctx: HomeCtx;
};

export const uid = () => Math.random().toString(36).slice(2, 10);
