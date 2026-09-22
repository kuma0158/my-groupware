import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export default async function RegisterPage() {
  // 新規登録を閉じている間は、直接 URL を叩かれても見せない(判定できないときも閉じておく)
  let open = false;
  try {
    const res = await fetch(`${BACKEND}/api/auth/registration-status`, { cache: "no-store" });
    if (res.ok) open = (await res.json()).open === true;
  } catch {}
  if (!open) redirect("/login");
  return <AuthForm mode="register" />;
}
