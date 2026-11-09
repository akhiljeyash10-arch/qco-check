import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config, shared by the Node {@link auth.ts} and the Edge
 * `proxy.ts` (the Next.js 16 successor to `middleware.ts`).
 *
 * It deliberately contains NO Prisma / bcrypt imports (both are Node-only) so it
 * can run in the proxy runtime. Providers are added in `auth.ts` (the
 * credentials `authorize` needs Prisma + bcrypt); an empty `providers` array
 * here keeps the proxy Edge-safe while still letting it validate the JWT and
 * enforce route protection.
 */
export const authConfig = {
  pages: {
    signIn: "/sign-in",
  },
  // V1 is served on a single host (dev server / app host); trust the request
  // host so Auth.js can compute callback URLs without an explicit AUTH_URL.
  trustHost: true,
  // Providers are attached in `auth.ts` (they require the Node runtime).
  providers: [],
  callbacks: {
    /**
     * Copy the server-derived `role` + `firmId` (+ `id`) from the JWT onto the
     * session object. This callback lives here (Edge-safe) so the proxy
     * `authorized` check can read `auth.user.role` without a DB lookup — the
     * values were written to the token at sign-in by the `jwt` callback.
     */
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.role = token.role;
      session.user.firmId = token.firmId;
      return session;
    },
    /**
     * Route protection. `auth` is the decoded session (from the JWT, so `role`
     * is available on the Edge) and `request` is the incoming request.
     * Returns `true` to allow, `false` to redirect to the sign-in page, or a
     * `Response` for a custom redirect (e.g. a role mismatch sending the user
     * to their own area).
     */
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const role = auth?.user?.role;
      const isLoggedIn = !!auth?.user;

      const isAuthPage =
        path === "/sign-in" || path === "/signup" || path === "/login";
      const isAdminArea =
        path.startsWith("/rules") || path.startsWith("/queue");
      const isUserArea = path.startsWith("/determinations");

      // Authenticated users hitting an auth page (sign-in, sign-up, login) are
      // bounced to home, which routes them to their role's area.
      if (isAuthPage) {
        return isLoggedIn
          ? Response.redirect(new URL("/", request.nextUrl))
          : true;
      }

      // ADMIN areas — rule-editor + review queue. Strictly protected: only
      // authenticated ADMINs may enter; everyone else is redirected.
      if (isAdminArea) {
        if (!isLoggedIn) return false; // -> sign-in page
        if (role === "ADMIN") return true;
        // Logged in but not an admin -> send the user to their own area.
        return Response.redirect(
          new URL(role === "USER" ? "/determinations" : "/", request.nextUrl),
        );
      }

      // USER area — own firm's determinations.
      if (isUserArea) {
        if (!isLoggedIn) return false; // -> sign-in page
        if (role === "USER") return true;
        return Response.redirect(
          new URL(role === "ADMIN" ? "/rules" : "/", request.nextUrl),
        );
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
