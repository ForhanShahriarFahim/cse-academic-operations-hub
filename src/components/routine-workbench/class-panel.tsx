"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { DAY_NAMES, DAY_SHORT, fmtRange } from "@/lib/time";
import { daysFor, periodsFor, type Stream, type TimeGrid } from "@/lib/time-grid";
import type { MeetingView } from "@/lib/serialize";
import type { ActionResult } from "@/lib/action-result";
import { createMeetingAction, deleteMeetingAction, moveMeetingAction, updateMeetingAction } from "@/lib/actions";
import {
  candidateMeeting, knownAudienceSize, precheck, roomAvailability, suitableRooms, teacherAvailability,
  type EngineContext, type Placement, type WorkbenchRoom, type WorkbenchTeacher,
} from "@/lib/routine-workbench";
import { useConfirm } from "@/components/confirm-dialog";
import { AvailabilityPicker } from "./availability-picker";
import type { WorkbenchGroup } from "./workbench";

export type PanelMode =
  | { kind: "edit"; meetingId: number }
  | { kind: "new"; day: number; batchId: number; start: number; end: number; groupId?: number };

export interface ChangeReport {
  result: ActionResult;
  /** Reverses the change through the same validated actions, when possible. */
  undo?: () => Promise<ActionResult>;
}

const toClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const fromClock = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const batchName = (stream: string, label: string) => `${stream === "HSC" ? "HSC" : "DIP"}-${label}`;

function placementForm(groupId: number, p: Placement): FormData {
  const form = new FormData();
  form.set("teachingGroupId", String(groupId));
  form.set("dayOfWeek", String(p.dayOfWeek));
  form.set("startTime", toClock(p.startMinutes));
  form.set("endTime", toClock(p.endMinutes));
  p.teacherIds.forEach((id) => form.append("teacherIds", String(id)));
  p.roomIds.forEach((id) => form.append("roomIds", String(id)));
  if (p.isException) form.set("isException", "on");
  if (p.exceptionNote) form.set("exceptionNote", p.exceptionNote);
  return form;
}

const placementOf = (m: MeetingView): Placement => ({
  dayOfWeek: m.dayOfWeek, startMinutes: m.startMinutes, endMinutes: m.endMinutes,
  teacherIds: m.teachers.map((t) => t.id), roomIds: m.rooms.map((r) => r.id),
  isException: m.isException, exceptionNote: m.exceptionNote,
});

/** Undo for a deleted class: add it again with the same group, time, staff and note. */
export function recreate(m: MeetingView): () => Promise<ActionResult> {
  const form = placementForm(m.teachingGroupId, placementOf(m));
  if (m.customTimeLabel) form.set("customTimeLabel", m.customTimeLabel);
  return () => createMeetingAction(form);
}

export function ClassPanel({ mode, stream, grid, meetings, groups, teachers, rooms, context, onChange, onClose, headingId }: {
  mode: PanelMode;
  stream: Stream;
  grid: TimeGrid;
  meetings: MeetingView[];
  groups: WorkbenchGroup[];
  teachers: WorkbenchTeacher[];
  rooms: WorkbenchRoom[];
  context: EngineContext;
  onChange: (report: ChangeReport) => void;
  onClose: () => void;
  headingId: string;
}) {
  const existing = mode.kind === "edit" ? meetings.find((m) => m.id === mode.meetingId) ?? null : null;
  const batchGroups = mode.kind === "new"
    ? groups.filter((g) => g.template.audiences.some((a) => a.batchId === mode.batchId) && g.template.deliveryMode !== "teacher_managed")
      .sort((a, b) => Number(b.coverage.status !== "scheduled") - Number(a.coverage.status !== "scheduled") || a.template.courseCode.localeCompare(b.template.courseCode))
    : [];
  const [groupId, setGroupId] = useState<number | null>(mode.kind === "new" ? mode.groupId ?? null : existing?.teachingGroupId ?? null);
  const group = groups.find((g) => g.template.teachingGroupId === groupId) ?? null;
  const initial: Placement = existing ? placementOf(existing) : {
    dayOfWeek: 0, startMinutes: mode.kind === "new" ? mode.start : 0, endMinutes: mode.kind === "new" ? mode.end : 0,
    teacherIds: group?.teacherIds ?? [], roomIds: [], isException: false, exceptionNote: null,
  };
  const [day, setDay] = useState(existing?.dayOfWeek ?? (mode.kind === "new" ? mode.day : 0));
  const [start, setStart] = useState(toClock(initial.startMinutes));
  const [end, setEnd] = useState(toClock(initial.endMinutes));
  const [teacherIds, setTeacherIds] = useState(initial.teacherIds);
  const [roomIds, setRoomIds] = useState(initial.roomIds);
  const [isException, setIsException] = useState(initial.isException);
  const [exceptionNote, setExceptionNote] = useState(initial.exceptionNote ?? "");
  const [serverResult, setServerResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [ask, confirmDialog] = useConfirm();

  const startMinutes = fromClock(start);
  const endMinutes = fromClock(end);
  const timesValid = startMinutes != null && endMinutes != null && endMinutes > startMinutes;
  const placement: Placement = {
    dayOfWeek: day, startMinutes: startMinutes ?? 0, endMinutes: endMinutes ?? 0, teacherIds, roomIds,
    isException, exceptionNote: exceptionNote.trim() || null,
  };
  const base = existing ?? group?.template ?? null;
  const candidate = base && timesValid ? candidateMeeting(base, placement, teachers, rooms) : null;
  const issues = candidate && teacherIds.length && roomIds.length ? precheck(candidate, context) : [];
  const blockers = issues.filter((i) => i.severity === "blocker");
  const warnings = issues.filter((i) => i.severity === "warning");
  const exceptId = existing?.id ?? -1;
  const size = base ? knownAudienceSize(base) : null;

  // TCH-01: inactive teachers are offered only where they are already assigned.
  const teacherOptions = teachers.filter((t) => t.status !== "inactive" || initial.teacherIds.includes(t.id)).map((t) => ({
    id: t.id, code: t.shortCode, label: `${t.fullName}${t.homeDepartmentCode && t.homeDepartmentCode !== "CSE" ? ` (${t.homeDepartmentCode})` : ""}${t.status === "on_leave" ? " · on leave" : t.status === "inactive" ? " · inactive" : ""}`,
    availability: timesValid ? teacherAvailability(t.id, day, placement.startMinutes, placement.endMinutes, context, exceptId) : { state: "free" as const },
  }));
  const roomChoices = base ? suitableRooms(rooms, base.requiredRoomCapability, base.courseType) : rooms;
  const roomOptions = roomChoices.map((r) => ({
    id: r.id, code: r.code, label: `${r.roomType}${r.capacity ? ` · ${r.capacity} seats` : ""}${r.owningDepartmentCode && r.owningDepartmentCode !== "CSE" ? ` · ${r.owningDepartmentCode}` : ""}`,
    availability: timesValid ? roomAvailability(r, day, placement.startMinutes, placement.endMinutes, context, exceptId, size) : { state: "free" as const },
  }));

  const changed = existing ? JSON.stringify(placementOf(existing)) !== JSON.stringify(placement) : true;
  const canSave = !!base && timesValid && teacherIds.length > 0 && roomIds.length > 0 && blockers.length === 0 && changed
    && (!isException || !!exceptionNote.trim()) && !pending;

  // Keyboard/screen-reader alternative to drag and drop: every free slot this class could move to.
  const moveTargets = (() => {
    if (!existing) return [];
    const duration = existing.endMinutes - existing.startMinutes;
    // The class's own batches decide the days and periods offered (a batch may have its own).
    return daysFor(grid, existing.audiences).flatMap((d) => periodsFor(grid, existing.audiences, d).map((slot) => ({ day: d, start: slot.start, end: slot.start + duration })))
      .filter((t) => !(t.day === existing.dayOfWeek && t.start === existing.startMinutes))
      .filter((t) => !precheck(candidateMeeting(existing, { ...placementOf(existing), dayOfWeek: t.day, startMinutes: t.start, endMinutes: t.end }, teachers, rooms), context)
        .some((i) => i.severity === "blocker"));
  })();

  function run(action: () => Promise<ActionResult>, undo?: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      setServerResult(result.ok ? null : result);
      if (result.ok) onChange({ result, undo });
    });
  }

  function save() {
    if (!canSave || !base) return;
    if (existing) {
      const previous = placementOf(existing);
      run(() => updateMeetingAction(existing.id, placement), () => updateMeetingAction(existing.id, previous));
    } else if (group) {
      run(() => createMeetingAction(placementForm(group.template.teachingGroupId, placement)));
    }
  }

  const audience = base ? base.audiences.map((a) => batchName(a.stream, a.batchLabel)).join(" + ") + (base.externalAudienceLabel ? ` + ${base.externalAudienceLabel}` : "") : "";

  return (
    <div className="p-4">
      {confirmDialog}
      <h2 id={headingId} className="font-display text-[17px] font-semibold leading-snug">
        {existing ? `${existing.courseCode} · ${existing.courseTitle}` : group ? `New class · ${group.template.courseCode}` : "New class"}
      </h2>
      <p className="mt-0.5 text-[12.5px] text-muted">
        {audience || (mode.kind === "new" ? "Choose the teaching group first" : "")}
        {existing ? ` · ${DAY_NAMES[existing.dayOfWeek]} · ${fmtRange(existing.startMinutes, existing.endMinutes)}` : ""}
      </p>

      {mode.kind === "new" ? (
        <div className="mt-3">
          <label htmlFor="panel-group" className="mb-1 block text-[12.5px] font-medium text-ink-2">Teaching group</label>
          <select id="panel-group" value={groupId ?? ""} onChange={(event) => {
            const next = groups.find((g) => g.template.teachingGroupId === Number(event.target.value));
            setGroupId(next?.template.teachingGroupId ?? null);
            setTeacherIds(next?.teacherIds ?? []);
            setRoomIds([]);
          }} className="min-h-9 w-full rounded-md border border-[var(--color-line)] bg-white px-2 text-[13px]">
            <option value="" disabled>Select a course and batch…</option>
            {batchGroups.map((g) => (
              <option key={g.template.teachingGroupId} value={g.template.teachingGroupId}>
                {g.template.courseCode} · {g.template.courseTitle} — {g.coverage.audience}
                {g.coverage.status === "scheduled" ? "" : g.coverage.status === "vacancy" ? " (no teacher yet)" : ` (${g.coverage.scheduledMinutes} of ${g.coverage.expectedWeeklyMinutes ?? "?"} min placed)`}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {existing && issues.length && !changed ? <IssueList issues={issues} /> : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label htmlFor="panel-day" className="mb-1 block text-[12.5px] font-medium text-ink-2">Day</label>
          <select id="panel-day" value={day} onChange={(event) => setDay(Number(event.target.value))} className="min-h-9 w-full rounded-md border border-[var(--color-line)] bg-white px-2 text-[13px]">
            {DAY_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="panel-start" className="mb-1 block text-[12.5px] font-medium text-ink-2">Starts</label>
          <input id="panel-start" type="time" value={start} onChange={(event) => setStart(event.target.value)} className="min-h-9 w-full rounded-md border border-[var(--color-line)] bg-white px-2 font-mono text-[13px]" />
        </div>
        <div>
          <label htmlFor="panel-end" className="mb-1 block text-[12.5px] font-medium text-ink-2">Ends</label>
          <input id="panel-end" type="time" value={end} onChange={(event) => setEnd(event.target.value)} className="min-h-9 w-full rounded-md border border-[var(--color-line)] bg-white px-2 font-mono text-[13px]" />
        </div>
      </div>
      {!timesValid ? <p className="mt-1 text-[12.5px] text-[var(--color-clay)]">The end time must be after the start time.</p> : null}

      <div className="mt-3 space-y-3">
        <AvailabilityPicker label="Teachers" options={teacherOptions} selected={teacherIds} onChange={setTeacherIds}
          placeholder="Search by code or name" emptyText="No matching teacher" />
        <AvailabilityPicker label={base && suitableRooms(rooms, base.requiredRoomCapability, base.courseType).length !== rooms.length ? "Room (suitable rooms only)" : "Room"}
          options={roomOptions} selected={roomIds} onChange={setRoomIds} placeholder="Search rooms" emptyText="No matching room" />
      </div>

      <div className="mt-3 rounded-md border border-[var(--color-line)] bg-wash p-2.5">
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" checked={isException} onChange={(event) => setIsException(event.target.checked)} className="mt-1 accent-[var(--color-pine)]" />
          <span>Approved exception to the class days or times (for example an HSC Friday class)</span>
        </label>
        {isException ? (
          <div className="mt-2">
            <label htmlFor="panel-note" className="mb-1 block text-[12.5px] font-medium text-ink-2">Approval note</label>
            <input id="panel-note" value={exceptionNote} onChange={(event) => setExceptionNote(event.target.value)} placeholder="Who approved it, and when"
              className="min-h-9 w-full rounded-md border border-[var(--color-line)] bg-white px-2 text-[13px]" />
          </div>
        ) : null}
      </div>

      {candidate && teacherIds.length && roomIds.length && changed ? (
        blockers.length ? <IssueList issues={issues} prefix="This change would cause" /> : (
          <div role="status" className="mt-3 flex items-start gap-2 rounded-md bg-pine-tint px-3 py-2 text-[13px] text-[var(--color-pine)]">
            <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>No clashes{warnings.length ? `, ${warnings.length} warning${warnings.length === 1 ? "" : "s"} to note` : ""}. Saving checks again on the server.</span>
          </div>
        )
      ) : null}

      {serverResult ? <IssueList issues={serverResult.issues ?? []} prefix={serverResult.message} /> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" disabled={!canSave} onClick={save}
          className="min-h-9 rounded-md bg-[var(--color-pine)] px-4 text-[13.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">
          {pending ? "Checking and saving…" : existing ? "Save changes" : "Add class"}
        </button>
        <button type="button" onClick={onClose} className="min-h-9 rounded-md border border-[var(--color-line)] bg-sheet px-4 text-[13.5px] font-medium">
          {existing && !changed ? "Close" : "Cancel"}
        </button>
        {existing ? (
          <button type="button" disabled={pending} onClick={async () => {
            if (!await ask({ title: `Delete ${existing.courseCode} on ${DAY_NAMES[existing.dayOfWeek]}?`, body: "This class is removed from the working draft for every stream, teacher and room view. The published routine is not affected. You can undo this straight after.", confirmLabel: "Delete class" })) return;
            run(() => deleteMeetingAction(existing.id), recreate(existing));
          }} className="ml-auto min-h-9 px-1 text-[13.5px] font-medium text-[var(--color-clay)] underline-offset-2 hover:underline">
            Delete class
          </button>
        ) : null}
      </div>

      {existing ? (
        <section aria-labelledby="move-heading" className="mt-5 border-t border-[var(--color-line-soft)] pt-3">
          <h3 id="move-heading" className="text-[13px] font-semibold">Move to a free time</h3>
          <p className="mt-0.5 text-[12.5px] text-muted">Same teachers, rooms and length. You can also drag the class on the grid.</p>
          {moveTargets.length === 0 ? <p className="mt-2 text-[12.5px] text-ink-2">No free slot this week for the same teachers and rooms. Change the room or teacher above.</p> : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {moveTargets.slice(0, 18).map((target) => (
                <li key={`${target.day}-${target.start}`}>
                  <button type="button" disabled={pending} onClick={() => {
                    const back = { day: existing.dayOfWeek, start: existing.startMinutes, end: existing.endMinutes };
                    run(() => moveMeetingAction(existing.id, target.day, target.start, target.end), () => moveMeetingAction(existing.id, back.day, back.start, back.end));
                  }} className="rounded-md border border-[var(--color-line)] bg-white px-2 py-1 text-[12.5px] hover:border-[var(--color-pine)] hover:bg-pine-tint">
                    <span className="font-semibold">{DAY_SHORT[target.day]}</span> <span className="font-mono">{fmtRange(target.start, target.end)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function IssueList({ issues, prefix }: { issues: Array<{ severity: string; title: string; detail: string }>; prefix?: string }) {
  const list = issues;
  const blocking = list.some((i) => i.severity === "blocker");
  return (
    <div role={blocking ? "alert" : "status"} className={`mt-3 rounded-md border px-3 py-2 text-[13px] ${blocking ? "border-[var(--color-clay)]/35 bg-clay-tint text-[var(--color-clay)]" : "border-[var(--color-gold)]/40 bg-gold-tint text-gold-text"}`}>
      {prefix ? <p className="font-semibold">{prefix}{list.length && !prefix.endsWith(".") ? ":" : ""}</p> : null}
      <ul className="mt-0.5 space-y-1">
        {list.map((issue, index) => (
          <li key={index} className="flex items-start gap-1.5">
            {issue.severity === "blocker" ? <XCircle size={14} aria-hidden="true" className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />}
            <span><span className="font-semibold">{issue.title}.</span> <span className={blocking ? "text-[#7c2a17]" : ""}>{issue.detail}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
