import type { AgendaDb, Props, PropValue, TagColor } from '../../api';
import { defaultBoardProp, defaultDateProp, findOption, isDateKey, rowTitle, timelineProps } from '../../database';

// 여러 데이터베이스의 날짜 있는 항목을 위젯에서 쓰기 좋게 펼친 것
export type AgendaItem = {
  id: string;
  dbId: string;
  dbTitle: string;
  dbIcon: string;
  title: string;
  icon: string;
  date: string | null;
  end: string | null;
  color: TagColor | 'none';
  done: boolean;
  // 완료 표시를 바꿀 때 보낼 속성 값 (바꿀 방법이 없으면 null)
  doneProps: ((done: boolean) => Record<string, PropValue | null>) | null;
};

const DONE_WORDS = /완료|끝|done|finish/i;

export function flattenAgenda(dbs: AgendaDb[]): AgendaItem[] {
  const out: AgendaItem[] = [];
  for (const db of dbs) {
    const dateProp = defaultDateProp(db.schema);
    const endProp = timelineProps(db.schema).end;
    const status = defaultBoardProp(db.schema);
    const doneOpt = status?.options?.find((o) => DONE_WORDS.test(o.name));
    const firstOpen = status?.options?.find((o) => o !== doneOpt);
    const doneBox = db.schema.properties.find((p) => p.type === 'checkbox' && DONE_WORDS.test(p.name));

    for (const r of db.rows) {
      const date = dateProp && isDateKey(r.props[dateProp.id]) ? (r.props[dateProp.id] as string) : null;
      const end = endProp && isDateKey(r.props[endProp.id]) ? (r.props[endProp.id] as string) : null;
      const tag = status ? findOption(status, r.props[status.id]) : undefined;
      let done = false;
      let doneProps: AgendaItem['doneProps'] = null;
      if (status && doneOpt) {
        done = r.props[status.id] === doneOpt.id;
        doneProps = (d) => ({ [status.id]: d ? doneOpt.id : firstOpen?.id ?? null });
      } else if (doneBox) {
        done = r.props[doneBox.id] === true;
        doneProps = (d) => ({ [doneBox.id]: d });
      }
      out.push({
        id: r.id, dbId: db.id, dbTitle: db.title.trim() || '제목 없음', dbIcon: db.icon,
        title: rowTitle(r), icon: r.icon, date, end, color: tag?.color ?? 'none', done, doneProps,
      });
    }
  }
  return out;
}

// 그 날짜에 걸쳐 있는 항목인가 (기간이 있으면 시작~끝 사이)
export function onDay(item: AgendaItem, key: string) {
  if (!item.date) return false;
  if (item.end && item.end >= item.date) return item.date <= key && key <= item.end;
  return item.date === key;
}

// 새 할 일을 넣을 때 쓸 초기 속성 (날짜 속성에 그 날짜)
export function newItemProps(db: AgendaDb, date: string): Props {
  const dateProp = defaultDateProp(db.schema);
  const endProp = timelineProps(db.schema).end;
  const props: Props = {};
  if (dateProp) props[dateProp.id] = date;
  if (endProp) props[endProp.id] = date;
  return props;
}
