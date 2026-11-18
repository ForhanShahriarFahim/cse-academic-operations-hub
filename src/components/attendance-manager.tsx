"use client";

import { useTermActions } from "@/components/term-write-context";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckCheck, Pencil, Plus, Save, Trash2, UserMinus } from "lucide-react";
import type { ActionResult } from "@/lib/actions";

import type { AttendanceStatus, RosterImportReceipt } from "@/lib/attendance";
import { fmtRange } from "@/lib/time";
import { useConfirm } from "@/components/confirm-dialog";

interface Group { id: number; courseCode: string; courseTitle: string; courseType: string; audience: string; teacherIds: number[] }
interface Teacher { id: number; shortCode: string; fullName: string }
interface StudentRow {
  id: number; studentCode: string; fullName: string; phone: string | null; homeDepartmentLabel: string | null;
  enrollment: { audienceType: string };
}
interface SessionRow {
  id: number; classDate: string; phase: string; startMinutes: number | null; endMinutes: number | null;
  records: Array<{ studentId: number; status: string }>;
}
interface SummaryRow {
  studentId: number;
  midterm: { attended: number; total: number };
  final: { attended: number; total: number };
  semester: { attended: number; total: number; percentage: number };
  mark: number; maximum: number;
}

const control = "w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 py-2 text-[12.5px]";

type FeedbackArea = "student" | "import" | "create" | "marks" | "delete" | "roster";
type FeedbackResult = ActionResult & { receipt?: RosterImportReceipt };
type FileRead = { status: "idle" | "reading" } | { status: "ready"; text: string };
const labels: Record<FeedbackArea, string> = {
  student: "Saving student…", import: "Importing roster…", create: "Creating session…",
  marks: "Saving attendance…", delete: "Deleting session…", roster: "Removing enrollment…",
};

function AttendanceFeedback({ area, result, pending, reading }: { area: FeedbackArea; result?: FeedbackResult; pending: boolean; reading?: boolean }) {
  const receipt = result?.receipt;
  const counts = receipt
    ? `${receipt.created} created · ${receipt.updated} updated · ${receipt.unchanged} unchanged · ${receipt.skipped} skipped · ${receipt.failed} failed`
    : "";
  return <div data-feedback={area} className="min-w-0 px-4 empty:p-0">
    <div id={`attendance-${area}-result`} role="status" aria-atomic="true" tabIndex={-1}
      className={pending || result ? `mb-3 rounded-md border px-3 py-2 text-sm outline-offset-2 ${result && !result.ok ? "border-[var(--color-gold)] bg-gold-tint" : "border-[var(--color-line)] bg-wash"}` : ""}>
      {pending ? (reading ? "Reading CSV…" : labels[area]) : result && <><p>{result.message}</p>{counts && <p className="mt-1 font-medium">{counts}</p>}</>}
    </div>
    {!pending && !!receipt?.issues.length && <div className="mb-3 break-words text-sm">
      <ul className="list-disc space-y-1 pl-5">{receipt.issues.map(issue => <li key={issue.row}>
        Line {issue.row} · {issue.kind === "skipped" ? "Skipped" : "Failed"} · {issue.message}
      </li>)}</ul>
      <p className="mt-2">Correct the CSV and import a new file with the rows you want to submit again.</p>
    </div>}
  </div>;
}

export function AttendanceManager({ groups, selectedGroup, teachers, roster, sessions, summaries, termStart, termEnd, canManageRosters, canTakeAttendance }: {
  groups: Group[];
  selectedGroup: Group;
  teachers: Teacher[];
  roster: StudentRow[];
  sessions: SessionRow[];
  summaries: SummaryRow[];
  termStart: string;
  termEnd: string;
  canManageRosters: boolean;
  canTakeAttendance: boolean;
}) {
  const { createAttendanceSessionAction, deactivateStudentAction, deleteAttendanceSessionAction, importStudentCsvAction, saveAttendanceAction, upsertStudentAction } = useTermActions();
  const [ask, confirmDialog] = useConfirm();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<Partial<Record<FeedbackArea, FeedbackResult>>>({});
  const [pendingArea, setPendingArea] = useState<FeedbackArea | null>(null);
  const submitting = useRef(false);
  const manager = useRef<HTMLDivElement>(null);
  const focusRequest = useRef<{ area: FeedbackArea; trigger: HTMLElement | null; field?: HTMLElement | null; success: boolean } | null>(null);
  const [activeSessionId, setActiveSessionId] = useState(sessions.at(-1)?.id ?? 0);
  const effectiveSessionId = sessions.some((session) => session.id === activeSessionId)
    ? activeSessionId
    : sessions.at(-1)?.id ?? 0;
  const activeSession = sessions.find((session) => session.id === effectiveSessionId) ?? null;
  const [statusOverrides, setStatusOverrides] = useState<Record<string, AttendanceStatus>>({});
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [fileRead, setFileRead] = useState<FileRead>({ status: "idle" });
  const readVersion = useRef(0);
  const picker = useRef<HTMLInputElement>(null);
  const studentForm = useRef<HTMLFormElement>(null);
  const sessionForm = useRef<HTMLFormElement>(null);
  const groupTeachers = teachers.filter((teacher) => selectedGroup.teacherIds.includes(teacher.id));
  const summaryByStudent = useMemo(() => new Map(summaries.map((row) => [row.studentId, row])), [summaries]);

  const capturedIds = new Set(activeSession?.records.map((record) => record.studentId));
  const sessionRoster = roster.filter((student) => capturedIds.has(student.id));

  function statusFor(studentId: number): AttendanceStatus {
    const record = activeSession?.records.find((record) => record.studentId === studentId);
    if (!record) throw new Error("Student is not captured in this attendance session.");
    return statusOverrides[`${effectiveSessionId}:${studentId}`] ?? record.status as AttendanceStatus;
  }

  function selectSession(id: number) {
    if (id === effectiveSessionId) return;
    setResults(current => ({ ...current, marks: undefined, delete: undefined }));
    setActiveSessionId(id);
  }

  useEffect(() => {
    const request = focusRequest.current;
    if (!request || pending) return;
    focusRequest.current = null;
    const active = document.activeElement;
    if (active !== document.body && active !== request.trigger) return;
    const summary = manager.current?.querySelector<HTMLElement>(`[data-feedback="${request.area}"] [role="status"]`);
    const trigger = request.trigger?.isConnected && !request.trigger.matches(":disabled") ? request.trigger : null;
    (request.success ? trigger ?? summary : request.field ?? summary)?.focus();
  }, [pending, results]);

  function run(area: FeedbackArea, action: () => Promise<FeedbackResult>, onSuccess?: () => void) {
    if (submitting.current) return;
    submitting.current = true;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPendingArea(area);
    setResults(current => ({ ...current, [area]: undefined }));
    startTransition(async () => {
      let response: FeedbackResult;
      try {
        response = await action();
      } catch {
        response = { ok: false, message: "The result could not be confirmed. Check the latest attendance or roster before trying again." };
      }
      if (response.ok) onSuccess?.();
      const name = response.outcome?.kind === "validation" ? Object.keys(response.outcome.fieldErrors)[0] : undefined;
      const form = area === "student" ? studentForm.current : area === "create" ? sessionForm.current : null;
      const field = name ? (area === "import" ? picker.current : form?.elements.namedItem(name)) : null;
      focusRequest.current = { area, trigger, field: field instanceof HTMLElement ? field : null, success: response.ok };
      setResults(current => ({ ...current, [area]: response }));
      setPendingArea(null);
      submitting.current = false;
    });
  }

  async function readFile(file: File | undefined) {
    const version = ++readVersion.current;
    setResults(current => ({ ...current, import: undefined }));
    setFileRead({ status: file ? "reading" : "idle" });
    if (!file) return;
    try {
      const text = await file.text();
      if (version === readVersion.current) setFileRead({ status: "ready", text });
    } catch {
      if (version !== readVersion.current) return;
      setFileRead({ status: "idle" });
      setResults(current => ({ ...current, import: { ok: false, message: "The file could not be read. Choose the CSV file again." } }));
    }
  }

  function feedback(area: FeedbackArea) {
    return <AttendanceFeedback area={area} result={results[area]} pending={pendingArea === area || (area === "import" && fileRead.status === "reading")} reading={area === "import" && fileRead.status === "reading"} />;
  }

  function fieldFeedback(area: FeedbackArea, name: string) {
    const outcome = results[area]?.outcome;
    return outcome?.kind === "validation" && outcome.fieldErrors[name]?.length
      ? { "aria-invalid": true, "aria-describedby": `attendance-${area}-result` } : {};
  }

  return <div ref={manager} className="space-y-4">{confirmDialog}
    <section className="ruled rounded-lg p-4">
      <div className="grid items-end gap-3 lg:grid-cols-[1fr_auto]">
        <label><span className="micro-label mb-1 block">Course / teaching group</span>
          <select value={selectedGroup.id} onChange={(event) => router.push(`/attendance?group=${event.target.value}`)} className={control}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.courseCode} · {group.audience} · {group.courseTitle}</option>)}
          </select>
        </label>
        <span className="rounded-md border border-[var(--color-line)] bg-wash px-3 py-2 text-[12px]"><strong>{selectedGroup.courseType === "sessional" ? "Lab / sessional" : "Theory"}</strong> · {summaries[0]?.maximum ?? (selectedGroup.courseType === "sessional" ? 5 : 10)} attendance marks</span>
      </div>
    </section>

    {canManageRosters && <div className="grid gap-4 xl:grid-cols-2">
      <section className="ruled rounded-lg">
        <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">{editing ? "Edit student" : "Add one student"}</h2><p className="mt-0.5 text-[11.5px] text-muted">Home department is descriptive; enrollment in this teaching group is independent.</p></header>
        <form key={editing?.id ?? "new"} ref={studentForm} className="grid grid-cols-2 gap-2 p-4" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); run("student", () => upsertStudentAction(data), () => { form.reset(); setEditing(null); }); }}><fieldset className="contents" disabled={pendingArea === "student"}>
          <input type="hidden" name="teachingGroupId" value={selectedGroup.id} />
          <input type="hidden" name="studentId" value={editing?.id ?? ""} />
          <label><span className="micro-label mb-1 block">Student ID</span><input name="studentCode" {...fieldFeedback("student", "studentCode")} defaultValue={editing?.studentCode} placeholder="e.g. 03226…" className={control} required /></label>
          <label><span className="micro-label mb-1 block">Student name</span><input name="fullName" {...fieldFeedback("student", "fullName")} defaultValue={editing?.fullName} placeholder="e.g. Jannatul Nayeem" className={control} required /></label>
          <label><span className="micro-label mb-1 block">Phone</span><input name="phone" defaultValue={editing?.phone ?? ""} placeholder="optional" className={control} /></label>
          <label><span className="micro-label mb-1 block">Home department</span><input name="department" defaultValue={editing?.homeDepartmentLabel ?? "CSE"} placeholder="e.g. CSE or EEE" className={control} /></label>
          <label><span className="micro-label mb-1 block">Audience type</span><select name="audienceType" {...fieldFeedback("student", "audienceType")} defaultValue={editing?.enrollment.audienceType ?? "local"} className={control}><option value="local">Local</option><option value="external">Other department</option><option value="merged">Merged audience</option></select></label>
          <div className="flex items-end gap-2"><button disabled={pending} className="flex-1 rounded-md bg-[var(--color-pine)] px-3 py-2 text-[12px] font-semibold text-white"><Plus size={13} className="mr-1 inline" />{editing ? "Save changes" : "Add student"}</button>{editing && <button type="button" onClick={() => setEditing(null)} className="rounded-md border border-[var(--color-line)] px-3 py-2 text-[12px]">Cancel</button>}</div>
        </fieldset></form>
        {feedback("student")}
      </section>

      <section className="ruled rounded-lg">
        <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">Import roster CSV</h2><p className="mt-0.5 text-[11.5px] text-muted">Required headers: Student ID, Student Name. Phone, Department and Audience Type are optional.</p></header>
        <form className="space-y-3 p-4" onSubmit={(event) => {
          event.preventDefault();
          if (fileRead.status !== "ready") return;
          const form = event.currentTarget;
          const data = new FormData();
          data.set("teachingGroupId", String(selectedGroup.id));
          data.set("csvText", fileRead.text);
          run("import", () => importStudentCsvAction(data), () => {
            form.reset();
            setFileRead({ status: "idle" });
          });
        }}>
          <label className="block min-w-0 text-sm">
            <span className="mb-1 block">Roster CSV file</span>
            <input ref={picker} type="file" accept=".csv,text/csv" className={control} required
              disabled={pendingArea === "import"} {...fieldFeedback("import", "csvText")}
              onChange={(event) => void readFile(event.target.files?.[0])} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2"><a download="student-roster-template.csv" href={'data:text/csv;charset=utf-8,' + encodeURIComponent('Student ID,Student Name,Phone Number,Department,Audience Type\n0322600000001,Example Student,01700000000,CSE,local')} className="text-[11.5px] font-semibold text-[var(--color-pine)] hover:underline">Download sample CSV</a><button disabled={pending || fileRead.status !== "ready"} className="rounded-md bg-[var(--color-ink)] px-4 py-2 text-[12px] font-semibold text-white">Import roster CSV</button></div>
        </form>
        <div id="roster-import-feedback">{feedback("import")}</div>
      </section>
    </div>}

    {canTakeAttendance && <section className="ruled rounded-lg">
      <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">Create attendance session</h2></header>
      <form ref={sessionForm} className="grid gap-2 p-4 md:grid-cols-6" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); run("create", () => createAttendanceSessionAction(data), () => form.reset()); }}><fieldset className="contents" disabled={pendingArea === "create"}>
        <input type="hidden" name="teachingGroupId" value={selectedGroup.id} />
        <label><span className="micro-label mb-1 block">Date</span><input name="classDate" {...fieldFeedback("create", "classDate")} type="date" min={termStart} max={termEnd} className={control} required /></label>
        <label><span className="micro-label mb-1 block">Phase</span><select name="phase" {...fieldFeedback("create", "phase")} className={control}><option value="midterm">Before / midterm</option><option value="final">After midterm / final</option></select></label>
        <label><span className="micro-label mb-1 block">Teacher</span><select name="teacherId" {...fieldFeedback("create", "teacherId")} className={control}><option value="">—</option>{groupTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.shortCode}</option>)}</select></label>
        <label><span className="micro-label mb-1 block">Start (optional)</span><input name="startTime" {...fieldFeedback("create", "startTime")} type="time" className={control} /></label>
        <label><span className="micro-label mb-1 block">End (optional)</span><input name="endTime" {...fieldFeedback("create", "endTime")} type="time" className={control} /></label>
        <button disabled={pending || roster.length === 0} className="self-end rounded-md bg-[var(--color-pine)] px-3 py-2 text-[12px] font-semibold text-white">Create session</button>
      </fieldset></form>
      {feedback("create")}
    </section>}

    <section className="ruled rounded-lg">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line-soft)] px-4 py-3">
        <div><h2 className="font-display text-[15px] font-semibold">Take attendance</h2><p className="mt-0.5 text-[11.5px] text-muted">Late counts as attended; excused is excluded from the denominator. Only students captured when this session was created can be marked.</p></div>
        <div className="flex flex-wrap gap-1.5">{sessions.map((session) => <button key={session.id} disabled={pending} onClick={() => selectSession(session.id)} className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${session.id === effectiveSessionId ? "border-[var(--color-pine)] bg-[var(--color-pine)] text-white" : "border-[var(--color-line)] bg-white"}`}>{session.classDate} · {session.phase}</button>)}</div>
      </header>
      {feedback("delete")}
      {!activeSession ? <p className="p-8 text-center text-[12px] text-muted">Create a session to take attendance.</p> : <>
        {canTakeAttendance && <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line-soft)] px-4 py-2.5">
          <span className="mr-auto text-[12px]"><strong>{activeSession.classDate}</strong> · {activeSession.phase}{activeSession.startMinutes != null && activeSession.endMinutes != null ? ` · ${fmtRange(activeSession.startMinutes, activeSession.endMinutes)}` : ""}</span>
          <button disabled={pending || sessionRoster.length === 0} onClick={() => setStatusOverrides((current) => ({ ...current, ...Object.fromEntries(sessionRoster.map((student) => [`${effectiveSessionId}:${student.id}`, "present" as AttendanceStatus])) }))} className="inline-flex items-center gap-1 rounded-md border border-[var(--color-pine)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-pine)]"><CheckCheck size={12} />Mark all present</button>
          <button disabled={pending || sessionRoster.length === 0} onClick={() => {
            const values = sessionRoster.map(student => ({ studentId: student.id, status: statusFor(student.id) }));
            run("marks", () => saveAttendanceAction(activeSession.id, values), () => {
              setStatusOverrides(current => {
                const next = { ...current };
                for (const { studentId } of values) delete next[`${activeSession.id}:${studentId}`];
                return next;
              });
            });
          }} className="inline-flex items-center gap-1 rounded-md bg-[var(--color-pine)] px-3 py-1.5 text-[11px] font-semibold text-white"><Save size={12} />Save</button>
          <button type="button" disabled={pending} aria-label="Delete this attendance session" title="Delete session" onClick={async () => { if (await ask({ title: "Delete this attendance session?", body: "The session and every mark recorded in it will be removed. Students' other sessions are not affected.", confirmLabel: "Delete session" })) run("delete", () => deleteAttendanceSessionAction(activeSession.id), () => setResults(current => ({ ...current, marks: undefined }))); }} className="rounded p-1.5 text-[var(--color-clay)]"><Trash2 size={13} aria-hidden="true" /></button>
        </div>}
        {feedback("marks")}
        {sessionRoster.length === 0 && <p className="px-4 py-3 text-[12px] text-muted">No current roster students belong to this session. Existing attendance records are preserved.</p>}
        <div role="region" aria-label="Attendance marks for this session" tabIndex={0} className="table-region max-h-[560px] overflow-auto"><table className="routine-table text-[12.5px]"><thead className="sticky top-0 z-10"><tr>{["SL.", "Student ID", "Student name", "Phone number", "Department", "Attendance"].map((h) => <th key={h} className="px-3 py-2 text-left"><span className="micro-label">{h}</span></th>)}</tr></thead><tbody>{roster.map((student, index) => <tr key={student.id} className={index % 2 ? "bg-wash" : "bg-white"}><td className="px-3 py-2 text-center font-mono">{String(index + 1).padStart(2, "0")}</td><td className="px-3 py-2 font-mono">{student.studentCode}</td><td className="px-3 py-2 font-medium">{student.fullName}</td><td className="px-3 py-2 font-mono">{student.phone ?? "—"}</td><td className="px-3 py-2">{student.homeDepartmentLabel ?? "—"}</td><td className="min-w-48 px-2 py-1.5">{capturedIds.has(student.id) ? <select aria-label={`Attendance for ${student.fullName}`} disabled={!canTakeAttendance || pending} value={statusFor(student.id)} onChange={(event) => setStatusOverrides((current) => ({ ...current, [`${effectiveSessionId}:${student.id}`]: event.target.value as AttendanceStatus }))} className={`${control} border-[var(--color-pine)]/35`}><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></select> : <span className="text-[12px] text-muted">Not in this session</span>}</td></tr>)}</tbody></table></div>
      </>}
    </section>

    <section className="ruled rounded-lg">
      <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">Student roster & semester summary</h2><p className="mt-0.5 text-[11.5px] text-muted">Removing an enrollment does not delete historical attendance.</p></header>
      {feedback("roster")}
      <div role="region" aria-label="Student roster and semester summary" tabIndex={0} className="table-region overflow-x-auto p-4"><table className="routine-table text-[12px]"><thead><tr>{["Student", "Audience", "Midterm", "Final", "Semester", "Attendance mark", ...(canManageRosters ? ["Actions"] : [])].map((h) => <th key={h} className="px-2.5 py-2 text-left"><span className="micro-label">{h}</span></th>)}</tr></thead><tbody>{roster.length === 0 ? <tr><td colSpan={canManageRosters ? 7 : 6} className="p-8 text-center text-muted">Import a CSV or add a student to start.</td></tr> : roster.map((student) => { const summary = summaryByStudent.get(student.id); return <tr key={student.id}><td className="px-2.5 py-2"><strong>{student.fullName}</strong><div className="font-mono text-[10.5px] text-muted">{student.studentCode}</div></td><td className="px-2.5 py-2 capitalize">{student.enrollment.audienceType}</td><td className="px-2.5 py-2 font-mono">{summary?.midterm.attended ?? 0}/{summary?.midterm.total ?? 0}</td><td className="px-2.5 py-2 font-mono">{summary?.final.attended ?? 0}/{summary?.final.total ?? 0}</td><td className="px-2.5 py-2 font-mono">{summary?.semester.percentage ?? 0}%</td><td className="px-2.5 py-2 font-mono font-bold text-[var(--color-pine)]">{summary?.mark ?? 0}/{summary?.maximum ?? (selectedGroup.courseType === "sessional" ? 5 : 10)}</td>{canManageRosters && <td className="px-2.5 py-2"><span className="flex gap-1"><button disabled={pending} title="Edit" onClick={() => { setEditing(student); studentForm.current?.scrollIntoView({ behavior: "smooth" }); }} className="rounded p-1 text-[var(--color-pine)]"><Pencil size={13} /></button><button type="button" disabled={pending} aria-label={`Remove ${student.fullName} from this roster`} title="Remove from roster" onClick={async () => { if (await ask({ title: `Remove ${student.fullName} from this roster?`, body: "They will no longer appear in new attendance sessions for this group. Attendance already recorded is kept.", confirmLabel: "Remove from roster" })) run("roster", () => deactivateStudentAction(student.id, selectedGroup.id)); }} className="rounded p-1 text-[var(--color-clay)]"><UserMinus size={13} aria-hidden="true" /></button></span></td>}</tr>; })}</tbody></table></div>
    </section>
  </div>;
}
