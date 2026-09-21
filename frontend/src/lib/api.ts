// ブラウザ(Client Component)から使う API クライアント
import type { AdminUser, Badges, ColorScheme, Event, Layout, Member, Message, Notice, Role, Todo, TodoColumn, User, Widget } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let message = "エラーが発生しました";
    try {
      const body = await res.json();
      // 400/401/403/409 は文字列、422(入力エラー)は配列で返ってくる
      message = typeof body.detail === "string" ? body.detail : "入力内容を確認してください";
    } catch {}
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  login: (email: string, password: string) => post<User>("/auth/login", { email, password }),
  register: (name: string, email: string, password: string, department: string) =>
    post<User>("/auth/register", { name, email, password, department }),
  logout: () => post<void>("/auth/logout"),

  /** 自分のプロフィール・配色を変える(送った項目だけ) */
  updateMe: (data: Partial<{ name: string; department: string; color_scheme: ColorScheme }>) =>
    request<User>("/auth/me", { method: "PATCH", body: JSON.stringify(data) }),
  changePassword: (current_password: string, new_password: string) =>
    post<void>("/auth/password", { current_password, new_password }),

  /** ユーザー管理(パワーユーザーだけ) */
  adminUsers: () => request<AdminUser[]>("/admin/users"),
  patchAdminUser: (id: number, data: Partial<{ role: Role; is_active: boolean }>) =>
    request<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  rangeEvents: (start: string, end: string) => request<Event[]>(`/schedule/range?start=${start}&end=${end}`),
  addEvent: (data: Partial<Event>) => post<Event>("/schedule", data),
  patchEvent: (id: number, data: Partial<Event>) =>
    request<Event>(`/schedule/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteEvent: (id: number) => request<void>(`/schedule/${id}`, { method: "DELETE" }),

  todos: (includeDone = false) => request<Todo[]>(`/todos?include_done=${includeDone}`),
  addTodo: (data: { title: string; due_on?: string | null; assignee_id?: number | null; note?: string; column_id?: number }) =>
    post<Todo>("/todos", data),
  patchTodo: (
    id: number,
    // due_on は null を送ると期限が消える。column_id を送ると、その列の末尾へ移る
    data: Partial<{ done: boolean; title: string; note: string; due_on: string | null; assignee_id: number; column_id: number }>,
  ) => request<Todo>(`/todos/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  /** カードを column_id の列の、before_id のカードの手前へ(null なら末尾) */
  moveTodo: (id: number, column_id: number, before_id: number | null) =>
    post<Todo>(`/todos/${id}/move`, { column_id, before_id }),
  /** 共有する相手を選び直す(送った一覧が新しい共有先)。登録した人だけができる */
  shareTodo: (id: number, user_ids: number[]) =>
    request<Todo>(`/todos/${id}/shares`, { method: "PUT", body: JSON.stringify({ user_ids }) }),
  deleteTodo: (id: number) => request<void>(`/todos/${id}`, { method: "DELETE" }),

  todoColumns: () => request<TodoColumn[]>("/todo-columns"),
  addTodoColumn: (name: string) => post<TodoColumn>("/todo-columns", { name }),
  patchTodoColumn: (id: number, data: Partial<Pick<TodoColumn, "name" | "is_done">>) =>
    request<TodoColumn>(`/todo-columns/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTodoColumn: (id: number) => request<void>(`/todo-columns/${id}`, { method: "DELETE" }),
  /** 列を並べ替える。ids は左から順の、すべての列の id */
  orderTodoColumns: (ids: number[]) =>
    request<TodoColumn[]>("/todo-columns/order", { method: "PUT", body: JSON.stringify({ ids }) }),

  badges: () => request<Badges>("/dashboard/badges"),
  notices: () => request<Notice[]>("/notices"),
  addNotice: (data: { title: string; body: string; pinned: boolean }) => post<Notice>("/notices", data),
  readNotice: (id: number) => post<void>(`/notices/${id}/read`),
  deleteNotice: (id: number) => request<void>(`/notices/${id}`, { method: "DELETE" }),

  members: () => request<Member[]>("/members"),
  setPresence: (presence: string, presence_note: string) =>
    request<Member>("/presence", { method: "PUT", body: JSON.stringify({ presence, presence_note }) }),
  messages: (includeHandled = false) => request<Message[]>(`/messages?include_handled=${includeHandled}`),
  addMessage: (data: { to_user_id: number; caller: string; body: string }) => post<Message>("/messages", data),
  handleMessage: (id: number) => post<void>(`/messages/${id}/handled`),

  saveLayout: (widgets: Widget[]) =>
    request<Layout>("/dashboard/layout", { method: "PUT", body: JSON.stringify({ widgets }) }),
};
