export type PageMeta = {
  id: string;
  parentId: string | null;
  title: string;
  icon: string;
  cover: string;
  position: number;
  favorite: boolean;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type Page = PageMeta & { content: unknown[] };

export type PagePatch = Partial<Pick<Page, 'title' | 'icon' | 'cover' | 'content' | 'favorite' | 'position' | 'parentId'>>;

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
  createPage: (parentId: string | null = null) => request<Page>('POST', '/api/pages', { parentId }),
  updatePage: (id: string, patch: PagePatch, keepalive = false) =>
    request<Page>('PATCH', `/api/pages/${id}`, patch, keepalive),
  trashPage: (id: string) => request('POST', `/api/pages/${id}/trash`),
  restorePage: (id: string) => request('POST', `/api/pages/${id}/restore`),
  deletePage: (id: string) => request('DELETE', `/api/pages/${id}`),
  emptyTrash: () => request('POST', '/api/trash/empty'),

  getSettings: () => request<Record<string, unknown>>('GET', '/api/settings'),
  putSettings: (s: unknown) => request('PUT', '/api/settings', s),

  async upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    return request<{ url: string; name: string }>('POST', '/api/uploads', form);
  },
};
