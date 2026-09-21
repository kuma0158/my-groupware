/** 権限。power はパワーユーザー(設定でユーザーを管理できる)、user は一般ユーザー */
export type Role = "power" | "user";
/** 画面の配色。warm=暖色、neutral=中間色、cool=寒色、dark=ダークモード */
export type ColorScheme = "warm" | "neutral" | "cool" | "dark";
export type User = {
  id: number; email: string; name: string; department: string; created_at: string;
  role: Role; color_scheme: ColorScheme;
};
/** ユーザー管理の一覧(パワーユーザーだけが取得できる) */
export type AdminUser = {
  id: number; email: string; name: string; department: string;
  role: Role; is_active: boolean; created_at: string;
};
export type Member = { id: number; name: string; department: string; presence: string; presence_note: string };

export type Event = {
  id: number; user_id: number; user_name: string; title: string;
  on_date: string; start_time: string; end_time: string;
  place: string; note: string; is_private: boolean;
};
export type Todo = {
  id: number; title: string; due_on: string | null; note: string; done: boolean;
  assignee_id: number; assignee_name: string; owner_id: number;
  column_id: number; position: number;
  shared_with: number[]; // 共有している相手のユーザーid
};
/** ToDo カンバンの列。全員で共有する。is_done の列に入ったカードは完了扱い */
export type TodoColumn = { id: number; name: string; position: number; is_done: boolean };
export type Notice = {
  id: number; title: string; body: string; pinned: boolean;
  author_id: number; author_name: string; created_at: string; unread: boolean;
};
export type Message = {
  id: number; to_user_id: number; from_user_id: number; from_name: string;
  caller: string; body: string; handled: boolean; created_at: string;
};

export type Stat = { key: string; label: string; value: number; delta: number };
export type Summary = {
  stats: Stat[];
  today_events: Event[];
  todos: Todo[];
  notices: Notice[];
  messages: Message[];
  members: Member[];
};

/** メニューに出す新着の件数 */
export type Badges = { todos: number; notices: number; messages: number };

export type Widget = { id: string; type: string; span: number; props: Record<string, string> };
export type Layout = { widgets: Widget[] };

export const PRESENCE_LABEL: Record<string, string> = {
  in: "在席", out: "外出", away: "離席", off: "休み",
};
