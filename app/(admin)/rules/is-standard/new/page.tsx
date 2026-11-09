import Link from "next/link";
import { ISStandardForm } from "../ISStandardForm";

export const dynamic = "force-dynamic";

export default function NewISStandardPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/rules" className="hover:text-zinc-900 hover:underline">
          Rules
        </Link>
        <span>/</span>
        <span className="text-zinc-900">New IS standard</span>
      </nav>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900">
        New IS Standard
      </h1>
      <ISStandardForm />
    </div>
  );
}
