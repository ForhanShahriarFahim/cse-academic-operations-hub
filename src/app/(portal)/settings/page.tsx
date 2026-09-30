import { getPortalData } from "@/lib/data";
import { fmtRange, DAY_NAMES } from "@/lib/time";
import { INSTITUTION } from "@/lib/constants";
import { PageHeader, Badge, Panel, EmptyNote } from "@/components/ui";
import { CircleAlert, CircleCheck } from "lucide-react";
import { getAcademicPolicy } from "@/lib/academic-operations";
import { PolicyManager } from "@/components/policy-manager";

export const dynamic = "force-dynamic";

const BLOCKING_DECISIONS = [
  "Approved institution acronym and official branding (do not assume “PUST”).",
  "Official HSC permitted days and the Friday exception policy.",
  "Exact HSC Friday/Saturday exceptional times (incl. the blue 12:00 PM–2:30 PM label).",
  "Exact Diploma Saturday morning windows and breaks.",
  "Resolution of the shared Friday 12:00–13:00 vs 12:00–13:15 timing for merged CSE-2101.",
  "Meaning of each OD record type (teaching vs room reservation vs both).",
  "Verified teacher identities and home departments (import-time counts unconfirmed).",
  "Actual room capacities, types, and control/ownership.",
  "Student counts for shared departmental classes (EEE-22B).",
  "Approved course contact-time requirements by stream and course type.",
  "Workload calculation policy for merged classes, separate sections, co-teaching, supervision, and external teaching.",
  "Publication approver and permitted policy overrides.",
];

const OPERATIONAL = [
  "Public viewer scope and share policy.", "Public staff/CR contact visibility.",
  "Hosting budget and worker/PDF requirements.", "Domain ownership.",
  "Data retention policy.", "Backup/recovery objectives (RPO/RTO sign-off).",
  "Email/notification provider.", "Need for Bangla UI.",
  "Expected concurrent users and future department expansion.",
];

export default async function SettingsPage() {
  const data = await getPortalData();
  const policy = await getAcademicPolicy(data.term.id);

  return (
    <div>
      <PageHeader
        context="Administration"
        title="Decisions & settings"
        description="University policies that are still waiting for a decision, and the provisional settings the portal uses until they are confirmed."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Blocking decisions before official import" sub="These gate accurate production scheduling and publication validation">
          <ul className="space-y-1.5">
            {BLOCKING_DECISIONS.map((d, i) => (
              <li key={i} className="flex items-start gap-2 rounded-md border border-[var(--color-gold)]/25 bg-[var(--color-gold)]/[0.05] px-2.5 py-1.5 text-[12px] text-gold-text">
                <CircleAlert size={13} className="mt-0.5 shrink-0 text-gold-text" />
                <span><span className="mr-1.5 font-mono text-[10px] font-bold">{i + 1}.</span>{d}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-4">
          <Panel title="Institution profile (provisional)">
            <dl className="space-y-2 text-[12.5px]">
              {[
                ["University", INSTITUTION.universityName],
                ["Department", INSTITUTION.departmentName],
                ["Programme", INSTITUTION.programme],
                ["Acronym", `${INSTITUTION.acronymProvisional} — pending confirmation`],
                ["Time zone", INSTITUTION.timeZone],
                ["Active term", `${data.term.name} · ${data.term.startDate} → ${data.term.endDate}`],
                ["Routine effective", data.term.effectiveFrom ?? "not set"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3 border-b border-[var(--color-line-soft)]/60 pb-1.5">
                  <dt className="w-28 shrink-0"><span className="micro-label">{k}</span></dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="Active time policy (from database)">
            <p className="micro-label mb-1.5">Breaks</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {data.breaks.map((b) => (
                <Badge key={b.id} tone="sage">
                  {b.name} · {b.scope === "stream" ? b.stream : "all"} · {b.dayOfWeek != null ? DAY_NAMES[b.dayOfWeek] : "every day"} {fmtRange(b.startMinutes, b.endMinutes)}
                </Badge>
              ))}
            </div>
            <p className="micro-label mb-1.5">Permitted windows</p>
            <div className="flex flex-wrap gap-1.5">
              {data.windows.map((w) => (
                <Badge key={w.id} tone={w.note ? "gold" : "pine"}>
                  {w.stream} · {DAY_NAMES[w.dayOfWeek]} {fmtRange(w.startMinutes, w.endMinutes)}{w.note ? " (provisional)" : ""}
                </Badge>
              ))}
            </div>
          </Panel>

          <Panel title="Operational decisions" sub="Before production rollout">
            <ul className="space-y-1">
              {OPERATIONAL.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-muted">
                  <CircleCheck size={13} className="mt-0.5 shrink-0 text-muted" /> {d}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="mt-4">
        <PolicyManager policy={policy} windows={data.windows} batches={data.batches} />
      </div>

      <div className="mt-4">
        <EmptyNote>
          Seed-data policy: this deployment runs on <strong>synthetic development data</strong>. Real university
          data enters only through reviewed import staging — never by hardcoding counts (“82 courses / 17 rooms /
          38 teachers” are unverified source claims, not seed facts).
        </EmptyNote>
      </div>
    </div>
  );
}
