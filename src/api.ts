import { CLIENT_ID } from './session';
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
  // 나만 보는 개인 페이지인지 (아니면 공용)
  private: boolean;
  // 들어 있는 스페이스 (없으면 전체 공용이거나 개인 페이지)
  spaceId: string | null;
  // 이 페이지에 건 '관리자만 편집' / 위쪽 페이지까지 포함해 잠겼는지
  locked: boolean;
  lockedAny?: boolean;
  // 최상위 페이지가 들어 있는 카테고리 (없으면 구역 맨 위)
  categoryId: string | null;
  // 내 권한 단계: 1 보기, 2 편집, 3 편집·삭제, 4 관리
  access?: number;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type PropType = 'text' | 'select' | 'date' | 'checkbox' | 'number' | 'file' | 'person';
export type TagColor = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6';
export type SelectOption = { id: string; name: string; color: TagColor };
export type Property = { id: string; name: string; type: PropType; options?: SelectOption[] };
export type Schema = {
  properties: Property[];
  board: { groupBy: string | null };
  calendar: { dateProp: string | null };
  // 0.3.0 에 생긴 설정이라 예전 데이터베이스에는 없을 수 있다
  timeline?: { startProp: string | null; endProp: string | null; groupBy: string | null };
};

// 속성 값: 텍스트·선택(옵션 id)·날짜(YYYY-MM-DD)는 문자열, 숫자, 체크박스는 참/거짓
// 파일·이미지 속성 값의 한 칸
export type FileItem = { url: string; name: string; mime?: string; size?: number };
// 담당자(사람) 속성 값은 사용자 id 목록
export type PropValue = string | number | boolean | FileItem[] | string[];
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

export type WidgetType = 'today' | 'todo' | 'calendar' | 'dday' | 'habits' | 'memo' | 'recent' | 'links' | 'budget' | 'goals';
export type WidgetSize = 's' | 'm' | 'l';
export type Widget = {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  color: '' | TagColor;
  position: number;
  config: Record<string, unknown>;
  updatedAt: number;
};
export type WidgetPatch = Partial<Pick<Widget, 'size' | 'color' | 'position' | 'config'>>;

// 홈 위젯이 받는 데이터베이스 묶음
export type AgendaDb = { id: string; title: string; icon: string; schema: Schema; rows: Row[] };

export type PagePatch = Partial<Pick<Page, 'title' | 'icon' | 'cover' | 'content' | 'favorite' | 'position' | 'parentId' | 'schema' | 'private' | 'spaceId' | 'locked' | 'categoryId'>> & {
  props?: Record<string, PropValue | null>;
};

export type User = {
  id: string;
  username: string;
  nickname: string;
  avatar: string;
  color: TagColor;
  role: 'admin' | 'full' | 'edit' | 'view';
  disabled: boolean;
};

export type SpaceMember = { userId: string; role: 'owner' | 'full' | 'edit' | 'view' };
export type Space = {
  id: string;
  name: string;
  icon: string;
  // 아이콘 사진 주소 (있으면 이모지 대신)
  image: string;
  color: TagColor;
  position: number;
  createdBy: string;
  createdAt: number;
  myRole: SpaceMember['role'] | null;
  members: SpaceMember[];
};
// 최상위 페이지가 놓이는 자리: 전체 공용 / 스페이스 / 내 페이지
export type Scope = { private?: boolean; spaceId?: string | null; categoryId?: string | null };
// 구역마다 최상위 페이지를 묶는 카테고리
export type Category = { id: string; name: string; position: number; private: boolean; spaceId: string | null; locked: boolean };

export type AuthStatus = { setup: boolean; user: User | null };
export type Invite = { code: string; createdBy: string; createdAt: number; expiresAt: number; usedBy: string | null; usedAt: number | null; role: User['role'] };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, keepalive = false): Promise<T> {
  const init: RequestInit = { method, keepalive, credentials: 'same-origin', headers: { 'X-Client-Id': CLIENT_ID } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'X-Client-Id': CLIENT_ID, 'Content-Type': 'application/json' };
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
  authStatus: () => request<AuthStatus>('GET', '/api/auth/status'),
  setup: (body: { username: string; password: string; nickname: string }) => request<User>('POST', '/api/auth/setup', body),
  login: (username: string, password: string) => request<User>('POST', '/api/auth/login', { username, password }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  checkInvite: (code: string) => request<{ ok: true; by: string }>('GET', `/api/invites/${encodeURIComponent(code)}`),
  register: (body: { code: string; username: string; password: string; nickname: string }) => request<User>('POST', '/api/auth/register', body),

  users: () => request<User[]>('GET', '/api/users'),
  updateMe: (patch: Partial<Pick<User, 'nickname' | 'avatar' | 'color'>>) => request<User>('PATCH', '/api/me', patch),
  changePassword: (current: string, next: string) => request<{ ok: true }>('POST', '/api/me/password', { current, next }),
  adminUsers: () => request<User[]>('GET', '/api/admin/users'),
  adminUpdateUser: (id: string, patch: { role?: User['role']; disabled?: boolean; password?: string }) =>
    request<User>('PATCH', `/api/admin/users/${id}`, patch),
  invites: () => request<Invite[]>('GET', '/api/admin/invites'),
  createInvite: (role: User['role'] = 'edit') => request<{ code: string; expiresAt: number }>('POST', '/api/admin/invites', { role }),
  deleteInvite: (code: string) => request('DELETE', `/api/admin/invites/${encodeURIComponent(code)}`),

  listPages: () => request<PageMeta[]>('GET', '/api/pages'),
  getPage: (id: string) => request<Page>('GET', `/api/pages/${id}`),
  createPage: (parentId: string | null = null, kind: 'page' | 'database' = 'page', scope: Scope = {}) =>
    request<Page>('POST', '/api/pages', { parentId, kind, ...scope }),

  spaces: () => request<Space[]>('GET', '/api/spaces'),
  adminSpaces: () => request<Space[]>('GET', '/api/admin/spaces'),
  createSpace: (body: { name: string; icon: string; image: string; color: TagColor; members: SpaceMember[] }) => request<Space>('POST', '/api/spaces', body),
  updateSpace: (id: string, patch: Partial<Pick<Space, 'name' | 'icon' | 'image' | 'color' | 'position'>>) => request<Space>('PATCH', `/api/spaces/${id}`, patch),
  setSpaceMembers: (id: string, members: SpaceMember[]) => request<Space>('PUT', `/api/spaces/${id}/members`, { members }),
  leaveSpace: (id: string) => request('POST', `/api/spaces/${id}/leave`),
  deleteSpace: (id: string) => request('DELETE', `/api/spaces/${id}`),
  categories: () => request<Category[]>('GET', '/api/categories'),
  createCategory: (name: string, scope: Scope) => request<Category>('POST', '/api/categories', { name, private: !!scope.private, spaceId: scope.spaceId ?? null }),
  updateCategory: (id: string, patch: Partial<Pick<Category, 'name' | 'position' | 'locked'>>) => request<Category>('PATCH', `/api/categories/${id}`, patch),
  deleteCategory: (id: string) => request('DELETE', `/api/categories/${id}`),
  updatePage: (id: string, patch: PagePatch, keepalive = false) =>
    request<Page>('PATCH', `/api/pages/${id}`, patch, keepalive),
  duplicatePage: (id: string) => request<Page>('POST', `/api/pages/${id}/duplicate`),
  trashPage: (id: string) => request('POST', `/api/pages/${id}/trash`),
  restorePage: (id: string) => request('POST', `/api/pages/${id}/restore`),
  deletePage: (id: string) => request('DELETE', `/api/pages/${id}`),
  emptyTrash: () => request('POST', '/api/trash/empty'),

  getDatabase: (id: string) => request<Database>('GET', `/api/databases/${id}`),
  createRow: (dbId: string, init: { title?: string; props?: Props; position?: number } = {}) =>
    request<Page>('POST', `/api/databases/${dbId}/rows`, init),

  listWidgets: () => request<Widget[]>('GET', '/api/widgets'),
  createWidget: (type: WidgetType, size: WidgetSize) => request<Widget>('POST', '/api/widgets', { type, size }),
  updateWidget: (id: string, patch: WidgetPatch, keepalive = false) => request<Widget>('PATCH', `/api/widgets/${id}`, patch, keepalive),
  deleteWidget: (id: string) => request('DELETE', `/api/widgets/${id}`),
  agenda: () => request<AgendaDb[]>('GET', '/api/agenda'),

  getSettings: () => request<Record<string, unknown>>('GET', '/api/settings'),
  putSettings: (s: unknown) => request('PUT', '/api/settings', s),

  async upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    return request<{ url: string; name: string; mime: string; size: number }>('POST', '/api/uploads', form);
  },
};
