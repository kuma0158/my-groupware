import NoticeBoard from "@/components/NoticeBoard";
import { serverFetch } from "@/lib/server-api";
import type { Notice, User } from "@/lib/types";

export default async function NoticesPage() {
  const [notices, me] = await Promise.all([
    serverFetch<Notice[]>("/notices"),
    serverFetch<User>("/auth/me"),
  ]);
  return (
    <>
      <h1>インフォメーション</h1>
      <NoticeBoard initial={notices} meId={me.id} />
    </>
  );
}
