import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlockNoteEditor, useComponentsContext, useEditorState, useExtension, useExtensionState, usePortalElement } from '@blocknote/react';
import { ShowSelectionExtension, SideMenuExtension } from '@blocknote/core/extensions';
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

// 글꼴 찾기 칸 + 종류별 목록. 서식 막대와 블록 메뉴가 같이 쓴다 (열릴 때마다 새로 그린다)
function FontPicker({ current, onPick, onClose }: { current: string; onPick: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [recent] = useState(readRecent);

  const pick = (id: string) => {
    if (id) pushRecent(id);
    onPick(id);
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

  return (
    <>
      <input
        className="font-search"
        autoFocus
        placeholder={`글꼴 찾기 (${FONTS.length}개)`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // 블록 메뉴가 글자 키를 가로채지 않게
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
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
              <FontItem key={id} id={id} active={current === id} onPick={pick} />
            ))}
          </div>
        ))}
        {!groups.length && <div className="font-empty">찾는 글꼴이 없어요</div>}
      </div>
    </>
  );
}

// 서식 툴바의 '글꼴' 버튼. 고른 글자에 글꼴을 입힌다
export function FontButton() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<any, any, any>();
  const portalElement = usePortalElement();
  const { showSelection } = useExtension(ShowSelectionExtension);
  const [open, setOpen] = useState(false);

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
    if (!v) editor.focus();
    setOpen(v);
  };

  const pick = (id: string) => {
    if (id) editor.addStyles({ font: id });
    else editor.removeStyles({ font: '' });
    setOpenAndFocus(false);
  };

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
        {open && <FontPicker current={state.font} onPick={pick} onClose={() => setOpenAndFocus(false)} />}
      </Components.Generic.Popover.Content>
    </Components.Generic.Popover.Root>
  );
}

// 블록 안 글자(링크 안 글자 포함)에 글꼴을 입히거나 뺀다. 첨부 같은 다른 요소는 그대로
function withFont(content: any[], id: string): any[] {
  const restyle = (c: any) => {
    const styles = { ...c.styles };
    if (id) styles.font = id;
    else delete styles.font;
    return { ...c, styles };
  };
  return content.map((c) => {
    if (c.type === 'text') return restyle(c);
    if (c.type === 'link') return { ...c, content: c.content.map(restyle) };
    return c;
  });
}

// 블록 글자들이 모두 같은 글꼴이면 그 글꼴 id
function blockFont(content: any[]): string {
  const texts = content.flatMap((c) => (c.type === 'text' ? [c] : c.type === 'link' ? c.content : []));
  const first = texts[0]?.styles?.font ?? '';
  return texts.every((t: any) => (t.styles?.font ?? '') === first) ? first : '';
}

// 블록 손잡이(⠿) 메뉴의 '글꼴': 그 블록 글자 전체에 글꼴을 입힌다
export function BlockFontItem() {
  const Components = useComponentsContext()!;
  const portalElement = usePortalElement();
  const editor = useBlockNoteEditor<any, any, any>();
  const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block });
  const boxRef = useRef<HTMLDivElement>(null);

  // 글자가 들어가는 블록만 (표·이미지·구분선 등은 빼고)
  if (!block || !Array.isArray(block.content) || !editor.isEditable) return null;
  const current = blockFont(block.content);

  // 메뉴 닫기 (Mantine 메뉴는 Esc 로 닫힌다)
  const close = () => boxRef.current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  const pick = (id: string) => {
    const cur = editor.getBlock(block.id);
    if (cur && Array.isArray(cur.content)) editor.updateBlock(cur, { content: withFont(cur.content, id) });
    close();
  };

  // 하위 메뉴는 열릴 때만 안이 그려진다 (Mantine 하위 메뉴는 열림 알림을 안 보내서 따로 상태를 두지 않는다)
  return (
    <Components.Generic.Menu.Root position="right" sub={true} portalElement={portalElement}>
      <Components.Generic.Menu.Trigger sub={true}>
        <Components.Generic.Menu.Item className="bn-menu-item" subTrigger={true}>
          글꼴{current && <span className="block-font-name">{FONT_BY_ID[current]?.name}</span>}
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown sub={true} className="bn-menu-dropdown font-menu">
        <div ref={boxRef} className="font-menu-box">
          <FontPicker current={current} onPick={pick} onClose={close} />
        </div>
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}
