// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Dev-safe middleware: do nothing (prevents redirect loops while you build)
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

// Still match everything so you can turn checks back on later without renaming files
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
