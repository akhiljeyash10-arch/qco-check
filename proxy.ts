import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Auth.js request proxy (Next.js 16 successor to `middleware.ts`).
 *
 * Uses the Edge-safe {@link authConfig} (no Prisma/bcrypt) so it runs in the
 * proxy runtime. The `authorized` callback in `authConfig` enforces route
 * protection using the JWT (so `role` is available without a DB lookup); the
 * {@link session} callback there populates `auth.user.role` for it to read.
 */
export default NextAuth(authConfig).auth;

export const config = {
  // Run auth on app pages only — exclude API routes (they enforce their own
  // auth server-side), Next internals, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
