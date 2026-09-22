import { NextResponse, type NextRequest } from "next/server";

// クッキーの有無だけを見る簡易ガード(ちらつき防止)。
// 本当の認証確認は dashboard/layout.tsx でサーバー側から API に問い合わせて行う。
export function middleware(req: NextRequest) {
  if (!req.cookies.has("access_token")) {
    // Behind Tunnel, req.url can contain Next.js's internal localhost address.
    // Use the configured public origin rather than trusting forwarded headers.
    return NextResponse.redirect(new URL("/login", process.env.PUBLIC_ORIGIN ?? req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*"] };
