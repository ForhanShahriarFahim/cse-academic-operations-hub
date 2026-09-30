import Link from "next/link";
import { ArrowLeft, CircleAlert, Sparkles } from "lucide-react";
import { AutoScheduleApply } from "@/components/auto-schedule-panel";
import { Badge, EmptyNote, PageHeader, Panel, StatCard } from "@/components/ui";
import { buildAutoSchedulePlan } from "@/lib/schedule-automation";
import { DAY_NAMES, fmtRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AutoSchedulePage() {
  const source = await buildAutoSchedulePlan();
  return <div>
    <Link href="/routine" className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-pine)] hover:underline"><ArrowLeft size={13} />Routine Builder</Link>
    <PageHeader
      context="Routine"
      title="Suggested placements"
      description="Suggests times and rooms for unplaced classes from current assignments, class days, breaks and room capabilities. Nothing changes until you apply the suggestions, and they are checked again before saving."
      actions={<AutoScheduleApply count={source.plan.suggestions.length} />}
    />
    <div className="mb-4 grid gap-3 md:grid-cols-3">
      <StatCard label="Safe suggestions" value={source.plan.suggestions.length} sub="zero blocking conflicts" tone="good" />
      <StatCard label="Needs attention" value={source.plan.skipped.length} sub="vacancy, policy, room, or timetable constraint" tone={source.plan.skipped.length ? "warn" : "good"} />
      <StatCard label="Existing meetings" value={source.data.meetings.length} sub="preserved as authoritative input" />
    </div>
    <Panel title="Suggested placements" sub="Theory prefers classrooms but may use a free lab; sessionals require a matching lab capability.">
      {source.plan.suggestions.length === 0 ? <EmptyNote>No safe placements are currently available. Resolve the items below or the coverage gaps manually.</EmptyNote> : <div role="region" aria-label="Suggested placements" tabIndex={0} className="table-region overflow-x-auto"><table className="routine-table text-[12.5px]"><thead><tr>{["Course", "Audience", "Day", "Time", "Teacher", "Room", "Advisories"].map((header) => <th key={header} className="px-3 py-2 text-left"><span className="micro-label">{header}</span></th>)}</tr></thead><tbody>{source.plan.suggestions.map((suggestion) => <tr key={suggestion.key}><td className="px-3 py-2"><strong className="font-mono">{suggestion.courseCode}</strong><p className="text-[10.5px] text-muted">{suggestion.courseTitle}</p></td><td className="px-3 py-2">{suggestion.audience}</td><td className="px-3 py-2 font-semibold">{DAY_NAMES[suggestion.dayOfWeek]}</td><td className="px-3 py-2 font-mono">{fmtRange(suggestion.startMinutes, suggestion.endMinutes)}</td><td className="px-3 py-2 font-mono">{suggestion.teacherCodes.join(" + ")}</td><td className="px-3 py-2 font-mono font-bold text-[var(--color-pine)]">{suggestion.roomCode}</td><td className="px-3 py-2">{suggestion.warnings.length ? suggestion.warnings.map((warning) => <Badge key={warning} tone="gold">{warning}</Badge>) : <Badge tone="pine">safe</Badge>}</td></tr>)}</tbody></table></div>}
    </Panel>
    <div className="mt-4"><Panel title="Unresolved coverage" sub="The assistant does not invent missing teachers, rooms, credits, or policy exceptions.">{source.plan.skipped.length === 0 ? <EmptyNote>Nothing was skipped.</EmptyNote> : <ul className="space-y-2">{source.plan.skipped.map((item, index) => <li key={`${item.teachingGroupId}-${index}`} className="flex items-start gap-2 rounded-md border border-[var(--color-gold)]/25 bg-[var(--color-gold)]/[0.05] px-3 py-2 text-[12px]"><CircleAlert size={14} className="mt-0.5 shrink-0 text-gold-text" /><span><strong className="font-mono">{item.courseCode}</strong> · {item.audience}<br /><span className="text-muted">{item.reason}</span></span></li>)}</ul>}</Panel></div>
    <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted"><Sparkles size={12} />Automatic placement is an initialization aid, not an automatic publication decision.</p>
  </div>;
}
