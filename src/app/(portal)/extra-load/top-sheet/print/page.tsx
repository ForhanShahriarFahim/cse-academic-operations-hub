import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { INSTITUTION } from "@/lib/constants";
import { getExtraLoadData } from "@/lib/academic-operations";
import { can, requireActor } from "@/lib/auth";
import { amountInWords } from "@/lib/extra-load";
import { fromPaisa, rateTrace, toPaisa } from "@/lib/policy-versions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ExtraLoadTopSheetPrintPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const actor = await requireActor();
  if (!await can(actor, "view_payment_reports")) redirect("/forbidden");
  const query = await searchParams;
  const source = await getExtraLoadData(query.from, query.to);
  const appRows = source.teacherSummaries.filter((row) => row.classCount > 0).map((row) => ({ name: row.teacher.fullName, classes: row.classCount, amount: row.amount }));
  const manualRows = source.manualSummaries.map((row) => ({ name: row.teacherName, classes: row.classCount, amount: row.amount }));
  const unpriced = [...appRows, ...manualRows].some((row) => row.amount == null);
  if (source.policyMissing || unpriced) {
    return <div className="mx-auto max-w-xl rounded-md border border-[var(--color-clay)]/40 bg-[var(--color-clay)]/5 p-5 text-sm">
      <h1 className="font-display text-lg font-semibold">Top sheet not available</h1>
      <p className="mt-2">This term has no approved payment policy, so the claims are not priced. Approve its baseline on Settings, then print again.</p>
      <Link href="/extra-load" className="mt-3 inline-block font-semibold text-[var(--color-pine)] underline">← Extra class load</Link>
    </div>;
  }
  const rows = [...appRows, ...manualRows].map((row) => ({ ...row, amount: row.amount! }));
  const total = fromPaisa(rows.reduce((sum, row) => sum + toPaisa(row.amount), 0));
  const blankCount = Math.max(0, 10 - rows.length);
  return <div className="top-sheet mx-auto max-w-[216mm] bg-white text-black">
    <div className="no-print mb-4 flex items-center justify-between rounded-md border border-[var(--color-line)] bg-sheet p-3 font-sans"><Link href="/extra-load" className="text-[12px] font-semibold text-[var(--color-pine)]">← Extra class load</Link><PrintButton /></div>
    <article className="extra-load-document min-h-[279mm] px-[25mm] py-[20mm] font-['Times_New_Roman',serif] text-[12pt]">
      <header className="text-center leading-tight">
        <h1 className="text-[18pt] font-bold">Extra Class Load</h1>
        <p className="mt-1 text-[13pt] font-bold">{INSTITUTION.departmentName}</p>
        <p className="text-[12pt]">{INSTITUTION.universityName}</p>
        <p className="text-[11pt]">Gokul, Bogura-5800</p>
        <div className="mt-2 border-b-2 border-[#4472c4]" />
      </header>
      <h2 className="mt-5 text-center text-[14pt] font-bold underline">Top sheet</h2>
      <p className="mt-4 font-bold">Honorarium list of CSE dept. for Extra Classes</p>
      <table className="official-grid mt-2 w-full table-fixed">
        <colgroup><col className="w-[11%]" /><col className="w-[31%]" /><col className="w-[18%]" /><col className="w-[18%]" /><col /></colgroup>
        <thead><tr><th>Serial<br />No.</th><th>Teacher&apos;s Name</th><th>Number of<br />Classes</th><th>Number of<br />Amount</th><th>Signature</th></tr></thead>
        <tbody>
          {rows.map((row, index) => <tr key={`${row.name}-${index}`}><td>{index + 1}</td><td className="text-left">{row.name}</td><td>{row.classes}</td><td>{row.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td><td>&nbsp;</td></tr>)}
          {Array.from({ length: blankCount }, (_, index) => <tr key={`blank-${index}`}><td>{rows.length + index + 1}</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>)}
          <tr className="font-bold"><td colSpan={3} className="text-right">Total:</td><td>{total.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td><td>&nbsp;</td></tr>
        </tbody>
      </table>
      <p className="mt-3"><strong>In word:</strong> {amountInWords(total)}.</p>
      <div className="mt-20 w-56 border-t border-black pt-1 text-center leading-tight"><p className="font-bold">Head</p><p>Department of CSE</p><p>{INSTITUTION.universityName}</p></div>
      {source.versionsUsed.length > 0 && <p className="policy-trace mt-10 border-t border-[#999] pt-1 font-sans text-[8pt] text-[#444]">Payment policy: {rateTrace(source.versionsUsed)}{source.manualSummaries.some((row) => row.policyVersion == null) ? "; manual overrides as entered" : ""}.</p>}
    </article>
  </div>;
}
