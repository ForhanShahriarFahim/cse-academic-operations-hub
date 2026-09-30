import { getPortalData } from "@/lib/data";
import { analyzeSchedule, type Issue } from "@/lib/conflicts";
import { PageHeader, Badge, Panel, StatCard, EmptyNote } from "@/components/ui";
import { AlertTriangle, CheckCircle2, ShieldAlert, Info } from "lucide-react";
import { DAY_NAMES } from "@/lib/time";
import { PrintHeader } from "@/components/print-header";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<Issue["type"], string> = {
  teacher_double_booking: "Teacher double-booking",
  room_double_booking: "Room double-booking",
  audience_overlap: "Student audience overlap",
  external_teacher_conflict: "Outgoing teaching clash (OD)",
  external_room_conflict: "External room reservation clash (OD)",
  break_conflict: "Break violation",
  outside_permitted_window: "Outside permitted window",
  window_exception_in_use: "Approved exception in use",
  capacity_violation: "Capacity exceeded",
  capacity_unverified: "Capacity unverified",
  incompatible_room: "Incompatible room",
  tight_transition: "Tight transition (travel)",
  pending_reconciliation: "Reconciliation pending",
};

export default async function ConflictsPage() {
  const data = await getPortalData();
  const issues = analyzeSchedule({
    meetings: data.meetings,
    externals: data.externals,
    breaks: data.breaks,
    windows: data.windows,
  });
  const blockers = issues.filter((i) => i.severity === "blocker");
  const warnings = issues.filter((i) => i.severity === "warning");
  const gaps = data.coverage.filter((c) => c.status !== "scheduled" && c.status !== "teacher_managed");

  return (
    <div>
      <PrintHeader title="Validation" termName={data.term.name} publishedVersion={data.versions.find((v) => v.state === "published")?.versionNumber ?? null} />
      <PageHeader
        context="Routine"
        title="Validation"
        description="Every clash and warning in the working draft, with the classes and exact times involved. Blockers must be fixed before the routine can be published; warnings are published alongside it."
        actions={<PrintButton />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Blocking conflicts" value={blockers.length} tone={blockers.length ? "bad" : "good"}
          sub={blockers.length ? "Must be fixed before publishing" : "Nothing blocks publication"} />
        <StatCard label="Warnings" value={warnings.length} sub="Published with the routine" tone={warnings.length ? "warn" : "default"} />
        <StatCard label="Scheduling gaps" value={gaps.length} sub="Groups without a teacher or not fully placed" tone={gaps.length ? "warn" : "good"} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <Panel title="Blocking conflicts" sub="Fix these in the Routine builder; they cannot be overridden">
          {blockers.length === 0 ? (
            <EmptyNote>
              <CheckCircle2 size={14} className="mr-1 inline text-[var(--color-pine)]" />
              No teacher, room, student-audience, break, window or resource blockers in the working draft.
            </EmptyNote>
          ) : (
            <ul className="space-y-2">
              {blockers.map((i) => <IssueRow key={i.id} issue={i} />)}
            </ul>
          )}
        </Panel>

        <Panel title="Warnings" sub="Review these; department policy can raise some of them to blockers">
          {warnings.length === 0 ? (
            <EmptyNote>No advisories currently.</EmptyNote>
          ) : (
            <div role="region" aria-label="Warnings" tabIndex={0} className="table-region max-h-[520px] overflow-y-auto pr-1"><ul className="space-y-2">
              {warnings.map((i) => <IssueRow key={i.id} issue={i} />)}
            </ul></div>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="What Validation checks">
          <div className="grid gap-x-6 gap-y-1.5 text-[12px] text-ink-2 md:grid-cols-2">
            {[
              "A teacher, room or batch booked twice at the same time, across streams and departments",
              "Commitments to other departments: a named teacher is blocked; a room-only booking blocks just the room",
              "Breaks for each stream, including the Diploma Friday prayer break from 1:00 to 2:00 PM",
              "HSC classes on Friday need an approved exception; the Diploma Saturday window is still provisional",
              "A merged class uses its teacher and room once; overlapping duplicate rows are flagged",
              "Classes with unknown student numbers are flagged instead of assumed to fit",
              "Sessional classes need a lab, and more students than seats is a blocker",
              "Back-to-back classes in different buildings get a travel warning"
              , "Times are exact to the minute: 10:00–11:00 and 11:00–12:00 do not clash, but 10:45–12:00 and 11:00–12:00 do",
            ].map((t, i) => (
              <p key={i} className="flex items-start gap-1.5">
                <CheckCircle2 size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-pine)]" /> {t}
              </p>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function IssueRow({ issue: i }: { issue: Issue }) {
  return (
    <li className={`rounded-md border px-3 py-2 ${
      i.severity === "blocker"
        ? "border-[var(--color-clay)]/30 bg-[var(--color-clay)]/[0.04]"
        : "border-[var(--color-gold)]/30 bg-[var(--color-gold)]/[0.05]"
    }`}>
      <div className="flex flex-wrap items-center gap-2">
        {i.severity === "blocker"
          ? <ShieldAlert size={14} className="text-[var(--color-clay)]" />
          : <AlertTriangle size={14} className="text-gold-text" />}
        <span className="text-[12.5px] font-semibold">{i.title}</span>
        <Badge tone={i.severity === "blocker" ? "clay" : "gold"}>{i.severity}</Badge>
        <Badge tone="neutral">{TYPE_LABEL[i.type]}</Badge>
        <span className="ml-auto flex items-center gap-1 text-[10.5px] text-muted">
          <Info size={11} /> {DAY_NAMES[i.dayOfWeek]}
        </span>
      </div>
      <p className="mt-1 pl-6 text-[11.5px] leading-relaxed text-muted">{i.detail}</p>
    </li>
  );
}
