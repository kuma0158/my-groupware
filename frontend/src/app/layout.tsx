import type { Metadata } from "next";
import "./globals.css";

// 配色テーマ。"instrument"(計器盤) か "blueprint"(方眼)。
// globals.css の [data-theme="..."] と対応している
const THEME = "instrument";

export const metadata: Metadata = { title: "ダッシュボード" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body data-theme={THEME}>{children}</body>
    </html>
  );
}
