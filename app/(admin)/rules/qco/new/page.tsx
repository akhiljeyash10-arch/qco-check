import { QcoForm } from "../QcoForm";

export const dynamic = "force-dynamic";

export default function NewQcoPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900">
        New Quality Control Order
      </h1>
      <QcoForm />
    </div>
  );
}
