import { NextResponse, type NextRequest } from "next/server";

// クッキーの有無だけを見る簡易ガード(ちらつき防止)。
// 本当の認証確認は dashboard/layout.tsx でサーバー側から API に問い合わせて行う。
export function middleware(req: NextRequest) {
  if (!req.cookies.has("access_token")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*"] };
