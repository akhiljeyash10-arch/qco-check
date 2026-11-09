import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";

/**
 * Auth.js v5 entrypoint (Node runtime).
 *
 * Wires the Prisma adapter, a JWT session strategy, and a credentials provider
 * that verifies email/password against the DB. At sign-in the `jwt` callback
 * attaches the user's `role` + `firmId` (read from the DB) to the token; the
 * `session` callback in `auth.config.ts` surfaces them on the session. Because
 * those values ride on the signed JWT, server code (and the Edge proxy)
 * can read them without a per-request DB lookup, and the client can never
 * supply a `firmId` — it always originates from the authenticated user record.
 */
export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }
        try {
          const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              firmId: true,
              passwordHash: true,
            },
          });
          // Unknown user or a user without a password (e.g. future OAuth-only).
          if (!user || !user.passwordHash) return null;
          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) return null;
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            firmId: user.firmId,
          };
        } catch (error) {
          // Database unreachable, connection timeout, etc. — log the error
          // server-side and return null so the caller sees "invalid
          // credentials" rather than a raw crash that hangs the sign-in form.
          console.error("authorize() database error:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    // Keep authConfig's `session` + `authorized` callbacks, then add the
    // jwt callback that enriches the token at sign-in (DB-backed, Node-only).
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      // `user` is present only on sign-in (the object returned by `authorize`).
      if (user) {
        token.role = user.role;
        token.firmId = user.firmId;
      }
      return token;
    },
  },
});