import SettingsView from "@/components/SettingsView";
import { serverFetch } from "@/lib/server-api";
import type { User } from "@/lib/types";

export default async function SettingsPage() {
  const me = await serverFetch<User>("/auth/me");
  return (
    <>
      <h1>設定</h1>
      <SettingsView me={me} />
    </>
  );
}
