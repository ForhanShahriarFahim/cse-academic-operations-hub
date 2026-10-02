"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Undo2, XCircle } from "lucide-react";
import type { RoutineSelection } from "@/lib/routine-projection";
import { DAY_NAMES, DAY_SHORT } from "@/lib/time";
import { teachingDays, type Stream } from "@/lib/time-grid";
import Link from "next/link";
import type { MeetingView } from "@/lib/serialize";
import type { PermittedWindow } from "@/lib/conflicts";
import type { GroupCoverage } from "@/lib/data";
import type { ActionResult } from "@/lib/action-result";
import type { RoutineProjection, RoutineView } from "@/lib/routine-projection";
import { moveMeetingAction } from "@/lib/actions";
import {
  candidateMeeting, fitsForGroup, precheck,
  type EngineContext, type GroupTemplate, type WorkbenchRoom, type WorkbenchTeacher,
} from "@/lib/routine-workbench";
import { Notice } from "@/components/ui";
import { RoutineGrid, type ClassStatus, type DropPreview } from "./grid";
import { RoutineAgenda } from "./agenda";
import { AttentionList } from "./attention";
import { ClassPanel, type ChangeReport, type PanelMode } from "./class-panel";

export interface WorkbenchGroup {
  template: GroupTemplate;
  coverage: GroupCoverage;
  /** Teachers allocated to the group, used as defaults and for "Where does it fit?". */
  teacherIds: number[];
}

interface NoticeState { tone: "success" | "error"; text: string; undo?: () => Promise<ActionResult> }

function useWide(query: string): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return wide;
}

export function RoutineWorkbench({ projection, groups, teachers, rooms, windows, blockersByDay, weekTotals, children }: {
  projection: RoutineProjection;
  groups: WorkbenchGroup[];
  teachers: WorkbenchTeacher[];
  rooms: WorkbenchRoom[];
  windows: PermittedWindow[];
  blockersByDay: Record<number, number>;
  weekTotals: { blockers: number; warnings: number };
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { selection, source } = projection;
  const stream = selection.stream;
  const dayView = projection.days[0];
  const day = dayView?.dayOfWeek ?? selection.day;
  const docked = useWide("(min-width: 1400px)");
  const headingId = useId();

  const [query, setQuery] = useState("");
  const [showWarnings, setShowWarnings] = useState(false);
  const [panel, setPanel] = useState<PanelMode | null>(null);
  const [tab, setTab] = useState<"class" | "attention">("attention");
  const [fitGroupId, setFitGroupId] = useState<number | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [dragging, setDraggingState] = useState<MeetingView | null>(null);
  // Drag events can arrive before React re-renders, so the dragged class is also kept in a ref.
  const draggingRef = useRef<MeetingView | null>(null);
  const setDragging = (m: MeetingView | null) => { draggingRef.current = m; setDraggingState(m); };
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  const [pending, startTransition] = useTransition();
  const trigger = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const context: EngineContext = useMemo(() => ({ meetings: source.meetings, externals: source.externals, breaks: source.breaks, windows, grid: source.timeGrid }), [source, windows]);
  const days = useMemo(() => teachingDays(source.timeGrid), [source]);
  const dayMeetings = useMemo(() => projection.exportMeetings.map((item) => item.meeting).filter((m) => m.dayOfWeek === day), [projection, day]);
  const statusById = useMemo(() => new Map<number, ClassStatus>(projection.exportMeetings.map((item) => [item.meeting.id, item.validationStatus])), [projection]);
  const streamMeetingIds = useMemo(() => new Set(source.meetings.filter((m) => m.audiences.some((a) => a.stream === stream)).map((m) => m.id)), [source, stream]);
  const dayIssues = source.issues.filter((i) => i.dayOfWeek === day && i.meetingIds.some((id) => streamMeetingIds.has(id)));
  const unplaced = groups.filter((g) => g.template.audiences.some((a) => a.stream === stream)
    && ["vacancy", "unscheduled", "partial", "teacher_managed"].includes(g.coverage.status));

  const selectedId = panel?.kind === "edit" ? panel.meetingId : null;
  const selected = selectedId != null ? source.meetings.find((m) => m.id === selectedId) ?? null : null;
  const related = useMemo(() => {
    if (!selected) return { meetingIds: new Set<number>(), externalIds: new Set<number>() };
    const teacherIds = new Set(selected.teachers.map((t) => t.id));
    const roomIds = new Set(selected.rooms.map((r) => r.id));
    return {
      meetingIds: new Set(dayMeetings.filter((m) => m.id !== selected.id && (m.teachers.some((t) => teacherIds.has(t.id)) || m.rooms.some((r) => roomIds.has(r.id)))).map((m) => m.id)),
      externalIds: new Set((dayView?.externals ?? []).filter((e) => (e.teacherId != null && teacherIds.has(e.teacherId)) || (e.roomId != null && roomIds.has(e.roomId))).map((e) => e.id)),
    };
  }, [selected, dayMeetings, dayView]);

  const fitGroup = groups.find((g) => g.template.teachingGroupId === fitGroupId) ?? null;
  const fits = useMemo(() => {
    const map = new Map<string, string>();
    if (!fitGroup || !dayView) return map;
    for (const group of dayView.groups) {
      const inGroup = new Set(group.rows.filter((row) => !row.unplanned).map((row) => row.batch.id));
      for (const fit of fitsForGroup(fitGroup.template, fitGroup.teacherIds, day, group.slots, rooms, teachers, context)) {
        if (inGroup.has(fit.batchId)) map.set(`${fit.batchId}:${group.slots[fit.slotIndex].start}`, `Fits ${fitGroup.template.courseCode}`);
      }
    }
    return map;
  }, [fitGroup, dayView, day, rooms, teachers, context]);

  const q = query.trim().toLowerCase();
  const matches = (m: MeetingView) => !q || m.courseCode.toLowerCase().includes(q) || m.courseTitle.toLowerCase().includes(q)
    || m.teachers.some((t) => t.shortCode.toLowerCase().includes(q) || t.fullName.toLowerCase().includes(q))
    || m.rooms.some((r) => r.code.toLowerCase().includes(q));
  const matchCount = q ? dayMeetings.filter(matches).length : null;

  // The panel is a modal <dialog> below 1400px (a side drawer, or a full-screen sheet on phones).
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (panel && !docked && !element.open) element.showModal();
    if ((!panel || docked) && element.open) element.close();
  }, [panel, docked]);

  function closePanel() {
    setPanel(null);
    setTab("attention");
    const target = trigger.current;
    trigger.current = null;
    if (target?.isConnected) requestAnimationFrame(() => target.focus());
  }

  function navigate(changes: Record<string, string>) {
    const params = new URLSearchParams({ stream, view: selection.view, day: String(day), batch: selection.batchId ? String(selection.batchId) : "all", ...changes });
    setPanel(null);
    setFitGroupId(null);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function report({ result, undo }: ChangeReport) {
    setNotice({ tone: "success", text: result.message, undo });
    closePanel();
  }

  function runUndo() {
    const undo = notice?.undo;
    if (!undo) return;
    startTransition(async () => {
      const result = await undo();
      setNotice(result.ok ? { tone: "success", text: `Undone. ${result.message}` } : { tone: "error", text: `Could not undo: ${result.message}` });
    });
  }

  // Drag and drop (pointer). The keyboard alternative is "Move to a free time" in the panel.
  function previewMove(meeting: MeetingView, targetDay: number, start: number): DropPreview {
    const end = start + (meeting.endMinutes - meeting.startMinutes);
    const moved = candidateMeeting(meeting, {
      dayOfWeek: targetDay, startMinutes: start, endMinutes: end,
      teacherIds: meeting.teachers.map((t) => t.id), roomIds: meeting.rooms.map((r) => r.id),
      isException: meeting.isException, exceptionNote: meeting.exceptionNote,
    }, teachers, rooms);
    const blocker = precheck(moved, context).find((i) => i.severity === "blocker");
    return blocker ? { ok: false, reason: `Can't move here: ${blocker.title}` } : { ok: true, reason: "Drop to move here" };
  }

  function move(meeting: MeetingView, targetDay: number, start: number) {
    const preview = previewMove(meeting, targetDay, start);
    if (!preview.ok) { setNotice({ tone: "error", text: `${meeting.courseCode} was not moved. ${preview.reason.replace("Can't move here: ", "")}.` }); return; }
    const end = start + (meeting.endMinutes - meeting.startMinutes);
    const back = { day: meeting.dayOfWeek, start: meeting.startMinutes, end: meeting.endMinutes };
    startTransition(async () => {
      const result = await moveMeetingAction(meeting.id, targetDay, start, end);
      setNotice(result.ok
        ? { tone: "success", text: `${meeting.courseCode} moved to ${DAY_NAMES[targetDay]} ${fmtClock(start)}.`, undo: () => moveMeetingAction(meeting.id, back.day, back.start, back.end) }
        : { tone: "error", text: result.message });
    });
  }

  const panelBody = panel ? (
    <ClassPanel key={JSON.stringify(panel)} mode={panel} stream={stream} grid={source.timeGrid} meetings={source.meetings} groups={groups}
      teachers={teachers} rooms={rooms} context={context} onChange={report} onClose={closePanel} headingId={headingId} />
  ) : (
    <AttentionList day={day} issues={dayIssues} meetings={source.meetings} unplaced={unplaced} fitGroupId={fitGroupId} fitCount={fits.size}
      onFit={setFitGroupId} headingId={headingId}
      onShow={(meetingId) => { const m = source.meetings.find((x) => x.id === meetingId); if (m) { setPanel({ kind: "edit", meetingId }); setTab("class"); if (m.dayOfWeek !== day) navigate({ day: String(m.dayOfWeek) }); } }} />
  );

  const extraDayBatches = dayView?.exceptionOnly
    ? dayView.groups.flatMap((group) => group.rows.filter((row) => !row.unplanned).map((row) => `${row.batch.stream === "HSC" ? "HSC" : "DIP"}-${row.batch.label}`))
    : [];
  const dayNote = extraDayBatches.length
    ? `${DAY_NAMES[day]} is an extra teaching day for ${extraDayBatches.join(", ")} only. Other ${stream === "HSC" ? "HSC" : "Diploma"} batches have no classes this day.`
    : null;

  return (
    <div>
      <div role="toolbar" aria-label="Routine view" className="no-print sticky top-0 z-20 -mx-1 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--color-line)] bg-[var(--color-paper)] px-1 pb-3 pt-2 max-lg:static">
        <Segmented label="Stream" options={[["HSC", "HSC"], ["DIPLOMA", "Diploma"]]} value={stream} onSelect={(value) => navigate({ stream: value, day: String(days[value as Stream].all[0] ?? 0), batch: "all" })} />
        {selection.view === "day" ? (
          <div role="group" aria-label="Day" className="flex max-w-full overflow-x-auto rounded-[7px] border border-[var(--color-line)] bg-sheet p-0.5">
            {days[stream].all.map((d) => {
              const count = blockersByDay[d] ?? 0;
              return (
                <button key={d} type="button" aria-pressed={d === day} onClick={() => navigate({ day: String(d) })}
                  onDragOver={(event) => { if (draggingRef.current && d !== day) event.preventDefault(); }}
                  onDrop={(event) => { event.preventDefault(); const m = draggingRef.current; if (m && d !== day) move(m, d, m.startMinutes); setDragging(null); }}
                  aria-label={`${DAY_NAMES[d]}${count ? `, ${count} clash${count === 1 ? "" : "es"}` : ""}`}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 py-1.5 text-[13px] font-medium ${d === day ? "bg-[var(--color-ink)] text-white" : "text-ink-2 hover:bg-wash"}`}>
                  {DAY_SHORT[d]}{days[stream].exceptionOnly.includes(d) ? <span aria-hidden="true" title="Only some batches teach this day">*</span> : null}
                  {count ? <span className={`min-w-[18px] rounded-full px-1.5 text-center text-[11.5px] font-semibold ${d === day ? "bg-[#f3b9a8] text-[var(--color-ink)]" : "bg-clay-tint text-[var(--color-clay)]"}`}>{count}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        <Segmented label="View" options={[["day", "Day"], ["week", "Week"]]} value={selection.view} onSelect={(value) => navigate({ view: value as RoutineView })} />
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          Batch
          <select value={selection.batchId ?? "all"} onChange={(event) => navigate({ batch: event.target.value })} className="min-h-[34px] rounded-md border border-[var(--color-line)] bg-white px-2 text-[13px]">
            <option value="all">All batches</option>
            {projection.availableBatches.map((b) => <option key={b.id} value={b.id}>{b.stream === "HSC" ? "HSC" : "DIP"}-{b.label}</option>)}
          </select>
        </label>
        {selection.view === "day" ? (
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Find course, teacher or room"
            placeholder="Find course, teacher or room" className="min-h-[34px] w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 text-[13px] sm:w-[220px]" />
        ) : null}
        {matchCount != null ? <span role="status" className="text-[12.5px] text-muted">{matchCount} match{matchCount === 1 ? "" : "es"}</span> : null}
        <span className="flex-1" />
        <span className="flex items-center gap-3 text-[13px]">
          <span className={`inline-flex items-center gap-1 font-semibold ${weekTotals.blockers ? "text-[var(--color-clay)]" : "text-[var(--color-pine)]"}`}><XCircle size={14} aria-hidden="true" />{weekTotals.blockers} clashes this week</span>
          <label className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-gold-text">
            <input type="checkbox" checked={showWarnings} onChange={(event) => setShowWarnings(event.target.checked)} className="accent-[var(--color-gold)]" />
            <AlertTriangle size={14} aria-hidden="true" />Show {weekTotals.warnings} warnings
          </label>
        </span>
      </div>

      {notice ? (
        <Notice tone={notice.tone} className="mb-3">
          <span>{notice.text}</span>
          <span className="ml-2 inline-flex gap-2">
            {notice.undo ? <button type="button" disabled={pending} onClick={runUndo} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"><Undo2 size={13} aria-hidden="true" />Undo</button> : null}
            <button type="button" onClick={() => setNotice(null)} className="underline underline-offset-2">Dismiss</button>
          </span>
        </Notice>
      ) : null}

      {selection.view === "week" ? children : (
        <>
          {children}
          {dayNote ? <p className="no-print mb-3 text-[13px] text-ink-2">{dayNote}</p> : null}
          <div className={`no-print ${docked ? "grid grid-cols-[minmax(0,1fr)_350px] items-start gap-4" : ""}`}>
            <div className="min-w-0">
              <div className="hidden lg:block">
                {dayView && dayView.groups.length ? dayView.groups.map((group, groupIndex) => (
                  <RoutineGrid key={group.key} group={group} showLabel={dayView.groups.length > 1} externals={groupIndex === 0 ? dayView.externals : null}
                    meetings={dayMeetings} statusById={statusById} showWarnings={showWarnings} selectedId={selectedId} related={related}
                    matches={matches} fits={fits} dragging={dragging} dropTarget={dropTarget} dropPreview={dropPreview}
                    onSelect={(m, el) => { trigger.current = el; setPanel({ kind: "edit", meetingId: m.id }); setTab("class"); }}
                    onAdd={(batchId, slot, el) => {
                      trigger.current = el;
                      const fitting = fitGroup && fits.has(`${batchId}:${slot.start}`) ? fitGroup.template.teachingGroupId : undefined;
                      setPanel({ kind: "new", day, batchId, start: slot.start, end: slot.end, groupId: fitting });
                      setTab("class");
                    }}
                    onDragStart={(m) => setDragging(m)}
                    onDragEnd={() => { setDragging(null); setDropTarget(null); setDropPreview(null); }}
                    onDragOverCell={(batchId, slot) => {
                      const m = draggingRef.current;
                      if (!m || !m.audiences.some((a) => a.batchId === batchId)) return false;
                      if (m.dayOfWeek === day && m.startMinutes === slot.start) { setDropTarget(null); return false; }
                      const key = `${batchId}:${slot.start}`;
                      if (key !== dropTarget) { setDropTarget(key); setDropPreview(previewMove(m, day, slot.start)); }
                      return true;
                    }}
                    onDrop={(batchId, slot) => {
                      const m = draggingRef.current;
                      if (m && m.audiences.some((a) => a.batchId === batchId)) move(m, day, slot.start);
                      setDragging(null); setDropTarget(null); setDropPreview(null);
                    }} />
                )) : (
                  <p className="rounded-lg border border-dashed border-[var(--color-line)] p-6 text-[13px] text-ink-2">
                    No periods are set for this term yet. <Link href="/routine/periods" className="font-semibold text-[var(--color-pine)] underline underline-offset-2">Set up days and periods</Link>
                  </p>
                )}
                <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted">
                  <span>Green edge: class</span><span>Gold edge: merged with other batches (stored once)</span><span>Clay edge and “Clash”: must be fixed</span><span>Drag a class to another time or day tab to move it</span><Link href="/routine/periods" className="font-semibold text-[var(--color-pine)] underline underline-offset-2">Change days and periods</Link>
                </p>
              </div>
              <div className="lg:hidden">
                {dayView ? <RoutineAgenda day={dayView} meetings={dayMeetings} statusById={statusById} showWarnings={showWarnings} matches={matches}
                  onSelect={(m, el) => { trigger.current = el; setPanel({ kind: "edit", meetingId: m.id }); setTab("class"); }}
                  onAdd={(batchId, el) => {
                    const slot = dayView.groups.find((group) => group.rows.some((row) => row.batch.id === batchId && !row.unplanned))?.slots[0];
                    if (!slot) return;
                    trigger.current = el; setPanel({ kind: "new", day, batchId, start: slot.start, end: slot.end }); setTab("class");
                  }} /> : null}
                {unplaced.length || dayIssues.some((i) => i.severity === "blocker") ? (
                  <button type="button" onClick={(event) => { trigger.current = event.currentTarget; setPanel(null); setTab("attention"); dialog.current?.showModal(); }}
                    className="mt-3 w-full rounded-md border border-[var(--color-line)] bg-sheet py-2.5 text-[13.5px] font-medium">Needs attention</button>
                ) : null}
              </div>
            </div>
            {docked ? (
              <aside aria-labelledby={headingId} className="sticky top-[72px] max-h-[calc(100vh-88px)] overflow-y-auto rounded-lg border border-[var(--color-line)] bg-sheet"
                onKeyDown={(event) => { if (event.key === "Escape" && panel) { event.preventDefault(); closePanel(); } }}>
                <div role="tablist" aria-label="Side panel" className="flex border-b border-[var(--color-line-soft)]">
                  <button type="button" role="tab" aria-selected={tab === "class" && !!panel} disabled={!panel} onClick={() => setTab("class")}
                    className={`flex-1 border-b-2 px-3 py-2.5 text-[13px] ${tab === "class" && panel ? "border-[var(--color-pine)] font-semibold" : "border-transparent text-ink-2"} disabled:text-muted`}>
                    {panel?.kind === "new" ? "New class" : "Selected class"}
                  </button>
                  <button type="button" role="tab" aria-selected={tab === "attention" || !panel} onClick={() => { setPanel(null); setTab("attention"); }}
                    className={`flex-1 border-b-2 px-3 py-2.5 text-[13px] ${tab === "attention" || !panel ? "border-[var(--color-pine)] font-semibold" : "border-transparent text-ink-2"}`}>
                    Needs attention · {dayIssues.filter((i) => i.severity === "blocker").length + unplaced.length}
                  </button>
                </div>
                <div role="tabpanel">{panelBody}</div>
              </aside>
            ) : null}
          </div>
          {!docked ? (
            // React passes a nested confirmation dialog's cancel/close events up to here; only the drawer's own close the panel (BUG-27).
            <dialog ref={dialog} aria-labelledby={headingId} onCancel={(event) => { if (event.target !== dialog.current) return; event.preventDefault(); closePanel(); dialog.current?.close(); }}
              onClose={(event) => { if (event.target === dialog.current && panel) closePanel(); }}
              className="no-print m-0 ml-auto h-full max-h-none w-full max-w-[420px] border-0 border-l border-[var(--color-line)] bg-sheet p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-[rgba(16,29,22,0.35)] max-sm:max-w-none">
              <div className="flex justify-end border-b border-[var(--color-line-soft)] px-2 py-1.5">
                <button type="button" onClick={() => { dialog.current?.close(); closePanel(); }} className="rounded px-2 py-1 text-[13px] font-medium">Close</button>
              </div>
              {panelBody}
            </dialog>
          ) : null}
        </>
      )}
    </div>
  );
}

function fmtClock(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return `${((hours + 11) % 12) + 1}:${String(minutes % 60).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

function Segmented({ label, options, value, onSelect }: { label: string; options: Array<[string, string]>; value: string; onSelect: (value: string) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[7px] border border-[var(--color-line)] bg-sheet p-0.5">
      {options.map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onSelect(key)}
          className={`rounded-[5px] px-3 py-1.5 text-[13px] font-medium ${value === key ? "bg-[var(--color-ink)] text-white" : "text-ink-2 hover:bg-wash"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** Print, CSV and the official package, for the page header. */
export function RoutineExportMenu({ selection }: { selection: RoutineSelection }) {
  const query = new URLSearchParams({ stream: selection.stream, view: selection.view, day: String(selection.day), batch: selection.batchId ? String(selection.batchId) : "all" });
  return (
    <details className="relative">
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-md border border-[var(--color-line)] bg-sheet px-3.5 text-[13.5px] font-medium">Print &amp; export <ChevronDown size={14} aria-hidden="true" /></summary>
      <div className="absolute right-0 z-30 mt-1 w-56 rounded-md border border-[var(--color-line)] bg-white p-1 text-[13px] shadow-[0_12px_28px_-18px_rgba(16,29,22,0.5)]">
        <button type="button" onClick={() => window.print()} className="block w-full rounded px-2.5 py-1.5 text-left hover:bg-wash">Print this view</button>
        <a href={`/routine/export?${query.toString()}`} className="block rounded px-2.5 py-1.5 hover:bg-wash">Download CSV</a>
        <a href="/routine/official" className="block rounded px-2.5 py-1.5 hover:bg-wash">Official routine package</a>
      </div>
    </details>
  );
}
