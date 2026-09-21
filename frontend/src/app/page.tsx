import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard"); // 未ログインなら middleware が /login に飛ばす
}
