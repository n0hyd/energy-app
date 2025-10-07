// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createPagesMiddlewareClient } from "@supabase/auth-helpers-nextjs";

const PUBLIC = new Set<string>(["/", "/auth/sign-in", "/auth/sign-out"]); // ← added sign-out

function isStatic(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/api") ||
    /\.(png|jpg|jpeg|gif|svg|ico|css|js|txt|map|woff2?|ttf|otf)$/.test(pathname) ||
    pathname.startsWith("/_next/data")
  );
}

const PROTECTED_PREFIXES = ["/dashboard", "/buildings", "/bills", "/uploads", "/orgs"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isStatic(pathname)) return NextResponse.next();
  if (PUBLIC.has(pathname)) return NextResponse.next();

  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!needsAuth) return NextResponse.next();

  const res = NextResponse.next();
  const supabase = createPagesMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ["/:path*"] };
