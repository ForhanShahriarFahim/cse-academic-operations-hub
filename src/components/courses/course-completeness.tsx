import { getPortalData } from "@/lib/data";
import type { GroupCoverage } from "@/lib/data";
import { DAY_SHORT, fmtRange24 } from "@/lib/time";
import type { MeetingView } from "@/lib/serialize";
import { Badge, Panel } from "@/components/ui";
import { AlertTriangle, Asterisk } from "lucide-react";
import { ActiveTermUnavailable } from "@/lib/term-state";



export const dynamic = "force-dynamic";

const statusTone: Record<GroupCoverage["status"], { tone: "pine" | "gold" | "clay" | "neutral" | "sage"; label: string }> = {
  scheduled: { tone: "pine", label: "Scheduled" },
  partial: { tone: "gold", label: "Partially scheduled" },
  unscheduled: { tone: "clay", label: "Unscheduled" },
  over_scheduled: { tone: "gold", label: "Over-scheduled" },
  vacancy: { tone: "clay", label: "UT vacancy" },
  teacher_managed: { tone: "sage", label: "Teacher-managed" },
};

export async function CourseCompleteness({ expectedTermId }: { expectedTermId: number }) {
  let data: Awaited<ReturnType<typeof getPortalData>>;
  try { data = await getPortalData(); }
  catch (error) {
    if (!(error instanceof ActiveTermUnavailable)) throw error;
    return <Panel title="Scheduling completeness" sub="Term-specific report"><p className="p-3 text-sm">The active term changed or is unavailable. Refresh to review scheduling completeness. The global catalog remains available.</p></Panel>;
  }
  if (data.term.id !== expectedTermId) return <Panel title="Scheduling completeness" sub="Term-specific report"><p className="p-3 text-sm">The active term changed. Refresh to review its scheduling completeness. The global catalog remains available.</p></Panel>;
  const meetingsByGroup = new Map<number, MeetingView[]>();
  for (const m of data.meetings) {
    const arr = meetingsByGroup.get(m.teachingGroupId) ?? [];
    arr.push(m);
    meetingsByGroup.set(m.teachingGroupId, arr);
  }
  for (const arr of meetingsByGroup.values()) {
    arr.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinutes - b.startMinutes);
  }

  return (
    <div>
      <Panel title={`Scheduling completeness — ${data.term.name}`} sub="Each teaching group compared with its required weekly classes">
        <div role="region" aria-label="Scheduling completeness by teaching group" tabIndex={0} className="table-region overflow-x-auto">
          <table className="routine-table text-[12px]">
            <thead>
              <tr>
                {["Group", "Audience", "Teachers", "Weekly routine", "Required", "Status", "Notes"].map((h) => (
                  <th key={h} className="px-2.5 py-2 text-left"><span className="micro-label">{h}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.coverage.map((c, i) => (
                <tr key={c.teachingGroupId} className={i % 2 ? "bg-wash" : "bg-sheet"}>
                  <td className="px-2.5 py-1.5">
                    <span className="font-mono font-bold text-[var(--color-pine)]">{c.courseCode}</span>
                    <span className="block max-w-[220px] truncate text-[10.5px] text-muted" title={c.courseTitle}>{c.courseTitle}</span>
                  </td>
                  <td className="px-2.5 py-1.5 font-medium">{c.audience}</td>
                  <td className="px-2.5 py-1.5 font-mono">{c.teacherCodes.join("+") || <span className="text-[var(--color-clay)]">UT</span>}</td>
                  <td className="max-w-[280px] px-2.5 py-1.5">
                    {(meetingsByGroup.get(c.teachingGroupId) ?? []).length === 0 ? (
                      <span className="text-[10.5px] italic text-muted">
                        {c.deliveryMode === "teacher_managed" ? "teacher-managed — no weekly slots" : "no meetings yet"}
                      </span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {(meetingsByGroup.get(c.teachingGroupId) ?? []).map((m) => (
                          <span key={m.id} className="rounded border border-[var(--color-line-soft)] bg-white px-1.5 py-px font-mono text-[10px] text-ink-2">
                            {DAY_SHORT[m.dayOfWeek]} {fmtRange24(m.startMinutes, m.endMinutes)} · {m.rooms.map((r) => r.code).join("/") || "?"}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 font-mono text-[11px]">
                    {c.expectedWeeklyMinutes != null ? `${c.scheduledMinutes}/${c.expectedWeeklyMinutes} min` : `${c.scheduledMinutes} min`}
                  </td>
                  <td className="px-2.5 py-1.5">
                    <Badge tone={statusTone[c.status].tone}>
                      {c.deliveryMode === "teacher_managed" && <Asterisk size={9} />}
                      {statusTone[c.status].label}
                    </Badge>
                  </td>
                  <td className="max-w-[240px] px-2.5 py-1.5 text-[10.5px] leading-snug text-muted">
                    {c.pendingReconciliation && (
                      <span className="mb-0.5 flex items-start gap-1 text-[var(--color-clay)]">
                        <AlertTriangle size={10} className="mt-0.5 shrink-0" /> timing reconciliation pending
                      </span>
                    )}
                    {c.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

    </div>
  );
}
