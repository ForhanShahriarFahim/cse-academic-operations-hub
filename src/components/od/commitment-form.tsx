"use client";

/** OD-01A D-2: one guided form for create, edit and resolve, with a live impact preview. */
import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTermActions } from "@/components/term-write-context";
import { Notice } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import {
  COMMITMENT_CHOICES, blocksText, commitmentClashes, completenessLadder, completenessLevel, meetingCoversCommitment, parseCommitmentDates, usesRoom, usesTeacher,
  type ClashMeeting, type CommitmentKind, type LinkMeeting,
} from "@/lib/commitment-records";
import { DAY_NAMES, fmtRange, parseTimeToMinutes } from "@/lib/time";

export interface CommitmentFormValues {
  kind: CommitmentKind | ""; counterpartDepartment: string; teacherId: string; roomId: string; dayOfWeek: string;
  startTime: string; endTime: string; courseLabel: string; audienceLabel: string; credits: string; notes: string;
  effectiveFrom: string; effectiveTo: string;
}
interface Props {
  mode: "create" | "edit" | "resolve";
  id?: number;
  revision?: number;
  linkedTeachingGroupId?: number | null;
  verified?: boolean;
  initial: CommitmentFormValues;
  teachers: Array<{ id: number; shortCode: string; fullName: string; homeDepartmentCode: string | null }>;
  rooms: Array<{ id: number; code: string }>;
  meetings: Array<ClashMeeting & LinkMeeting>;
  bounds: { termStart: string; termEnd: string };
  returnTo: string;
}

const input = "w-full rounded-md border bg-white px-2.5 py-2 text-[13.5px] min-h-[2.75rem]";
const LEVEL_TONE: Record<string, string> = { A: "border-[var(--color-pine)] text-[var(--color-pine)]", B: "border-[var(--color-moss)] text-[var(--color-pine)]", C: "border-[var(--color-gold)] text-gold-text", D: "border-[var(--color-clay)] text-[var(--color-clay)]" };

export function CommitmentForm({ mode, id, revision, linkedTeachingGroupId, verified, initial, teachers, rooms, meetings, bounds, returnTo }: Props) {
  const actions = useTermActions();
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const summary = useRef<HTMLDivElement>(null);
  const set = (field: keyof CommitmentFormValues) => (event: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: event.target.value }));
  const fieldErrors = result?.outcome?.kind === "validation" ? result.outcome.fieldErrors : {};
  const error = (field: string) => fieldErrors[field]?.[0];
  const kind = values.kind;
  const choices = mode === "resolve" ? COMMITMENT_CHOICES.filter((c) => c.kind !== "unresolved_note") : COMMITMENT_CHOICES;

  const impact = useMemo(() => {
    if (!kind) return null;
    const teacherId = usesTeacher(kind) && values.teacherId ? Number(values.teacherId) : null;
    const roomId = usesRoom(kind) && values.roomId ? Number(values.roomId) : null;
    const structured = kind !== "unresolved_note";
    const start = structured && values.startTime ? parseTimeToMinutes(values.startTime) : null;
    const end = structured && values.endTime ? parseTimeToMinutes(values.endTime) : null;
    const timed = structured && /^[0-6]$/.test(values.dayOfWeek) && start != null && end != null && end > start;
    const subject = { kind, teacherId, roomId, dayOfWeek: timed ? Number(values.dayOfWeek) : null, startMinutes: timed ? start : null, endMinutes: timed ? end : null };
    const facts = { kind, teacherId, roomId, courseLabel: values.courseLabel.trim() || null, credits: usesTeacher(kind) ? values.credits.trim() || null : null };
    const teacher = teachers.find((t) => t.id === teacherId)?.shortCode ?? null;
    const room = rooms.find((r) => r.id === roomId)?.code ?? null;
    const { dates, errors } = parseCommitmentDates(structured ? values : {}, subject.dayOfWeek, bounds);
    const datesInvalid = Object.keys(errors).length > 0;
    const booking = { ...subject, ...dates };
    const covered = linkedTeachingGroupId != null && !datesInvalid && meetings.some((meeting) => meeting.teachingGroupId === linkedTeachingGroupId && meetingCoversCommitment(booking, meeting, bounds));
    return {
      blocks: blocksText(subject, { teacher, room }),
      when: timed ? `${DAY_NAMES[subject.dayOfWeek!]} ${fmtRange(subject.startMinutes!, subject.endMinutes!)}${!datesInvalid && dates.effectiveFrom ? ` · ${dates.effectiveFrom} through ${dates.effectiveTo}` : ""}` : null,
      level: completenessLevel(facts), ladder: completenessLadder(facts), clashes: datesInvalid || covered ? [] : commitmentClashes(booking, meetings, bounds), datesInvalid, covered,
    };
  }, [kind, values, teachers, rooms, meetings, bounds, linkedTeachingGroupId]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const r = mode === "create" ? await actions.createExternalAction(form) : await actions.editExternalAction(id!, form);
      setResult(r);
      if (r.ok) {
        const joiner = returnTo.includes("?") ? "&" : "?";
        const notice = mode === "create" ? "created" : mode === "resolve" ? "resolved" : /returned to Pending/.test(r.message) ? "returned-edit" : "updated";
        router.push(`${returnTo}${joiner}changed=${mode === "create" ? r.outcome?.kind === "success" ? r.outcome.entityId ?? "" : "" : id}&notice=${notice}`);
      } else requestAnimationFrame(() => summary.current?.focus());
    });
  }

  const label = "mb-1 block text-[12.5px] font-semibold text-ink-2";
  const describe = (field: string) => (error(field) ? { "aria-invalid": true, "aria-describedby": `od-${field}-error` } : {});
  const errorText = (field: string) => error(field) ? <p id={`od-${field}-error`} className="mt-1 text-[12px] font-semibold text-[var(--color-clay)]">{error(field)}</p> : null;
  const border = (field: string) => (error(field) ? "border-[var(--color-clay)] border-2" : "border-[var(--color-line)]");

  const preview = impact ? (
    <aside aria-labelledby="od-impact-title" className="rounded-lg border border-[var(--color-line)] bg-wash p-4">
      <h2 id="od-impact-title" className="font-display text-[16px] font-semibold">Impact preview</h2>
      <div aria-live="polite" className="mt-2 space-y-2 text-[13px] leading-relaxed">
        {impact.covered ? <p>The formal teaching group covers this booking.</p> : <p><span className="font-semibold">Will block: </span>{impact.blocks}{impact.when && !impact.blocks.startsWith("Nothing") ? ` on ${impact.when}` : ""}.</p>}
        {linkedTeachingGroupId != null && !impact.covered && !impact.datesInvalid && <p>The teaching group link will need review before publication.</p>}
        <div>
          <p className="font-semibold">Completeness <span className={`ml-1 inline-block rounded-full border px-2 text-[11.5px] ${LEVEL_TONE[impact.level]}`}>{impact.level}</span></p>
          <ul className="mt-1 space-y-0.5" aria-label="Facts that set the level">
            {impact.ladder.map((item) => (
              <li key={item.label} className={item.known ? "text-ink-2" : "text-muted"}>
                <span aria-hidden="true">{item.known ? "● " : "○ "}</span>{item.label}<span className="sr-only">{item.known ? ": known" : ": not known"}</span>
                {!item.known && impact.level !== "D" ? <span className="text-muted"> — add to raise the level</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[12px] text-muted">Completeness says how much is known. Verification is separate.</p>
        </div>
        <div>
          <p className="font-semibold">Clashes in the working draft ({impact.clashes.length})</p>
          {impact.clashes.length ? (
            <ul className="mt-1 list-disc pl-5">
              {impact.clashes.map((c) => <li key={`${c.on}-${c.meetingId}`}>{c.meeting.courseCode}{c.meeting.audience ? ` · ${c.meeting.audience}` : ""} · {fmtRange(c.meeting.startMinutes, c.meeting.endMinutes)} · {c.on === "teacher" ? `teacher ${c.code}` : `room ${c.code}`}</li>)}
            </ul>
          ) : <p className="text-muted">{impact.datesInvalid ? "Enter valid effective dates to check for clashes." : "None found."}</p>}
          {impact.clashes.length ? <p className="mt-1 text-[12px] text-muted">Saving is allowed. The clash then appears in the routine&apos;s conflict list as a blocker.</p> : null}
        </div>
      </div>
    </aside>
  ) : (
    <aside className="rounded-lg border border-dashed border-[var(--color-line)] bg-wash p-4 text-[13px] text-muted">Choose what is committed to see what it will block.</aside>
  );

  return (
    <form onSubmit={submit} noValidate aria-label="Commitment details" className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-x-6">
      {revision != null ? <input type="hidden" name="revision" value={revision} /> : null}
      <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
        {mode === "edit" && verified ? <Notice tone="warn">This commitment is verified. Changing what is committed, the teacher, the room, the day, the time or the effective dates returns it to Pending.</Notice> : null}
        {mode === "resolve" ? <Notice tone="info">Choose what this note turned out to be and enter the facts. The original note text is kept in the notes and in history. The result starts as Pending.</Notice> : null}
        {result && !result.ok ? (
          <div ref={summary} tabIndex={-1}>
            <Notice tone="error" title={result.outcome?.kind === "validation" && Object.keys(fieldErrors).length > 1 ? "Check the highlighted fields" : undefined}>
              <p>{result.message}</p>
              {result.issues?.map((issue, i) => <p key={i} className="mt-1">{issue.detail}</p>)}
              {result.outcome?.kind === "stale" ? <button type="button" className="mt-1 font-semibold underline" onClick={() => router.refresh()}>Reload the current version (your entries stay in the form)</button> : null}
            </Notice>
          </div>
        ) : null}
        <fieldset className="rounded-lg border border-[var(--color-line)] bg-sheet p-3" {...(error("kind") ? { "aria-describedby": "od-kind-error" } : {})}>
          <legend className="px-1 text-[13.5px] font-semibold">What is committed?</legend>
          <div className="grid gap-1">
            {choices.map((choice) => (
              <label key={choice.kind} className={`grid cursor-pointer grid-cols-[1.4rem_1fr] gap-x-2 rounded-md px-2 py-2 ${kind === choice.kind ? "bg-pine-tint outline outline-1 outline-[var(--color-pine)]" : "hover:bg-wash"}`}>
                <input type="radio" name="kind" value={choice.kind} checked={kind === choice.kind} onChange={set("kind")} className="mt-1 h-4 w-4 accent-[var(--color-pine)]" />
                <span className="text-[13.5px] font-medium">{choice.label}</span>
                <span className="col-start-2 text-[12.5px] text-muted">{choice.help}</span>
              </label>
            ))}
          </div>
          {errorText("kind")}
        </fieldset>
      </div>
      <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:sticky lg:top-4">{preview}</div>
      <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2">
        {kind ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="od-counterpartDepartment" className={label}>Other department *</label>
              <input id="od-counterpartDepartment" name="counterpartDepartment" value={values.counterpartDepartment} onChange={set("counterpartDepartment")} placeholder="e.g. Mathematics" className={`${input} ${border("counterpartDepartment")}`} {...describe("counterpartDepartment")} />
              {errorText("counterpartDepartment")}
            </div>
            {usesTeacher(kind) ? (
              <div>
                <label htmlFor="od-teacherId" className={label}>Teacher *</label>
                <select id="od-teacherId" name="teacherId" value={values.teacherId} onChange={set("teacherId")} className={`${input} ${border("teacherId")}`} {...describe("teacherId")}>
                  <option value="">Choose a teacher</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.shortCode} · {t.fullName}{t.homeDepartmentCode && t.homeDepartmentCode !== "CSE" ? ` (${t.homeDepartmentCode})` : ""}</option>)}
                </select>
                {errorText("teacherId")}
              </div>
            ) : null}
            {usesRoom(kind) ? (
              <div>
                <label htmlFor="od-roomId" className={label}>Room *</label>
                <select id="od-roomId" name="roomId" value={values.roomId} onChange={set("roomId")} className={`${input} ${border("roomId")}`} {...describe("roomId")}>
                  <option value="">Choose a room</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
                </select>
                {errorText("roomId")}
              </div>
            ) : null}
            {kind !== "unresolved_note" ? (
              <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-3">
                <div>
                  <label htmlFor="od-dayOfWeek" className={label}>Day *</label>
                  <select id="od-dayOfWeek" name="dayOfWeek" value={values.dayOfWeek} onChange={set("dayOfWeek")} className={`${input} ${border("dayOfWeek")}`} {...describe("dayOfWeek")}>
                    <option value="">Choose a day</option>
                    {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                  {errorText("dayOfWeek")}
                </div>
                <div>
                  <label htmlFor="od-startTime" className={label}>Start *</label>
                  <input id="od-startTime" name="startTime" type="time" value={values.startTime} onChange={set("startTime")} className={`${input} font-mono ${border("startTime")}`} {...describe("startTime")} />
                  {errorText("startTime")}
                </div>
                <div>
                  <label htmlFor="od-endTime" className={label}>End *</label>
                  <input id="od-endTime" name="endTime" type="time" value={values.endTime} onChange={set("endTime")} className={`${input} font-mono ${border("endTime")}`} {...describe("endTime")} />
                  {errorText("endTime")}
                </div>
                <fieldset className="sm:col-span-2">
                  <legend className={label}>Effective dates</legend>
                  <p id="od-date-help" className="mb-2 text-xs text-muted">Leave both blank for the whole term. Both dates are inclusive.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([['effectiveFrom', 'From'], ['effectiveTo', 'Through']] as const).map(([field, title]) => <div key={field} className="min-w-0">
                      <label htmlFor={`od-${field}`} className={label}>{title}</label>
                      <input id={`od-${field}`} name={field} type="date" min={bounds.termStart} max={bounds.termEnd} value={values[field]} onChange={set(field)} className={`${input} ${border(field)}`} aria-describedby="od-date-help" {...describe(field)} />
                      {errorText(field)}
                    </div>)}
                  </div>
                </fieldset>
              </div>
            ) : null}
            <div>
              <label htmlFor="od-courseLabel" className={label}>Course</label>
              <input id="od-courseLabel" name="courseLabel" value={values.courseLabel} onChange={set("courseLabel")} placeholder="e.g. MAT-2201" className={`${input} ${border("courseLabel")}`} {...describe("courseLabel")} />
              {errorText("courseLabel")}
            </div>
            <div>
              <label htmlFor="od-audienceLabel" className={label}>Audience</label>
              <input id="od-audienceLabel" name="audienceLabel" value={values.audienceLabel} onChange={set("audienceLabel")} placeholder="e.g. MATH 2nd year" className={`${input} ${border("audienceLabel")}`} {...describe("audienceLabel")} />
              {errorText("audienceLabel")}
            </div>
            {usesTeacher(kind) ? (
              <div>
                <label htmlFor="od-credits" className={label}>Credits</label>
                <input id="od-credits" name="credits" inputMode="decimal" value={values.credits} onChange={set("credits")} placeholder="e.g. 3.0" className={`${input} font-mono ${border("credits")}`} {...describe("credits")} />
                {errorText("credits")}
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <label htmlFor="od-notes" className={label}>{kind === "unresolved_note" ? "Note *" : "Notes and source"}</label>
              <textarea id="od-notes" name="notes" rows={3} value={values.notes} onChange={set("notes")} placeholder={kind === "unresolved_note" ? "What is known, and what is still unconfirmed?" : "How was this learned?"} className={`${input} ${border("notes")}`} {...describe("notes")} />
              {errorText("notes")}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--color-line-soft)] pt-3">
          <Link href={returnTo} className="rounded-md px-3 py-2 text-[13px] font-semibold text-muted underline-offset-2 hover:underline">Cancel</Link>
          <button disabled={pending || !kind} className="min-h-[2.75rem] rounded-md bg-[var(--color-pine)] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[var(--color-pine-2)] disabled:opacity-50">
            {pending ? "Saving…" : mode === "create" ? "Record commitment (starts Pending)" : mode === "resolve" ? "Resolve note" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
