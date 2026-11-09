import { safeAuth } from "@/lib/safe-auth";
import { redirect } from "next/navigation";
import { LandingClient } from "@/components/LandingClient";
import { ProductTour } from "@/components/ProductTour";

export const dynamic = "force-dynamic";

/**
 * Landing / splash page.
 *
 * Server component: reads the session via `safeAuth` (catches JWT decode
 * errors) and passes the user to the client `LandingClient` which handles all
 * animations. The `ProductTour` overlay is rendered here so it's available on
 * the landing page for first-time visitors.
 */
export default async function Home() {
  const session = await safeAuth();
  if (session?.user?.role === "ADMIN") redirect("/rules");
  if (session?.user?.role === "USER") redirect("/determinations");

  const user = session?.user ?? null;

  return (
    <>
      <LandingClient user={user} />
      <ProductTour />
    </>
  );
}
