import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { ko } from '@blocknote/core/locales';
import type { PartialBlock } from '@blocknote/core';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { api } from '../api';

const dictionary = {
  ...ko,
  placeholders: {
    ...ko.placeholders,
    default: "내용을 입력하거나 '/' 를 눌러 블록을 추가하세요",
    emptyDocument: "여기에 쓰기 시작하세요. '/' 로 블록을 넣을 수 있어요",
  },
};

type Props = {
  initialContent: unknown[];
  dark: boolean;
  onChange: (content: unknown[]) => void;
};

// 페이지가 바뀌면 key 로 새로 만든다 (initialContent 는 처음에만 읽힘)
export function Editor({ initialContent, dark, onChange }: Props) {
  const editor = useCreateBlockNote({
    initialContent: initialContent.length ? (initialContent as PartialBlock[]) : undefined,
    dictionary,
    uploadFile: async (file) => (await api.upload(file)).url,
  });

  return (
    <div className="editor-wrap">
      <BlockNoteView editor={editor} theme={dark ? 'dark' : 'light'} onChange={() => onChange(editor.document)} />
    </div>
  );
}
