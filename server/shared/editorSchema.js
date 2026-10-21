import { BlockNoteSchema, createInlineContentSpec, defaultInlineContentSpecs } from '@blocknote/core';

// 문서 에디터 스키마. 화면(src/components/Editor.tsx)과 서버(server/realtime.js)가 같이 쓴다.
// 서버도 같은 스키마로 Yjs ↔ JSON 을 바꿔야 새 요소가 저장 중에 사라지지 않는다.

const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
export const isImageFile = (mime, url) => (mime ? String(mime).startsWith('image/') : IMAGE.test(url || ''));

function fileIcon(name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📕';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['ppt', 'pptx', 'key'].includes(ext)) return '📽️';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return '🎵';
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return '🎬';
  if (['md', 'txt'].includes(ext)) return '📝';
  return '📄';
}

// 📎 줄 안에 들어가는 첨부 (표 칸 안에도 들어간다)
export const Attachment = createInlineContentSpec(
  {
    type: 'attachment',
    propSchema: {
      url: { default: '' },
      name: { default: '' },
      mime: { default: '' },
    },
    content: 'none',
  },
  {
    render: (ic) => {
      const { url, name, mime } = ic.props;
      const a = document.createElement('a');
      a.className = 'bn-attach';
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = name || url;
      a.contentEditable = 'false';
      if (isImageFile(mime, url)) {
        a.classList.add('img');
        const img = document.createElement('img');
        img.src = url;
        img.alt = name;
        img.loading = 'lazy';
        a.appendChild(img);
      } else {
        a.textContent = `${fileIcon(name)} ${name || '파일'}`;
      }
      // 누르면 앱 안 미리보기 창으로 (Ctrl·⌘ 누르고 누르면 새 탭)
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (!url) return;
        if (e.ctrlKey || e.metaKey) window.open(url, '_blank', 'noopener');
        else window.dispatchEvent(new CustomEvent('pf:preview', { detail: { files: [{ url, name, mime }], index: 0 } }));
      });
      return { dom: a };
    },
  },
);

export const editorSchema = BlockNoteSchema.create({
  inlineContentSpecs: { ...defaultInlineContentSpecs, attachment: Attachment },
});
