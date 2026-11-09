import { handlers } from "@/auth";

// Auth.js route handler — GET (e.g. sign-in/callback pages) + POST (form
// submissions / session provider calls). `dynamic` is forced because the
// auth routes depend on cookies/headers and must never be prerendered.
export const dynamic = "force-dynamic";

export const { GET, POST } = handlers;
