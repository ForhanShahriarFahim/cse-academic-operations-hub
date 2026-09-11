import { getPortalData } from "@/lib/data";
import { fmtRange, DAY_NAMES } from "@/lib/time";
import { PageHeader, Badge, Panel, EmptyNote } from "@/components/ui";
import { OdManager, OdRowActions } from "@/components/od-manager";
import { ShieldQuestion } from "lucide-react";

export const dynamic = "force-dynamic";

const kindLabel: Record<string, string> = {
  teaching: "Outgoing teaching",
  room_reservation: "Room only",
  combined: "Teacher + room",
  unresolved_note: "Unresolved note",
};
const levelTone: Record<string, "pine" | "sage" | "gold" | "clay"> = {
  A: "pine", B: "sage", C: "gold", D: "clay",
};

export default async function OdPage() {
  const data = await getPortalData();

  return (
    <div>
      <PageHeader
        kicker="Cross-department register"
        title="External commitments (the OD row)"
        description="The printed OD row is a report generated from these structured records — it is not the data model. A room/dept label alone never identifies a teacher, and level-D notes stay review items rather than fabricated reservations."
        actions={
          <OdManager
            teachers={data.teachers.map((t) => ({ id: t.id, shortCode: t.shortCode, fullName: t.fullName, homeDepartmentCode: t.homeDepartmentCode }))}
            rooms={data.rooms.map((r) => ({ id: r.id, code: r.code }))}
          />
        }
      />

      <Panel title="Commitment register" sub={`${data.externals.length} records · completeness levels A (full) to D (unresolved)`}>
        <div className="overflow-x-auto">
          <table className="routine-table text-[12px]">
            <thead>
              <tr>
                {["Level", "Kind", "Department", "Teacher", "Room", "Schedule", "Course / audience", "Credits", "Verified", "Source", ""].map((h) => (
                  <th key={h} className="px-2.5 py-2 text-left"><span className="micro-label">{h}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.externals.map((e, i) => (
                <tr key={e.id} className={`${i % 2 ? "bg-[#faf7ec]" : "bg-[#fffdf7]"} ${e.kind === "unresolved_note" ? "opacity-90" : ""}`}>
                  <td className="px-2.5 py-1.5"><Badge tone={levelTone[e.completenessLevel]}>Level {e.completenessLevel}</Badge></td>
                  <td className="px-2.5 py-1.5 font-medium">{kindLabel[e.kind] ?? e.kind}</td>
                  <td className="px-2.5 py-1.5 font-mono font-bold text-[var(--color-clay)]">{e.counterpartDepartment}</td>
                  <td className="px-2.5 py-1.5 font-mono">
                    {e.teacherShortCode ?? <span className="text-[#b3ac93]" title="Unknown — no teacher conflict invented">—</span>}
                  </td>
                  <td className="px-2.5 py-1.5 font-mono">{e.roomCode ?? <span className="text-[#b3ac93]">—</span>}</td>
                  <td className="px-2.5 py-1.5 font-mono text-[11px]">
                    {e.dayOfWeek != null && e.startMinutes != null
                      ? `${DAY_NAMES[e.dayOfWeek].slice(0, 3)} ${fmtRange(e.startMinutes, e.endMinutes!)}`
                      : <span className="text-[#b3ac93]">unstructured</span>}
                  </td>
                  <td className="max-w-[210px] px-2.5 py-1.5 text-[11px] leading-snug text-[#5c675d]">
                    {e.courseLabel ?? e.notes ?? "—"}
                    {e.audienceLabel ? <span className="block text-[10px] text-[#8a8571]">{e.audienceLabel}</span> : null}
                  </td>
                  <td className="px-2.5 py-1.5 font-mono">{e.credits != null ? e.credits.toFixed(1) : <span title="Unknown — not zero">?</span>}</td>
                  <td className="px-2.5 py-1.5">
                    <Badge tone={e.verificationStatus === "verified" ? "pine" : "clay"}>{e.verificationStatus}</Badge>
                  </td>
                  <td className="max-w-[170px] px-2.5 py-1.5 text-[10.5px] leading-snug text-[#8a8571]">{e.source}</td>
                  <td className="px-2.5 py-1.5"><OdRowActions e={e} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-4">
        <EmptyNote>
          <ShieldQuestion size={13} className="mr-1 inline text-[var(--color-gold)]" />
          Coverage disclosure: with level B/D records unverified, the system blocks only <em>known</em> teacher
          and room intervals and never reports “no university-wide conflicts”. Verify records with the
          counterpart department to raise coverage.
        </EmptyNote>
      </div>
    </div>
  );
}
