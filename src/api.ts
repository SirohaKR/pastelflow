export type PageKind = 'page' | 'database' | 'row';

export type PageMeta = {
  id: string;
  parentId: string | null;
  kind: PageKind;
  title: string;
  icon: string;
  cover: string;
  position: number;
  favorite: boolean;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type PropType = 'text' | 'select' | 'date' | 'checkbox' | 'number';
export type TagColor = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6';
export type SelectOption = { id: string; name: string; color: TagColor };
export type Property = { id: string; name: string; type: PropType; options?: SelectOption[] };
export type Schema = {
  properties: Property[];
  board: { groupBy: string | null };
  calendar: { dateProp: string | null };
};

// 속성 값: 텍스트·선택(옵션 id)·날짜(YYYY-MM-DD)는 문자열, 숫자, 체크박스는 참/거짓
export type PropValue = string | number | boolean;
export type Props = Record<string, PropValue>;

export type Page = PageMeta & { content: unknown[]; schema?: Schema; props?: Props };

export type Row = {
  id: string;
  title: string;
  icon: string;
  props: Props;
  position: number;
  createdAt: number;
  updatedAt: number;
};

export type Database = Page & { schema: Schema; rows: Row[] };

export type PagePatch = Partial<Pick<Page, 'title' | 'icon' | 'cover' | 'content' | 'favorite' | 'position' | 'parentId' | 'schema'>> & {
  props?: Record<string, PropValue | null>;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, keepalive = false): Promise<T> {
  const init: RequestInit = { method, keepalive, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('pf:unauthorized'));
    throw new ApiError(res.status, data.error || '요청에 실패했어요.');
  }
  return data as T;
}

export const api = {
  authStatus: () => request<{ required: boolean; authed: boolean }>('GET', '/api/auth/status'),
  login: (password: string) => request<{ ok: true }>('POST', '/api/auth/login', { password }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),

  listPages: () => request<PageMeta[]>('GET', '/api/pages'),
  getPage: (id: string) => request<Page>('GET', `/api/pages/${id}`),
  createPage: (parentId: string | null = null, kind: 'page' | 'database' = 'page') =>
    request<Page>('POST', '/api/pages', { parentId, kind }),
  updatePage: (id: string, patch: PagePatch, keepalive = false) =>
    request<Page>('PATCH', `/api/pages/${id}`, patch, keepalive),
  trashPage: (id: string) => request('POST', `/api/pages/${id}/trash`),
  restorePage: (id: string) => request('POST', `/api/pages/${id}/restore`),
  deletePage: (id: string) => request('DELETE', `/api/pages/${id}`),
  emptyTrash: () => request('POST', '/api/trash/empty'),

  getDatabase: (id: string) => request<Database>('GET', `/api/databases/${id}`),
  createRow: (dbId: string, init: { title?: string; props?: Props; position?: number } = {}) =>
    request<Page>('POST', `/api/databases/${dbId}/rows`, init),

  getSettings: () => request<Record<string, unknown>>('GET', '/api/settings'),
  putSettings: (s: unknown) => request('PUT', '/api/settings', s),

  async upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    return request<{ url: string; name: string }>('POST', '/api/uploads', form);
  },
};
