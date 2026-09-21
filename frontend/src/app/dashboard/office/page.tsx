import OfficeBoard from "@/components/OfficeBoard";
import { serverFetch } from "@/lib/server-api";
import type { Member, Message, User } from "@/lib/types";

export default async function OfficePage() {
  const [members, messages, me] = await Promise.all([
    serverFetch<Member[]>("/members"),
    serverFetch<Message[]>("/messages?include_handled=false"),
    serverFetch<User>("/auth/me"),
  ]);
  return (
    <>
      <h1>伝言・在席</h1>
      <OfficeBoard members={members} messages={messages} meId={me.id} />
    </>
  );
}
