import { createBundledHighlighter } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import type { DynamicImportLanguageRegistration, DynamicImportThemeRegistration } from '@shikijs/core';
import { SyntaxHighlightingExtension } from '@blocknote/core/extensions';
import { CODE_LANGUAGES } from '../server/shared/editorSchema.js';

// 코드 블록 색 강조 (Shiki). 언어 문법은 처음 쓸 때만 불러온다
const grammars: Record<string, () => Promise<unknown>> = {
  dart: () => import('@shikijs/langs-precompiled/dart'),
  kotlin: () => import('@shikijs/langs-precompiled/kotlin'),
  swift: () => import('@shikijs/langs-precompiled/swift'),
  java: () => import('@shikijs/langs-precompiled/java'),
  javascript: () => import('@shikijs/langs-precompiled/javascript'),
  typescript: () => import('@shikijs/langs-precompiled/typescript'),
  jsx: () => import('@shikijs/langs-precompiled/jsx'),
  tsx: () => import('@shikijs/langs-precompiled/tsx'),
  json: () => import('@shikijs/langs-precompiled/json'),
  html: () => import('@shikijs/langs-precompiled/html'),
  css: () => import('@shikijs/langs-precompiled/css'),
  scss: () => import('@shikijs/langs-precompiled/scss'),
  vue: () => import('@shikijs/langs-precompiled/vue'),
  svelte: () => import('@shikijs/langs-precompiled/svelte'),
  python: () => import('@shikijs/langs-precompiled/python'),
  c: () => import('@shikijs/langs-precompiled/c'),
  cpp: () => import('@shikijs/langs-precompiled/cpp'),
  csharp: () => import('@shikijs/langs-precompiled/csharp'),
  go: () => import('@shikijs/langs-precompiled/go'),
  rust: () => import('@shikijs/langs-precompiled/rust'),
  php: () => import('@shikijs/langs-precompiled/php'),
  ruby: () => import('@shikijs/langs-precompiled/ruby'),
  lua: () => import('@shikijs/langs-precompiled/lua'),
  sql: () => import('@shikijs/langs-precompiled/sql'),
  graphql: () => import('@shikijs/langs-precompiled/graphql'),
  shellscript: () => import('@shikijs/langs-precompiled/shellscript'),
  powershell: () => import('@shikijs/langs-precompiled/powershell'),
  bat: () => import('@shikijs/langs-precompiled/bat'),
  dockerfile: () => import('@shikijs/langs-precompiled/dockerfile'),
  yaml: () => import('@shikijs/langs-precompiled/yaml'),
  toml: () => import('@shikijs/langs-precompiled/toml'),
  ini: () => import('@shikijs/langs-precompiled/ini'),
  xml: () => import('@shikijs/langs-precompiled/xml'),
  markdown: () => import('@shikijs/langs-precompiled/markdown'),
  diff: () => import('@shikijs/langs-precompiled/diff'),
};

// 별칭(ts, py, sh …)으로도 찾을 수 있게
const langs: Record<string, DynamicImportLanguageRegistration> = {};
for (const [id, load] of Object.entries(grammars)) {
  for (const name of [id, ...((CODE_LANGUAGES as Record<string, { aliases?: string[] }>)[id]?.aliases ?? [])]) {
    langs[name] = load as DynamicImportLanguageRegistration;
  }
}

// 코드 블록은 앱 테마와 상관없이 어두운 바탕 (One Dark). 이름에 dark/light 가 있어야 BlockNote 가 알아본다
const themes: Record<string, DynamicImportThemeRegistration> = {
  'one-dark-pro': (() => import('@shikijs/themes/one-dark-pro')) as DynamicImportThemeRegistration,
  'github-light': (() => import('@shikijs/themes/github-light')) as DynamicImportThemeRegistration,
};

const createHighlighter = createBundledHighlighter<string, string>({
  langs,
  themes,
  engine: () => createJavaScriptRegexEngine(),
});

export const syntaxHighlighter = SyntaxHighlightingExtension({
  createHighlighter: () => createHighlighter({ themes: ['one-dark-pro', 'github-light'], langs: [] }),
});

// 붙여 넣은 코드의 언어를 대강 알아맞힌다 (모르면 null)
const RULES: [string, RegExp][] = [
  ['dart', /import\s+'package:|\bWidget\s+build\(|\bStatelessWidget\b|\bStatefulWidget\b|\bvoid\s+main\(\)\s*(=>|\{)|\bfinal\s+\w+\s*=.*;\s*$|\blate\s+(final\s+)?\w+/m],
  ['kotlin', /\bfun\s+\w+\(|\bval\s+\w+\s*[:=]|\bdata\s+class\b|\bcompanion\s+object\b/],
  ['swift', /\bimport\s+(SwiftUI|UIKit|Foundation)\b|\bfunc\s+\w+\(.*\)\s*(->|\{)|\bguard\s+let\b/],
  ['python', /^\s*def\s+\w+\(.*\)\s*(->\s*[\w\[\], ]+)?:\s*$|^\s*(from\s+[\w.]+\s+)?import\s+\w+(\s+as\s+\w+)?\s*$|^\s*class\s+\w+(\(.*\))?:\s*$|\bprint\(f?["']/m],
  ['go', /^package\s+\w+\s*$|\bfunc\s+(\(\w+\s+\*?\w+\)\s*)?\w+\(|:=\s*/m],
  ['rust', /\bfn\s+\w+\(|\blet\s+mut\b|\bimpl\b.*\{|println!\(/],
  ['csharp', /\busing\s+System\b|\bnamespace\s+[\w.]+|\bpublic\s+(partial\s+)?class\b.*\n?.*\{|Console\.WriteLine/],
  ['java', /\bpublic\s+static\s+void\s+main\b|System\.out\.println|\bimport\s+java\./],
  ['php', /<\?php/],
  ['html', /^\s*<(!doctype|html|head|body|div|span|template)\b/im],
  ['xml', /^\s*<\?xml\b/],
  ['json', /^\s*[[{]\s*"[^"]*"\s*:/],
  ['sql', /^\s*(select|insert\s+into|update|delete\s+from|create\s+table|alter\s+table)\b/im],
  ['dockerfile', /^\s*FROM\s+[\w./:-]+(\s+AS\s+\w+)?\s*$/m],
  ['yaml', /^[\w-]+:\s*(\S.*)?$\n^\s+[\w-]+:/m],
  ['shellscript', /^#!\/bin\/(ba|z)?sh|^\s*(sudo|apt|npm|git|docker|cd|echo|export)\s/m],
  ['tsx', /\binterface\s+\w+|:\s*(string|number|boolean)\b[\s\S]*<\w+[\s>/]/],
  ['typescript', /\binterface\s+\w+\s*\{|\btype\s+\w+\s*=|:\s*(string|number|boolean|void)\b/],
  ['jsx', /return\s*\(\s*<\w+|<\/\w+>\s*\)\s*;?/],
  ['javascript', /\b(const|let|var)\s+\w+\s*=|\bfunction\s+\w+\(|=>\s*\{|console\.log\(|\brequire\(/],
  ['css', /^\s*[.#]?[\w-]+(\s*[.#:>][\w-]+)*\s*\{\s*$[\s\S]*?:\s*[^;]+;/m],
];

export function guessLanguage(code: string): string | null {
  for (const [lang, re] of RULES) if (re.test(code)) return lang;
  return null;
}
