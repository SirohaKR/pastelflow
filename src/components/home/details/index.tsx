import type { Widget } from '../../../api';
import type { HomeCtx } from '../meta';
import { BudgetDetail } from './BudgetDetail';
import { LinksDetail } from './LinksDetail';
import {
  CalendarDetail, DdayDetail, GoalsDetail, HabitsDetail, MemoDetail, RecentDetail, TodayDetail, TodoDetail,
} from './MoreDetails';

export function WidgetDetail({ widget, ctx, setConfig }: { widget: Widget; ctx: HomeCtx; setConfig: (c: Record<string, unknown>) => void }) {
  const p = { widget, ctx, config: widget.config as never, setConfig: setConfig as never };
  switch (widget.type) {
    case 'today': return <TodayDetail {...p} />;
    case 'todo': return <TodoDetail {...p} />;
    case 'calendar': return <CalendarDetail {...p} />;
    case 'dday': return <DdayDetail {...p} />;
    case 'habits': return <HabitsDetail {...p} />;
    case 'goals': return <GoalsDetail {...p} />;
    case 'memo': return <MemoDetail {...p} />;
    case 'budget': return <BudgetDetail {...p} />;
    case 'links': return <LinksDetail {...p} />;
    case 'recent': return <RecentDetail {...p} />;
  }
}
