import { getPortalData } from "@/lib/data";
import { analyzeSchedule, type Issue } from "@/lib/conflicts";
import { PageHeader, Badge, Panel, StatCard, EmptyNote } from "@/components/ui";
import { AlertTriangle, CheckCircle2, ShieldAlert, Info } from "lucide-react";
import { DAY_NAMES } from "@/lib/time";

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
      <PageHeader
        context="Routine"
        title="Validation"
        description="Every clash and warning in the working draft, with the classes and exact times involved. Blockers must be fixed before the routine can be published; warnings are published alongside it."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Blocking issues" value={blockers.length} tone={blockers.length ? "bad" : "good"}
          sub={blockers.length ? "Publication blocked until resolved" : "Draft is publishable"} />
        <StatCard label="Advisory warnings" value={warnings.length} sub="Disclosed, never silently ignored" tone={warnings.length ? "warn" : "default"} />
        <StatCard label="Scheduling gaps" value={gaps.length} sub="Vacancies + partial requirements" tone={gaps.length ? "warn" : "good"} />
        <StatCard label="Interval rule" value="[s, e)" sub="10:45–12:00 vs 11:00–12:00 overlap; 10–11 vs 11–12 do not" />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <Panel title="Blocking violations" sub="Cannot be published or “ignored” — the data must be corrected">
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

        <Panel title="Advisory warnings" sub="Policy may elevate specific advisories to blockers">
          {warnings.length === 0 ? (
            <EmptyNote>No advisories currently.</EmptyNote>
          ) : (
            <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {warnings.map((i) => <IssueRow key={i.id} issue={i} />)}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Detected & enforced by this engine" sub="Mirrors spec §15 acceptance tests">
          <div className="grid gap-x-6 gap-y-1.5 text-[12px] text-ink-2 md:grid-cols-2">
            {[
              "Teacher / room / student-audience double-booking across streams and departments",
              "Outgoing teaching (OD level A/B) blocks the correct CSE teacher — room-only OD blocks only the room",
              "Breaks applied by scope — Diploma Friday Jumu'ah 13:00–14:00, never 12:00–13:00",
              "HSC Friday requires an approved exception; Diploma Saturday window stays provisional",
              "Merged events occupy resources once; overlapping duplicate rows are a data error",
              "Unknown audience sizes produce unverified advisories, never silent approval",
              "Sessional deliveries constrained to lab rooms; capacity excess is a blocker",
              "Back-to-back classes across buildings raise travel advisories",
            ].map((t, i) => (
              <p key={i} className="flex items-start gap-1.5">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[var(--color-pine)]" /> {t}
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
