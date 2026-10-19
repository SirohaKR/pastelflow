import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type AgendaDb, type PageMeta, type Widget } from '../../api';
import { useHomeCtx } from './Home';
import { widgetMeta } from './meta';
import { WidgetDetail } from './details';
import './home.css';
import './details.css';

type Props = {
  id: string;
  pages: PageMeta[];
  dataVersion: number;
  openPage: (id: string) => void;
  onBack: () => void;
  onError: (msg: string) => void;
};

const SAVE_DELAY = 600;

// 상세 페이지 부제목
const DETAIL_DESC: Record<Widget['type'], string> = {
  today: '이번 주 일정을 요일별로 보고, 밀린 일을 챙겨요',
  todo: '밀린 일부터 그 뒤 일정까지 한 번에 정리해요',
  calendar: '모든 데이터베이스의 일정을 큰 달력으로 봐요',
  dday: '기다리는 날을 카드로 모아 보고, 매년 반복도 정할 수 있어요',
  habits: '한 달 치 습관 기록과 연속·최장 기록을 봐요',
  goals: '목표마다 기한과 하루에 해야 할 양을 계산해 줘요',
  memo: '홈 메모를 넓게 펼쳐서 써요',
  budget: '한 달 수입·지출을 요약하고, 내역을 자세히 기록해요',
  links: '자주 가는 사이트를 표로 정리하고 분류별로 모아 봐요',
  recent: '모든 페이지를 찾고 정렬해서 봐요',
};

// 홈 위젯 하나를 화면 가득 펼쳐 자세히 쓰는 페이지 (/w/위젯id)
export function WidgetPage({ id, pages, dataVersion, openPage, onBack, onError }: Props) {
  const [widget, setWidget] = useState<Widget | null>(null);
  const [missing, setMissing] = useState(false);
  const [agenda, setAgenda] = useState<AgendaDb[]>([]);

  useEffect(() => {
    api.listWidgets()
      .then((ws) => {
        const w = ws.find((x) => x.id === id);
        if (w) setWidget(w);
        else setMissing(true);
      })
      .catch((e) => onError(e.message));
  }, [id, onError]);

  const loadAgenda = useCallback(() => {
    api.agenda().then(setAgenda).catch((e) => onError(e.message));
  }, [onError]);
  useEffect(loadAgenda, [loadAgenda, dataVersion]);

  // 내용은 잠깐 모았다가 저장, 떠날 때 남은 것 저장
  const pending = useRef<Record<string, unknown> | null>(null);
  const timer = useRef<number>();
  const flush = useCallback((keepalive = false) => {
    window.clearTimeout(timer.current);
    if (!pending.current) return;
    const config = pending.current;
    pending.current = null;
    api.updateWidget(id, { config }, keepalive).catch((e) => onError(e.message));
  }, [id, onError]);

  useEffect(() => {
    const onLeave = () => flush(true);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      flush(true);
    };
  }, [flush]);

  const setConfig = (config: Record<string, unknown>) => {
    setWidget((w) => w && { ...w, config });
    pending.current = config;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush(), SAVE_DELAY);
  };

  const ctx = useHomeCtx(pages, agenda, setAgenda, loadAgenda, openPage, onError);

  if (missing) {
    return (
      <div className="home">
        <div className="db-empty big">
          <p>이 위젯을 찾을 수 없어요. 홈에서 지워졌을 수 있어요.</p>
          <button className="btn" onClick={onBack}>🏠 홈으로</button>
        </div>
      </div>
    );
  }
  if (!widget) return <div className="home"><div className="db-loading">불러오는 중…</div></div>;

  const meta = widgetMeta(widget.type);
  return (
    <div className="home detail">
      <div className="detail-head">
        <button className="btn ghost" onClick={onBack}>← 홈</button>
        <div className={`detail-title ${widget.color ? `tint-${widget.color}` : ''}`}>
          <span className="detail-icon">{meta.icon}</span>
          <div>
            <h1>{meta.label}</h1>
            <p>{DETAIL_DESC[widget.type]}</p>
          </div>
        </div>
      </div>
      <WidgetDetail widget={widget} ctx={ctx} setConfig={setConfig} />
    </div>
  );
}
