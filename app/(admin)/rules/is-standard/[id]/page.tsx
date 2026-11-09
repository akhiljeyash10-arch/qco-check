import { notFound } from "next/navigation";
import Link from "next/link";
import { getISStandard } from "@/lib/admin/rules-actions";
import { ISStandardForm } from "../ISStandardForm";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditISStandardPage({ params }: Props) {
  const { id } = await params;
  const is = await getISStandard(id);
  if (!is) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/rules" className="hover:text-zinc-900 hover:underline">
          Rules
        </Link>
        <span>/</span>
        <span className="text-zinc-900">{is.isNumber}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900">
        Edit IS Standard: {is.isNumber}
      </h1>

      <ISStandardForm existing={is} />

      {is.qcoItems.length > 0 && (
        <section className="mt-8" aria-labelledby="used-in-heading">
          <h2
            id="used-in-heading"
            className="mb-3 text-base font-semibold text-zinc-900"
          >
            Used in QCO items ({is.qcoItems.length})
          </h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">QCO</th>
                  <th className="px-4 py-3">Product</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {is.qcoItems.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 text-zinc-600">
                      <Link
                        href={`/rules/qco/${item.qco.id}`}
                        className="hover:underline"
                      >
                        {item.qco.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-900">
                      {item.productName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
