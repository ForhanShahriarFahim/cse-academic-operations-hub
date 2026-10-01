import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, Lock, Link2, Ban, CircleAlert } from "lucide-react";
import { can, getOptionalActor } from "@/lib/auth";
import { loadAccountList, type AccountListRow } from "@/lib/auth/access-data";
import { ROLE_LABELS } from "@/lib/auth/access-summary";
import { fmtDay, fmtInstant } from "@/lib/auth/display";
import { ROLES } from "@/lib/auth/policy";
import { PageHeader, StatusText, TableRegion } from "@/components/ui";
import { Chip } from "@/components/account/form-bits";
import { buttonClass, inputClass } from "@/components/account/styles";

export const dynamic = "force-dynamic";

type StatusFilter = "all" | "active" | "waiting" | "locked" | "suspended";

function StatusCell({ status }: { status: AccountListRow["status"] }) {
  switch (status.kind) {
    case "active": return <StatusText tone="ok">Active</StatusText>;
    case "invited": return <StatusText tone="pending">Invited, not signed in yet</StatusText>;
    case "suspended": return <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-clay)]"><Ban size={14} aria-hidden="true" />Suspended</span>;
    case "locked": return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold text-gold-text"><Lock size={14} aria-hidden="true" />Locked until {fmtInstant(status.until).replace(/^today, /, "")}</span>;
    case "setup_waiting": return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium text-ink-2"><Link2 size={14} aria-hidden="true" />Setup link waiting · expires {fmtDay(status.expiresAt).replace(/ \d{4}$/, "")}</span>;
    case "setup_expired": return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold text-[var(--color-clay)]"><CircleAlert size={14} aria-hidden="true" />No password yet · issue a setup link</span>;
  }
}

const matchesStatus = (row: AccountListRow, filter: StatusFilter) =>
  filter === "all"
  || (filter === "active" && (row.status.kind === "active" || row.status.kind === "invited"))
  || (filter === "waiting" && (row.status.kind === "setup_waiting" || row.status.kind === "setup_expired"))
  || (filter === "locked" && row.status.kind === "locked")
  || (filter === "suspended" && row.status.kind === "suspended");

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; role?: string }> }) {
  const actor = await getOptionalActor();
  if (!actor) redirect("/login?next=/access");
  if (!await can(actor, "manage_users")) redirect("/forbidden");
  const query = await searchParams;
  const q = (query.q ?? "").trim().toLowerCase();
  const status = (["active", "waiting", "locked", "suspended"].includes(query.status ?? "") ? query.status : "all") as StatusFilter;
  const role = ROLES.find((value) => value === query.role) ?? null;
  const rows = await loadAccountList();
  const shown = rows.filter((row) =>
    matchesStatus(row, status)
    && (!role || row.roles.some((entry) => entry.label === ROLE_LABELS[role]))
    && (!q || `${row.displayName} ${row.email} ${row.teacherCode ?? ""}`.toLowerCase().includes(q)));
  const count = (kinds: AccountListRow["status"]["kind"][]) => rows.filter((row) => kinds.includes(row.status.kind)).length;
  const figures = [
    { label: "Accounts", value: rows.length, sub: "Including suspended" },
    { label: "Active", value: count(["active", "locked"]), sub: "Signed in at least once" },
    { label: "Waiting for setup", value: count(["setup_waiting", "setup_expired", "invited"]), sub: `${count(["setup_expired"])} without a working link` },
    { label: "Locked now", value: count(["locked"]), sub: "Unlocks by itself after 15 minutes" },
    { label: "Suspended", value: count(["suspended"]), sub: "No sign-in" },
  ];

  return <div className="mx-auto max-w-6xl">
    <PageHeader
      context="Administration"
      title="People & access"
      description="Accounts, sign-in methods and roles. Only people with an account here can sign in."
      actions={<Link href="/access/new" className={buttonClass.primary}><KeyRound size={15} aria-hidden="true" />Create account</Link>}
    />

    <dl className="mb-5 grid grid-cols-2 border-y border-[var(--color-line)] sm:grid-cols-3 lg:grid-cols-5">
      {figures.map((figure) => <div key={figure.label} className="border-[var(--color-line-soft)] py-3 pr-3 lg:border-l lg:pl-4 lg:first:border-l-0 lg:first:pl-0">
        <dt className="text-[12.5px] text-muted">{figure.label}</dt>
        <dd className="font-display tabular mt-0.5 text-[26px] font-semibold leading-tight">{figure.value}</dd>
        <dd className="text-[12px] text-muted">{figure.sub}</dd>
      </div>)}
    </dl>

    <section aria-labelledby="accounts-heading" className="ruled rounded-lg">
      <h2 id="accounts-heading" className="sr-only">Accounts</h2>
      <form role="search" className="flex flex-wrap items-end gap-3 border-b border-[var(--color-line-soft)] px-4 py-3.5">
        <label className="grid min-w-[220px] flex-1 gap-1.5 text-[13.5px] font-semibold">Search
          <input type="search" name="q" defaultValue={query.q ?? ""} placeholder="Name, email or teacher code" className={`${inputClass} min-h-9 font-normal`} />
        </label>
        <label className="grid w-full gap-1.5 text-[13.5px] font-semibold sm:w-44">Status
          <select name="status" defaultValue={status} className={`${inputClass} min-h-9 font-normal`}>
            <option value="all">All statuses</option><option value="active">Active</option><option value="waiting">Waiting for setup</option>
            <option value="locked">Locked</option><option value="suspended">Suspended</option>
          </select>
        </label>
        <label className="grid w-full gap-1.5 text-[13.5px] font-semibold sm:w-52">Role
          <select name="role" defaultValue={role ?? ""} className={`${inputClass} min-h-9 font-normal`}>
            <option value="">All roles</option>
            {ROLES.map((value) => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}
          </select>
        </label>
        <button className={buttonClass.secondary}>Show</button>
      </form>

      {shown.length === 0 ? <p className="m-4 rounded-md border border-dashed border-[var(--color-line)] bg-wash px-3 py-2.5 text-[13px] text-ink-2">No accounts match. <Link href="/access" className="font-medium text-[var(--color-pine)] underline">Clear the filters</Link></p> : <>
        <TableRegion label="Accounts table" className="hidden md:block">
          <table className="w-full border-separate border-spacing-0 text-[13.5px]">
            <thead><tr className="bg-wash text-left text-[12.5px] text-ink-2">
              {["Person", "Teacher", "Sign-in", "Roles", "Status", "Last signed in"].map((label) => <th key={label} scope="col" className="border-b border-[var(--color-line)] px-3 py-2 font-semibold first:pl-4">{label}</th>)}
            </tr></thead>
            <tbody>
              {shown.map((row) => <tr key={row.id} className="align-top hover:bg-[#faf7ee]">
                <td className="border-b border-[var(--color-line-soft)] py-2.5 pl-4 pr-3">
                  <Link href={`/access/${row.id}`} className="font-semibold hover:text-[var(--color-pine)] hover:underline">{row.displayName}</Link>
                  {row.id === actor.id ? <span className="ml-1 text-[12px] text-muted">(you)</span> : null}
                  <span className="block text-[12.5px] text-muted">{row.email}</span>
                </td>
                <td className="border-b border-[var(--color-line-soft)] px-3 py-2.5 font-mono text-[12.5px]">{row.teacherCode ?? <span className="text-muted">—</span>}</td>
                <td className="border-b border-[var(--color-line-soft)] px-3 py-2.5"><span className="flex flex-wrap gap-1">{row.passwordEnabled ? <Chip>Password</Chip> : null}{row.googleEnabled ? <Chip>Google</Chip> : null}</span></td>
                <td className="border-b border-[var(--color-line-soft)] px-3 py-2.5">
                  {row.roles.length ? row.roles.map((entry, index) => <span key={index} className={entry.state === "scheduled" ? "text-muted" : ""}>{index ? ", " : ""}{entry.label}{entry.state === "scheduled" ? ` from ${fmtDay(entry.from).replace(/ \d{4}$/, "")}` : ""}</span>) : <span className="text-muted">No role</span>}
                </td>
                <td className="border-b border-[var(--color-line-soft)] px-3 py-2.5"><StatusCell status={row.status} /></td>
                <td className="tabular whitespace-nowrap border-b border-[var(--color-line-soft)] px-3 py-2.5">{row.lastLoginAt ? fmtInstant(row.lastLoginAt) : <span className="text-muted">Never</span>}</td>
              </tr>)}
            </tbody>
          </table>
        </TableRegion>

        <ul aria-label="Accounts" className="md:hidden">
          {shown.map((row) => <li key={row.id} className="grid gap-1.5 border-t border-[var(--color-line-soft)] px-4 py-3 first:border-t-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/access/${row.id}`} className="font-semibold underline-offset-2 hover:underline">{row.displayName}{row.id === actor.id ? " (you)" : ""}</Link>
              <StatusCell status={row.status} />
            </div>
            <span className="break-all text-[12.5px] text-muted">{row.email}{row.teacherCode ? ` · ${row.teacherCode}` : ""}</span>
            <span className="flex flex-wrap gap-1">
              {row.passwordEnabled ? <Chip>Password</Chip> : null}{row.googleEnabled ? <Chip>Google</Chip> : null}
              {row.roles.map((entry, index) => <Chip key={index} tone={entry.state === "current" ? "pine" : "gold"}>{entry.label}{entry.state === "scheduled" ? ` from ${fmtDay(entry.from).replace(/ \d{4}$/, "")}` : ""}</Chip>)}
            </span>
          </li>)}
        </ul>
      </>}
    </section>
    <p className="mt-2.5 text-[12.5px] text-muted">Showing {shown.length} of {rows.length}. Times are in Asia/Dhaka.</p>
  </div>;
}
