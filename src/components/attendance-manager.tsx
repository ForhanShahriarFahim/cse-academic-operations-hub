"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { CheckCheck, FileUp, Pencil, Plus, Save, Trash2, UserMinus } from "lucide-react";
import type { ActionResult } from "@/lib/actions";
import {
  createAttendanceSessionAction,
  deactivateStudentAction,
  deleteAttendanceSessionAction,
  importStudentCsvAction,
  saveAttendanceAction,
  upsertStudentAction,
} from "@/lib/academic-actions";
import type { AttendanceStatus } from "@/lib/attendance";
import { fmtRange } from "@/lib/time";

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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [activeSessionId, setActiveSessionId] = useState(sessions.at(-1)?.id ?? 0);
  const effectiveSessionId = sessions.some((session) => session.id === activeSessionId)
    ? activeSessionId
    : sessions.at(-1)?.id ?? 0;
  const activeSession = sessions.find((session) => session.id === effectiveSessionId) ?? null;
  const [statusOverrides, setStatusOverrides] = useState<Record<string, AttendanceStatus>>({});
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [csvName, setCsvName] = useState("");
  const csvText = useRef("");
  const studentForm = useRef<HTMLFormElement>(null);
  const sessionForm = useRef<HTMLFormElement>(null);
  const csvForm = useRef<HTMLFormElement>(null);
  const groupTeachers = teachers.filter((teacher) => selectedGroup.teacherIds.includes(teacher.id));
  const summaryByStudent = useMemo(() => new Map(summaries.map((row) => [row.studentId, row])), [summaries]);

  function statusFor(studentId: number): AttendanceStatus {
    const key = `${effectiveSessionId}:${studentId}`;
    return statusOverrides[key]
      ?? activeSession?.records.find((record) => record.studentId === studentId)?.status as AttendanceStatus
      ?? "absent";
  }

  function selectSession(id: number) {
    setActiveSessionId(id);
  }

  function run(action: () => Promise<ActionResult>, reset?: HTMLFormElement) {
    startTransition(async () => {
      const response = await action();
      setResult(response);
      if (response.ok) { reset?.reset(); setEditing(null); router.refresh(); }
    });
  }

  return <div className="space-y-4">
    <section className="ruled rounded-lg p-4">
      <div className="grid items-end gap-3 lg:grid-cols-[1fr_auto]">
        <label><span className="micro-label mb-1 block">Course / teaching group</span>
          <select value={selectedGroup.id} onChange={(event) => router.push(`/attendance?group=${event.target.value}`)} className={control}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.courseCode} · {group.audience} · {group.courseTitle}</option>)}
          </select>
        </label>
        <span className="rounded-md border border-[var(--color-line)] bg-[#faf8f1] px-3 py-2 text-[12px]"><strong>{selectedGroup.courseType === "sessional" ? "Lab / sessional" : "Theory"}</strong> · {summaries[0]?.maximum ?? (selectedGroup.courseType === "sessional" ? 5 : 10)} attendance marks</span>
      </div>
    </section>

    {result && <p className={`rounded-md border px-3 py-2 text-[12px] ${result.ok ? "border-[var(--color-pine)]/30 bg-[var(--color-pine)]/5 text-[var(--color-pine)]" : "border-[var(--color-clay)]/30 bg-[var(--color-clay)]/5 text-[var(--color-clay)]"}`}>{result.message}</p>}

    {canManageRosters && <div className="grid gap-4 xl:grid-cols-2">
      <section className="ruled rounded-lg">
        <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">{editing ? "Edit student" : "Add one student"}</h2><p className="mt-0.5 text-[11.5px] text-[#6b7564]">Home department is descriptive; enrollment in this teaching group is independent.</p></header>
        <form key={editing?.id ?? "new"} ref={studentForm} className="grid grid-cols-2 gap-2 p-4" onSubmit={(event) => { event.preventDefault(); run(() => upsertStudentAction(new FormData(studentForm.current!)), studentForm.current!); }}>
          <input type="hidden" name="teachingGroupId" value={selectedGroup.id} />
          <input type="hidden" name="studentId" value={editing?.id ?? ""} />
          <label><span className="micro-label mb-1 block">Student ID</span><input name="studentCode" defaultValue={editing?.studentCode} placeholder="e.g. 03226…" className={control} required /></label>
          <label><span className="micro-label mb-1 block">Student name</span><input name="fullName" defaultValue={editing?.fullName} placeholder="e.g. Jannatul Nayeem" className={control} required /></label>
          <label><span className="micro-label mb-1 block">Phone</span><input name="phone" defaultValue={editing?.phone ?? ""} placeholder="optional" className={control} /></label>
          <label><span className="micro-label mb-1 block">Home department</span><input name="department" defaultValue={editing?.homeDepartmentLabel ?? "CSE"} placeholder="e.g. CSE or EEE" className={control} /></label>
          <label><span className="micro-label mb-1 block">Audience type</span><select name="audienceType" defaultValue={editing?.enrollment.audienceType ?? "local"} className={control}><option value="local">Local</option><option value="external">Other department</option><option value="merged">Merged audience</option></select></label>
          <div className="flex items-end gap-2"><button disabled={pending} className="flex-1 rounded-md bg-[var(--color-pine)] px-3 py-2 text-[12px] font-semibold text-white"><Plus size={13} className="mr-1 inline" />{editing ? "Save changes" : "Add student"}</button>{editing && <button type="button" onClick={() => setEditing(null)} className="rounded-md border border-[var(--color-line)] px-3 py-2 text-[12px]">Cancel</button>}</div>
        </form>
      </section>

      <section className="ruled rounded-lg">
        <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">Import roster CSV</h2><p className="mt-0.5 text-[11.5px] text-[#6b7564]">Required headers: Student ID, Student Name. Phone, Department and Audience Type are optional.</p></header>
        <form ref={csvForm} className="space-y-3 p-4" onSubmit={(event) => { event.preventDefault(); const fd = new FormData(); fd.set("teachingGroupId", String(selectedGroup.id)); fd.set("csvText", csvText.current); run(() => importStudentCsvAction(fd), csvForm.current!); }}>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-[var(--color-line)] bg-[#faf8f1] px-4 py-6 text-[12.5px] text-[#5c675d] hover:border-[var(--color-moss)]"><FileUp size={18} /><span>{csvName || "Choose a .csv file"}</span><input type="file" accept=".csv,text/csv" className="hidden" required onChange={async (event) => { const file = event.target.files?.[0]; setCsvName(file?.name ?? ""); csvText.current = file ? await file.text() : ""; }} /></label>
          <div className="flex items-center justify-between"><a download="student-roster-template.csv" href={'data:text/csv;charset=utf-8,' + encodeURIComponent('Student ID,Student Name,Phone Number,Department,Audience Type\n0322600000001,Example Student,01700000000,CSE,local')} className="text-[11.5px] font-semibold text-[var(--color-pine)] hover:underline">Download sample CSV</a><button disabled={pending || !csvName} className="rounded-md bg-[var(--color-ink)] px-4 py-2 text-[12px] font-semibold text-white">Import / update roster</button></div>
        </form>
      </section>
    </div>}

    {canTakeAttendance && <section className="ruled rounded-lg">
      <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">Create attendance session</h2></header>
      <form ref={sessionForm} className="grid gap-2 p-4 md:grid-cols-6" onSubmit={(event) => { event.preventDefault(); run(() => createAttendanceSessionAction(new FormData(sessionForm.current!)), sessionForm.current!); }}>
        <input type="hidden" name="teachingGroupId" value={selectedGroup.id} />
        <label><span className="micro-label mb-1 block">Date</span><input name="classDate" type="date" min={termStart} max={termEnd} className={control} required /></label>
        <label><span className="micro-label mb-1 block">Phase</span><select name="phase" className={control}><option value="midterm">Before / midterm</option><option value="final">After midterm / final</option></select></label>
        <label><span className="micro-label mb-1 block">Teacher</span><select name="teacherId" className={control}><option value="">—</option>{groupTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.shortCode}</option>)}</select></label>
        <label><span className="micro-label mb-1 block">Start (optional)</span><input name="startTime" type="time" className={control} /></label>
        <label><span className="micro-label mb-1 block">End (optional)</span><input name="endTime" type="time" className={control} /></label>
        <button disabled={pending || roster.length === 0} className="self-end rounded-md bg-[var(--color-pine)] px-3 py-2 text-[12px] font-semibold text-white">Create session</button>
      </form>
    </section>}

    <section className="ruled rounded-lg">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line-soft)] px-4 py-3">
        <div><h2 className="font-display text-[15px] font-semibold">Take attendance</h2><p className="mt-0.5 text-[11.5px] text-[#6b7564]">Late counts as attended; excused is excluded from the denominator.</p></div>
        <div className="flex flex-wrap gap-1.5">{sessions.map((session) => <button key={session.id} onClick={() => selectSession(session.id)} className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${session.id === effectiveSessionId ? "border-[var(--color-pine)] bg-[var(--color-pine)] text-white" : "border-[var(--color-line)] bg-white"}`}>{session.classDate} · {session.phase}</button>)}</div>
      </header>
      {!activeSession ? <p className="p-8 text-center text-[12px] text-[#8a8571]">Create a session to take attendance.</p> : <>
        {canTakeAttendance && <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line-soft)] px-4 py-2.5">
          <span className="mr-auto text-[12px]"><strong>{activeSession.classDate}</strong> · {activeSession.phase}{activeSession.startMinutes != null && activeSession.endMinutes != null ? ` · ${fmtRange(activeSession.startMinutes, activeSession.endMinutes)}` : ""}</span>
          <button onClick={() => setStatusOverrides((current) => ({ ...current, ...Object.fromEntries(roster.map((student) => [`${effectiveSessionId}:${student.id}`, "present" as AttendanceStatus])) }))} className="inline-flex items-center gap-1 rounded-md border border-[var(--color-pine)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-pine)]"><CheckCheck size={12} />Mark all present</button>
          <button disabled={pending} onClick={() => run(() => saveAttendanceAction(activeSession.id, roster.map((student) => ({ studentId: student.id, status: statusFor(student.id) }))))} className="inline-flex items-center gap-1 rounded-md bg-[var(--color-pine)] px-3 py-1.5 text-[11px] font-semibold text-white"><Save size={12} />Save</button>
          <button title="Delete session" onClick={() => confirm("Delete this attendance session?") && run(() => deleteAttendanceSessionAction(activeSession.id))} className="rounded p-1.5 text-[var(--color-clay)]"><Trash2 size={13} /></button>
        </div>}
        <div className="max-h-[560px] overflow-auto"><table className="routine-table text-[12.5px]"><thead className="sticky top-0 z-10"><tr>{["SL.", "Student ID", "Student name", "Phone number", "Department", "Attendance"].map((h) => <th key={h} className="px-3 py-2 text-left"><span className="micro-label">{h}</span></th>)}</tr></thead><tbody>{roster.map((student, index) => <tr key={student.id} className={index % 2 ? "bg-[#faf8f1]" : "bg-white"}><td className="px-3 py-2 text-center font-mono">{String(index + 1).padStart(2, "0")}</td><td className="px-3 py-2 font-mono">{student.studentCode}</td><td className="px-3 py-2 font-medium">{student.fullName}</td><td className="px-3 py-2 font-mono">{student.phone ?? "—"}</td><td className="px-3 py-2">{student.homeDepartmentLabel ?? "—"}</td><td className="min-w-48 px-2 py-1.5"><select disabled={!canTakeAttendance} value={statusFor(student.id)} onChange={(event) => setStatusOverrides((current) => ({ ...current, [`${effectiveSessionId}:${student.id}`]: event.target.value as AttendanceStatus }))} className={`${control} border-[var(--color-pine)]/35`}><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></select></td></tr>)}</tbody></table></div>
      </>}
    </section>

    <section className="ruled rounded-lg">
      <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">Student roster & semester summary</h2><p className="mt-0.5 text-[11.5px] text-[#6b7564]">Removing an enrollment does not delete historical attendance.</p></header>
      <div className="overflow-x-auto p-4"><table className="routine-table text-[12px]"><thead><tr>{["Student", "Audience", "Midterm", "Final", "Semester", "Attendance mark", ...(canManageRosters ? ["Actions"] : [])].map((h) => <th key={h} className="px-2.5 py-2 text-left"><span className="micro-label">{h}</span></th>)}</tr></thead><tbody>{roster.length === 0 ? <tr><td colSpan={canManageRosters ? 7 : 6} className="p-8 text-center text-[#8a8571]">Import a CSV or add a student to start.</td></tr> : roster.map((student) => { const summary = summaryByStudent.get(student.id); return <tr key={student.id}><td className="px-2.5 py-2"><strong>{student.fullName}</strong><div className="font-mono text-[10.5px] text-[#7a8377]">{student.studentCode}</div></td><td className="px-2.5 py-2 capitalize">{student.enrollment.audienceType}</td><td className="px-2.5 py-2 font-mono">{summary?.midterm.attended ?? 0}/{summary?.midterm.total ?? 0}</td><td className="px-2.5 py-2 font-mono">{summary?.final.attended ?? 0}/{summary?.final.total ?? 0}</td><td className="px-2.5 py-2 font-mono">{summary?.semester.percentage ?? 0}%</td><td className="px-2.5 py-2 font-mono font-bold text-[var(--color-pine)]">{summary?.mark ?? 0}/{summary?.maximum ?? (selectedGroup.courseType === "sessional" ? 5 : 10)}</td>{canManageRosters && <td className="px-2.5 py-2"><span className="flex gap-1"><button title="Edit" onClick={() => { setEditing(student); studentForm.current?.scrollIntoView({ behavior: "smooth" }); }} className="rounded p-1 text-[var(--color-pine)]"><Pencil size={13} /></button><button title="Remove from roster" onClick={() => confirm("Remove this student from this roster? Attendance history will be kept.") && run(() => deactivateStudentAction(student.id, selectedGroup.id))} className="rounded p-1 text-[var(--color-clay)]"><UserMinus size={13} /></button></span></td>}</tr>; })}</tbody></table></div>
    </section>
  </div>;
}
