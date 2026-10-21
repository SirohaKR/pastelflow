import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlockNoteEditor, useComponentsContext, useEditorState, useExtension, usePortalElement } from '@blocknote/react';
import { ShowSelectionExtension } from '@blocknote/core/extensions';
import { FONT_BY_ID, FONT_GROUPS, FONTS, fontStack } from '../../server/shared/fonts.js';
import { ensureFont } from '../fonts';

const RECENT_KEY = 'pf-recent-fonts';

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((id) => FONT_BY_ID[id]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 5)));
  } catch {
    /* 기억 못 해도 괜찮다 */
  }
}

// 목록에서 화면에 보이는 글꼴만 불러와서 그 글꼴로 이름을 보여 준다
function FontItem({ id, active, onPick }: { id: string; active: boolean; onPick: (id: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const f = FONT_BY_ID[id];
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        ensureFont(id);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [id]);
  return (
    <button
      ref={ref}
      type="button"
      className={`font-item ${active ? 'on' : ''}`}
      style={{ fontFamily: fontStack(id) }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(id)}
    >
      {f.name}
      {active && <span className="font-check">✓</span>}
    </button>
  );
}

// 서식 툴바의 '글꼴' 버튼. 고른 글자에 글꼴을 입힌다
export function FontButton() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<any, any, any>();
  const portalElement = usePortalElement();
  const { showSelection } = useExtension(ShowSelectionExtension);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    showSelection(open, 'fontButton');
    return () => showSelection(false, 'fontButton');
  }, [open, showSelection]);

  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (
        !editor.isEditable ||
        !('font' in editor.schema.styleSchema) ||
        !(editor.getSelection()?.blocks || [editor.getTextCursorPosition().block]).find((b: any) => b.content !== undefined)
      ) {
        return undefined;
      }
      return { font: (editor.getActiveStyles().font as string | undefined) ?? '' };
    },
  });

  const setOpenAndFocus = (v: boolean) => {
    if (v) {
      setQuery('');
      setRecent(readRecent());
    } else {
      editor.focus();
    }
    setOpen(v);
  };

  const pick = (id: string) => {
    if (id) {
      editor.addStyles({ font: id });
      pushRecent(id);
    } else {
      editor.removeStyles({ font: '' });
    }
    setOpenAndFocus(false);
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (id: string) => {
      const f = FONT_BY_ID[id];
      return !q || f.name.toLowerCase().includes(q) || f.family.toLowerCase().includes(q) || f.group.includes(q);
    };
    const list: { name: string; ids: string[] }[] = [];
    if (!q && recent.length) list.push({ name: '최근 쓴 글꼴', ids: recent });
    for (const g of FONT_GROUPS) {
      const ids = FONTS.filter((f) => f.group === g && hit(f.id)).map((f) => f.id);
      if (ids.length) list.push({ name: g, ids });
    }
    return list;
  }, [query, recent]);

  if (state === undefined) return null;
  const current = FONT_BY_ID[state.font];

  return (
    <Components.Generic.Popover.Root open={open} onOpenChange={setOpenAndFocus} portalElement={portalElement} position="bottom">
      <Components.Generic.Popover.Trigger>
        <Components.FormattingToolbar.Button
          className="bn-button font-button"
          label="글꼴"
          mainTooltip={current ? `글꼴: ${current.name}` : '글꼴'}
          isSelected={!!current}
          onClick={() => setOpenAndFocus(!open)}
          icon={<span className="font-button-icon" style={current ? { fontFamily: fontStack(current.id) } : undefined}>가</span>}
        />
      </Components.Generic.Popover.Trigger>
      <Components.Generic.Popover.Content className="font-menu" variant="panel-popover">
        <input
          className="font-search"
          autoFocus
          placeholder={`글꼴 찾기 (${FONTS.length}개)`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpenAndFocus(false);
            if (e.key === 'Enter' && groups[0]) pick(groups[0].ids[0]);
          }}
        />
        <div className="font-list">
          {!query.trim() && (
            <button type="button" className={`font-item ${current ? '' : 'on'}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick('')}>
              기본 글꼴
              {!current && <span className="font-check">✓</span>}
            </button>
          )}
          {groups.map((g) => (
            <div key={g.name} className="font-group">
              <div className="font-group-name">{g.name}</div>
              {g.ids.map((id) => (
                <FontItem key={id} id={id} active={state.font === id} onPick={pick} />
              ))}
            </div>
          ))}
          {!groups.length && <div className="font-empty">찾는 글꼴이 없어요</div>}
        </div>
      </Components.Generic.Popover.Content>
    </Components.Generic.Popover.Root>
  );
}
