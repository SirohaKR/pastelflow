// 페이지 내려받기: Markdown(.md) / HTML(.html) / 인쇄용 화면(브라우저에서 PDF로 저장)

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 파일 이름에 쓸 수 없는 글자를 뺀다
export const fileName = (title) => (String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || '제목 없음');

// 올린 파일 주소(/uploads/…)를 내려받은 파일 밖에서도 열리게 전체 주소로
const absUploads = (text, origin, md) => (md
  ? text.replace(/\]\(\/uploads\//g, `](${origin}/uploads/`)
  : text.replace(/(src|href)="\/uploads\//g, `$1="${origin}/uploads/`));

// 링크에 스크립트 주소가 들어오지 않게
const safeLinks = (html) => html.replace(/(href|src)="\s*javascript:[^"]*"/gi, '$1="#"');

const STYLE = `
  :root { color-scheme: light; }
  body { font-family: 'Pretendard', -apple-system, 'Segoe UI', sans-serif; color: #37352f; line-height: 1.7; max-width: 760px; margin: 40px auto; padding: 0 24px; }
  h1.title { font-size: 2em; margin: 0 0 24px; }
  h1, h2, h3 { line-height: 1.35; }
  img { max-width: 100%; border-radius: 8px; }
  li { margin: 4px 0; }
  li > p, td > p, th > p { margin: 0; }
  li:has(> input[type=checkbox]) { list-style: none; display: flex; gap: 8px; align-items: baseline; margin-left: -1.3em; }
  li[data-checked=true] > p { color: #9b9a97; text-decoration: line-through; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #e3e2de; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f7f6f3; }
  blockquote { border-left: 3px solid #d9d4f5; margin: 0; padding-left: 14px; color: #6b6b6b; }
  pre { background: #f7f6f3; padding: 12px; border-radius: 8px; overflow-x: auto; }
  code { font-family: Consolas, monospace; }
  a { color: #6b55c9; }
  a.bn-attach { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 6px; background: #f1eefc; text-decoration: none; }
  a.bn-attach img { max-height: 120px; }
  .bar { position: sticky; top: 0; display: flex; gap: 8px; align-items: center; padding: 10px 0; margin-bottom: 16px; background: #fff; border-bottom: 1px solid #eee; font-size: 14px; }
  .bar button { font: inherit; border: 0; border-radius: 8px; padding: 6px 12px; background: #e5dcfb; cursor: pointer; }
  @media print { .bar { display: none; } body { margin: 0; max-width: none; } }
`;

function htmlDoc({ title, icon, body, print }) {
  const heading = `${icon ? `${esc(icon)} ` : ''}${esc(title || '제목 없음')}`;
  const bar = print
    ? `<div class="bar"><button onclick="print()">🖨️ 인쇄 · PDF로 저장</button><span>인쇄 창에서 대상을 'PDF로 저장'으로 고르면 PDF 파일이 돼요.</span></div>
<script>addEventListener('load', () => setTimeout(() => print(), 300));</script>`
    : '';
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title || '제목 없음')}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>${STYLE}</style>
</head>
<body>
${bar}
<h1 class="title">${heading}</h1>
${body}
</body>
</html>
`;
}

// format: 'md' | 'html' | 'print'
export async function exportPage(blocknote, page, blocks, format, origin) {
  if (format === 'md') {
    const md = await blocknote.blocksToMarkdownLossy(blocks);
    const head = `# ${page.icon ? `${page.icon} ` : ''}${page.title || '제목 없음'}\n\n`;
    return { type: 'text/markdown; charset=utf-8', ext: 'md', body: absUploads(head + md, origin, true) };
  }
  // 빈 줄 자리에 들어가는 개체 자리 표시(U+FFFC)는 뺀다
  let body = safeLinks(await blocknote.blocksToHTMLLossy(blocks)).replace(/\uFFFC/g, '');
  if (format === 'html') body = absUploads(body, origin, false);
  return { type: 'text/html; charset=utf-8', ext: 'html', body: htmlDoc({ title: page.title, icon: page.icon, body, print: format === 'print' }) };
}
