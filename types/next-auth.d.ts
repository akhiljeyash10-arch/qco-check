import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/session";

/**
 * Auth.js type augmentation.
 *
 * Surfaces the server-derived `role` + `firmId` (and `id`) on the session user
 * and the underlying JWT so server components / data-access code can read them
 * with full type safety. The values are populated by the `jwt`/`session`
 * callbacks in `auth.config.ts` + `auth.ts`; they originate from the DB at
 * sign-in and are never trusted from the client.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      firmId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    firmId: string | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role: Role;
    firmId: string | null;
  }
}
