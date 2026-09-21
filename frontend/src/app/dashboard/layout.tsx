import TopNav from "@/components/TopNav";
import { serverFetch } from "@/lib/server-api";
import type { User } from "@/lib/types";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // クッキーが無効・期限切れなら serverFetch 内で /login にリダイレクトされる
  const user = await serverFetch<User>("/auth/me");
  return (
    <div className="shell" data-scheme={user.color_scheme}>
      <TopNav user={user} />
      <main className="main">{children}</main>
    </div>
  );
}
