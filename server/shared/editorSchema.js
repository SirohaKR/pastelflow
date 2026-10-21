import { BlockNoteSchema, createCodeBlockSpec, createInlineContentSpec, createStyleSpec, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs } from '@blocknote/core';
import { FONT_BY_ID, fontStack } from './fonts.js';

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

// 코드 블록 언어 (id 는 색 강조기 Shiki 의 언어 이름, 화면 src/codeHighlight.ts 와 같아야 한다)
export const CODE_LANGUAGES = {
  text: { name: '일반 텍스트', aliases: ['text', 'txt', 'plain', 'plaintext'] },
  dart: { name: 'Dart', aliases: ['dart', 'flutter'] },
  kotlin: { name: 'Kotlin', aliases: ['kotlin', 'kt', 'kts'] },
  swift: { name: 'Swift', aliases: ['swift'] },
  java: { name: 'Java', aliases: ['java'] },
  javascript: { name: 'JavaScript', aliases: ['javascript', 'js', 'mjs', 'cjs'] },
  typescript: { name: 'TypeScript', aliases: ['typescript', 'ts', 'mts'] },
  jsx: { name: 'JSX', aliases: ['jsx'] },
  tsx: { name: 'TSX', aliases: ['tsx'] },
  json: { name: 'JSON', aliases: ['json'] },
  html: { name: 'HTML', aliases: ['html', 'htm'] },
  css: { name: 'CSS', aliases: ['css'] },
  scss: { name: 'SCSS', aliases: ['scss'] },
  vue: { name: 'Vue', aliases: ['vue'] },
  svelte: { name: 'Svelte', aliases: ['svelte'] },
  python: { name: 'Python', aliases: ['python', 'py'] },
  c: { name: 'C', aliases: ['c', 'h'] },
  cpp: { name: 'C++', aliases: ['cpp', 'c++', 'hpp', 'cc'] },
  csharp: { name: 'C#', aliases: ['csharp', 'cs', 'c#'] },
  go: { name: 'Go', aliases: ['go', 'golang'] },
  rust: { name: 'Rust', aliases: ['rust', 'rs'] },
  php: { name: 'PHP', aliases: ['php'] },
  ruby: { name: 'Ruby', aliases: ['ruby', 'rb'] },
  lua: { name: 'Lua', aliases: ['lua'] },
  sql: { name: 'SQL', aliases: ['sql'] },
  graphql: { name: 'GraphQL', aliases: ['graphql', 'gql'] },
  shellscript: { name: 'Shell (bash)', aliases: ['shellscript', 'bash', 'sh', 'shell', 'zsh'] },
  powershell: { name: 'PowerShell', aliases: ['powershell', 'ps1', 'ps'] },
  bat: { name: 'Batch (cmd)', aliases: ['bat', 'cmd', 'batch'] },
  dockerfile: { name: 'Dockerfile', aliases: ['dockerfile', 'docker'] },
  yaml: { name: 'YAML', aliases: ['yaml', 'yml'] },
  toml: { name: 'TOML', aliases: ['toml'] },
  ini: { name: 'INI', aliases: ['ini', 'properties', 'env'] },
  xml: { name: 'XML', aliases: ['xml'] },
  markdown: { name: 'Markdown', aliases: ['markdown', 'md'] },
  diff: { name: 'Diff', aliases: ['diff', 'patch'] },
};

// 글꼴 (값 = server/shared/fonts.js 의 글꼴 id). 글꼴 파일은 화면에서 data-font 를 보고 불러온다
export const Font = createStyleSpec(
  { type: 'font', propSchema: 'string' },
  {
    render: (id) => {
      const span = document.createElement('span');
      span.dataset.font = id;
      span.style.fontFamily = fontStack(id);
      return { dom: span, contentDOM: span };
    },
    parse: (el) => (el.dataset.font && FONT_BY_ID[el.dataset.font] ? el.dataset.font : undefined),
  },
);

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec({ indentLineWithTab: true, defaultLanguage: 'text', supportedLanguages: CODE_LANGUAGES }),
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, attachment: Attachment },
  styleSpecs: { ...defaultStyleSpecs, font: Font },
});
