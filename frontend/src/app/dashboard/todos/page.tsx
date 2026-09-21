import TodoBoard from "@/components/TodoBoard";
import { serverFetch } from "@/lib/server-api";
import type { Member, Todo, TodoColumn, User } from "@/lib/types";

export default async function TodosPage() {
  const [todos, columns, members, me] = await Promise.all([
    serverFetch<Todo[]>("/todos?include_done=true"),
    serverFetch<TodoColumn[]>("/todo-columns"),
    serverFetch<Member[]>("/members"),
    serverFetch<User>("/auth/me"),
  ]);
  return (
    <>
      <h1>ToDo</h1>
      <TodoBoard initialTodos={todos} initialColumns={columns} members={members} meId={me.id} />
    </>
  );
}
