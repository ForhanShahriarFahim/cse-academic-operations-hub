"use client";

import { useRef, useState, useTransition } from "react";
import {
  AlertTriangle, Asterisk, ChevronDown, CirclePlus, Clock3, Eye,
  Landmark, Pencil, ShieldAlert, Trash2, Users, X,
} from "lucide-react";
import { DAY_NAMES, fmtRange, fmtRange24, overlaps, parseTimeToMinutes } from "@/lib/time";
import { sharingLabel, type MeetingView, type ExternalCommitmentView } from "@/lib/serialize";
import type { GroupCoverage } from "@/lib/data";
import type { RoutineBatch, RoutineProjection } from "@/lib/routine-projection";
import { useConfirm } from "@/components/confirm-dialog";
import {
  createMeetingAction, moveMeetingAction, deleteMeetingAction, type ActionResult,
} from "@/lib/actions";

interface GroupOption {
  id: number;
  courseCode: string;
  courseTitle: string;
  courseType: string;
  audience: string;
  status: string;
  deliveryMode: string;
  batchIds: number[];
}

interface TeacherOption {
  id: number; shortCode: string; fullName: string;
  homeDepartmentCode: string | null; designation: string | null;
}

interface RoomOption {
  id: number; code: string; roomType: string; capacity: number | null;
  owningDepartmentCode: string | null; building: string;
}

interface BreakInfo {
  id: number; name: string; scope: string; stream: string | null;
  dayOfWeek: number | null; startMinutes: number; endMinutes: number;
}

interface Props {
  projection: RoutineProjection;
  groups: GroupOption[];
  teachers: TeacherOption[];
  rooms: RoomOption[];
  coverage: GroupCoverage[];
}

const HIGHLIGHT_DOT: Record<string, string> = {
  blue: "bg-sky-500",
  green: "bg-emerald-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
};

export function RoutineBuilder(props: Props) {
  const [dense, setDense] = useState(false);
  const [query, setQuery] = useState("");
  const [showTracker, setShowTracker] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [addState, setAddState] = useState<{
    batchId: number; slotStart: number; slotEnd: number; presetGroupId?: number;
  } | null>(null);
  const [editMeeting, setEditMeeting] = useState<MeetingView | null>(null);
  const [, startTransition] = useTransition();

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4200);
  }

  const { projection } = props;
  const stream = projection.selection.stream;
  const dayView = projection.days[0];
  const day = dayView?.dayOfWeek ?? projection.selection.day;
  const slots = dayView?.slots ?? [];
  const rows = dayView?.rows.map((row) => row.batch) ?? [];
  const breakColumns = dayView?.breaks ?? [];
  const dayMeetings = projection.exportMeetings.map((item) => item.meeting).filter((meeting) => meeting.dayOfWeek === day);
  const dayExternals = dayView?.externals ?? [];

  function meetingsFor(batchId: number, slot: { start: number; end: number }) {
    return dayMeetings.filter(
      (m) =>
        m.audiences.some((a) => a.batchId === batchId) &&
        overlaps(m.startMinutes, m.endMinutes, slot.start, slot.end),
    );
  }
  function offGridMeetings(batchId: number) {
    return dayMeetings.filter(
      (m) =>
        m.audiences.some((a) => a.batchId === batchId) &&
        !slots.some((s) => overlaps(m.startMinutes, m.endMinutes, s.start, s.end)),
    );
  }
  function isFirstOverlappedSlot(m: MeetingView, slot: { start: number; end: number }) {
    const first = slots.find((s) => overlaps(m.startMinutes, m.endMinutes, s.start, s.end));
    return first?.start === slot.start;
  }
  function matches(m: MeetingView) {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      m.courseCode.toLowerCase().includes(q) ||
      m.courseTitle.toLowerCase().includes(q) ||
      m.teachers.some((t) => t.shortCode.toLowerCase().includes(q) || t.fullName.toLowerCase().includes(q)) ||
      m.rooms.some((r) => r.code.toLowerCase().includes(q))
    );
  }

  const isHscExceptionDay = stream === "HSC" && day === 6;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter course, teacher, room…"
          className="w-56 rounded-md border border-[var(--color-line)] bg-white px-3 py-1.5 text-[12.5px] outline-none placeholder:text-muted focus:border-[var(--color-pine)]"
        />
        <button
          onClick={() => setDense((v) => !v)}
          className="rounded-md border border-[var(--color-line)] bg-white px-3 py-1.5 text-[12px] font-semibold text-muted hover:text-[var(--color-pine)]"
        >
          {dense ? "Comfortable" : "Compact"} density
        </button>
        <span className="ml-auto flex items-center gap-3 text-[11.5px] text-muted">
          <span className="flex items-center gap-1">
            <ShieldAlert size={13} className={projection.issueCount.blockers ? "text-[var(--color-clay)]" : "text-[var(--color-pine)]"} />
            {projection.issueCount.blockers} blockers
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle size={13} className="text-gold-text" />
            {projection.issueCount.warnings} advisories
          </span>
          <a href="/public/routine" target="_blank" className="flex items-center gap-1 font-semibold text-[var(--color-pine)] hover:underline">
            <Eye size={13} /> Public view
          </a>
        </span>
      </div>

      {/* Banners */}
      {isHscExceptionDay && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10 px-3 py-2 text-[12px] text-gold-text">
          <Asterisk size={14} className="mt-0.5 shrink-0" />
          <span>
            <strong>Exception day.</strong> Regular HSC teaching is Saturday–Tuesday. Friday entries exist only
            where an approved exception is recorded (e.g. 29B). Adding a Friday class requires the
            exception flag and a note — the server rejects unapproved placements.
          </span>
        </div>
      )}
      {stream === "DIPLOMA" && day === 0 && (
        <div className="flex items-start gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-[12px] text-sky-900">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            <strong>Provisional headers.</strong> Saturday morning slot headers require source review.
            The permitted window 09:00–17:00 is coordinator guidance; visible populated classes are afternoon.
            The blue source label “12:00 PM–2:30 PM” is treated as a class-time exception, not a prayer break.
          </span>
        </div>
      )}

      {/* Unscheduled tracker */}
      <div className="no-print ruled rounded-lg">
        <button
          onClick={() => setShowTracker((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12.5px] font-semibold text-ink-2"
        >
          <ChevronDown size={14} className={`transition-transform ${showTracker ? "" : "-rotate-90"}`} />
          Requirements needing attention
          <span className="rounded-full bg-[var(--color-clay)]/10 px-2 py-0.5 text-[10.5px] font-bold text-[var(--color-clay)]">
            {props.coverage.length}
          </span>
        </button>
        {showTracker && (
          <div className="flex flex-wrap gap-2 border-t border-[var(--color-line-soft)] px-4 py-3">
            {props.coverage.map((c) => (
              <button
                key={c.teachingGroupId}
                disabled={c.deliveryMode === "teacher_managed"}
                onClick={() => {
                  const g = props.groups.find((g) => g.id === c.teachingGroupId);
                  if (!g || g.batchIds.length === 0) return;
                  const s = slots[0];
                  setAddState({ batchId: g.batchIds[0], slotStart: s.start, slotEnd: s.end, presetGroupId: g.id });
                }}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                  c.status === "vacancy"
                    ? "border-[var(--color-clay)]/30 bg-[var(--color-clay)]/5 text-[var(--color-clay)]"
                    : c.status === "teacher_managed"
                      ? "cursor-default border-black/10 bg-black/5 text-muted"
                      : "border-[var(--color-gold)]/30 bg-[var(--color-gold)]/5 text-gold-text hover:bg-[var(--color-gold)]/15"
                }`}
                title={c.notes ?? ""}
              >
                {c.deliveryMode === "teacher_managed" ? <Asterisk size={12} /> : <CirclePlus size={12} />}
                <span className="font-mono font-semibold">{c.courseCode}</span>
                <span>{c.audience}</span>
                <span className="text-[10px] opacity-75">
                  {c.status === "vacancy" ? "UT vacancy" :
                    c.deliveryMode === "teacher_managed" ? "teacher-managed" :
                    `${c.scheduledMinutes}/${c.expectedWeeklyMinutes ?? "?"} min`}
                </span>
              </button>
            ))}
            {props.coverage.length === 0 && (
              <p className="text-[12px] text-muted">All approved requirements are fully scheduled.</p>
            )}
          </div>
        )}
      </div>

      {/* Grid */}
      <div role="region" aria-label="Routine grid" tabIndex={0} className="table-region ruled overflow-x-auto rounded-lg">
        <table className={`routine-table ${dense ? "text-[11px]" : "text-[12px]"}`}>
          <thead>
            <tr>
              <th className="w-[86px] px-2 py-2 text-left">
                <span className="micro-label">Batch</span>
              </th>
              <th className="w-[110px] px-2 py-2 text-left">
                <span className="micro-label">Custom time</span>
              </th>
              {slots.map((s, i) => (
                <SlotHeader key={`${s.start}`} start={s.start} end={s.end} breaksAfter={breakColumns.filter((b) => b.afterSlot === i)} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((b, rowIdx) => (
              <tr key={b.id} className={rowIdx % 2 === 0 ? "bg-sheet" : "bg-wash"}>
                <td className="px-2 py-1.5">
                  <p className="font-mono text-[12.5px] font-semibold">{stream === "HSC" ? "HSC" : "DIP"}-{b.label}</p>
                  <p className="text-[10px] text-muted">Sem {b.semester ?? "?"} · {b.studentCount ?? "?"} st.</p>
                </td>
                <td className="px-1.5 py-1.5">
                  {offGridMeetings(b.id).map((m) => (
                    <MeetingCard key={m.id} meeting={m} offGrid dense={dense} dim={!matches(m)}
                      onClick={() => setEditMeeting(m)} />
                  ))}
                  {offGridMeetings(b.id).length === 0 && <span className="text-[10px] text-muted">—</span>}
                </td>
                {slots.map((s, i) => {
                  const cell = meetingsFor(b.id, s);
                  const full = cell.filter((m) => isFirstOverlappedSlot(m, s));
                  const cont = cell.filter((m) => !isFirstOverlappedSlot(m, s));
                  return (
                    <SlotCell key={s.start} breakAfter={breakColumns.find((x) => x.afterSlot === i)}
                      onAdd={() => setAddState({ batchId: b.id, slotStart: s.start, slotEnd: s.end })}>
                      {full.map((m) => (
                        <MeetingCard key={m.id} meeting={m} slotStart={s.start} slotEnd={s.end} dense={dense}
                          dim={!matches(m)} onClick={() => setEditMeeting(m)} />
                      ))}
                      {cont.map((m) => (
                        <button key={m.id} onClick={() => setEditMeeting(m)}
                          className="mt-1 block w-full rounded border border-dashed border-[var(--color-line)] bg-wash px-1.5 py-1 text-left text-[10px] italic text-muted hover:border-[var(--color-pine)]">
                          ◂ {m.courseCode} continues ({fmtRange(m.startMinutes, m.endMinutes)})
                        </button>
                      ))}
                    </SlotCell>
                  );
                })}
              </tr>
            ))}

            {/* OD summary row — generated from structured external commitments */}
            <tr className="bg-wash">
              <td className="px-2 py-1.5">
                <p className="font-mono text-[12px] font-bold text-[var(--color-clay)]">OD</p>
                <p className="text-[9.5px] leading-tight text-muted">Other Departments</p>
              </td>
              <td className="px-1.5 py-1.5">
                {dayExternals
                  .filter((e) => !slots.some((s) => overlaps(e.startMinutes!, e.endMinutes!, s.start, s.end)))
                  .map((e) => <OdChip key={e.id} e={e} />)}
              </td>
              {slots.map((s, i) => (
                <SlotCell key={s.start} breakAfter={breakColumns.find((x) => x.afterSlot === i)} isOd>
                  {dayExternals
                    .filter((e) => overlaps(e.startMinutes!, e.endMinutes!, s.start, s.end))
                    .map((e) => <OdChip key={e.id} e={e} />)}
                </SlotCell>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-[var(--color-line)] bg-wash px-4 py-3 text-[11.5px] text-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm border-l-[3px] border-[var(--color-pine)] bg-white" /> Standard class</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm border-l-[3px] border-[var(--color-gold)] bg-white" /> Merged / shared (stored once)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm border-l-[3px] border-[var(--color-clay)] bg-white" /> Reconciliation pending</span>
        <span className="flex items-center gap-1.5"><Clock3 size={12} className="text-gold-text" /> Custom timing differs from column</span>
        <span className="flex items-center gap-1.5"><Asterisk size={12} className="text-gold-text" /> Approved window exception / teacher-managed</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500" /> Coloured dots preserve source highlights — meaning is <em>unconfirmed</em>, never conflict status.
        </span>
        <span className="ml-auto flex items-center gap-1.5"><Landmark size={12} /> {projection.source.termName} · draft workspace</span>
      </div>

      {/* Dialogs */}
      {addState && (
        <AddMeetingDialog
          state={addState}
          day={day}
          groups={props.groups}
          batches={projection.source.batches}
          teachers={props.teachers}
          rooms={props.rooms}
          onClose={() => setAddState(null)}
          onResult={(r) => { if (r.ok) { setAddState(null); } notify(r.message); return r.ok; }}
        />
      )}
      {editMeeting && (
        <EditMeetingDialog
          meeting={editMeeting}
          onClose={() => setEditMeeting(null)}
          onDone={(msg) => { setEditMeeting(null); notify(msg); }}
          onError={(msg) => notify(msg)}
        />
      )}
      {toast && (
        <div className="no-print fixed bottom-5 right-5 z-50 max-w-sm rounded-md border border-[var(--color-line)] bg-[var(--color-ink)] px-4 py-2.5 text-[12.5px] text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SlotHeader({ start, end, breaksAfter }: { start: number; end: number; breaksAfter: BreakInfo[] }) {
  return (
    <>
      <th className="min-w-[128px] px-2 py-2 text-left">
        <span className="font-mono text-[12px] font-semibold text-[var(--color-pine)]">{fmtRange24(start, end)}</span>
        <span className="block text-[10px] font-normal text-muted">{fmtRange(start, end)}</span>
      </th>
      {breaksAfter.map((b) => (
        <th key={b.id} className="break-column w-[34px] px-0 py-2 text-center">
          <span className="inline-block rotate-180 text-[9px] font-bold uppercase tracking-[0.18em] text-muted [writing-mode:vertical-rl]">
            {b.name}
          </span>
        </th>
      ))}
    </>
  );
}

function SlotCell({
  children, onAdd, breakAfter, isOd,
}: {
  children?: React.ReactNode;
  onAdd?: () => void;
  breakAfter?: BreakInfo;
  isOd?: boolean;
}) {
  const hasContent = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <>
      <td
        className={`group px-1.5 py-1.5 align-top ${onAdd && !isOd ? "cursor-pointer hover:bg-[var(--color-pine)]/[0.045]" : ""}`}
        onClick={onAdd && !isOd && !hasContent ? onAdd : undefined}
      >
        {children}
        {onAdd && !isOd && !hasContent && (
          <span className="invisible flex h-7 items-center justify-center rounded text-[var(--color-pine)]/60 group-hover:visible">
            <CirclePlus size={14} />
          </span>
        )}
      </td>
      {breakAfter ? <td className="break-column w-[34px]" /> : null}
    </>
  );
}

function MeetingCard({
  meeting: m, slotStart, slotEnd, dense, dim, offGrid, onClick,
}: {
  meeting: MeetingView;
  slotStart?: number;
  slotEnd?: number;
  dense: boolean;
  dim: boolean;
  offGrid?: boolean;
  onClick: () => void;
}) {
  const shared = sharingLabel(m);
  const custom =
    offGrid ||
    m.customTimeLabel != null ||
    (slotStart != null && (m.startMinutes !== slotStart || m.endMinutes !== slotEnd));
  const cls = m.pendingReconciliation
    ? "meeting-card meeting-pending border-dashed"
    : shared
      ? "meeting-card meeting-shared"
      : "meeting-card";
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`${cls} ${dim ? "opacity-35" : ""} mt-1 block w-full px-2 py-1.5 text-left first:mt-0`}
      title={`${m.courseTitle} — click to edit`}
    >
      <span className="flex items-center gap-1.5">
        {m.highlightColor && (
          <span className={`h-2 w-2 shrink-0 rounded-full ${HIGHLIGHT_DOT[m.highlightColor] ?? "bg-slate-400"}`}
            title="Source highlight preserved — meaning unconfirmed" />
        )}
        <span className={`font-mono font-semibold ${dense ? "text-[11px]" : "text-[12px]"}`}>{m.courseCode}</span>
        {m.isException && <Asterisk size={12} className="shrink-0 text-gold-text" />}
        {m.pendingReconciliation && <AlertTriangle size={11} className="shrink-0 text-[var(--color-clay)]" />}
      </span>
      <span className={`mt-0.5 flex flex-wrap items-center gap-x-2 text-ink-2 ${dense ? "text-[10px]" : "text-[10.5px]"}`}>
        <span className="font-mono">{m.teachers.map((t) => t.shortCode).join("+") || "UT"}</span>
        <span className="font-mono text-muted">{m.rooms.map((r) => r.code).join("/")}</span>
        {m.audiences.length > 1 && (
          <span className="text-muted">
            <Users size={10} className="mr-0.5 inline" />
            {m.audiences.map((a) => `${a.stream === "HSC" ? "H" : "D"}-${a.batchLabel}`).join("+")}
          </span>
        )}
      </span>
      {(shared || custom) && (
        <span className="mt-1 flex flex-wrap gap-1">
          {shared && (
            <span className="rounded-full bg-[var(--color-gold)]/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-gold-text">
              {shared}
            </span>
          )}
          {custom && (
            <span className="flex items-center gap-0.5 rounded-full bg-[var(--color-pine)]/10 px-1.5 py-px text-[9px] font-bold text-[var(--color-pine)]">
              <Clock3 size={9} />
              {m.customTimeLabel ?? fmtRange(m.startMinutes, m.endMinutes)}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

function OdChip({ e }: { e: ExternalCommitmentView }) {
  return (
    <div
      className="mt-1 rounded border border-[var(--color-clay)]/25 bg-white/70 px-1.5 py-1 text-[10px] leading-snug first:mt-0"
      title={e.notes ?? `${e.kind} — level ${e.completenessLevel}`}
    >
      <span className="font-mono font-bold text-[var(--color-clay)]">{e.counterpartDepartment}</span>
      {e.kind === "room_reservation" ? (
        <span className="block text-muted">room {e.roomCode ?? "?"} only</span>
      ) : (
        <span className="block text-muted">
          {e.teacherShortCode ?? "teacher ?"}{e.courseLabel ? ` · ${e.courseLabel.split(" ")[0]}` : ""}
        </span>
      )}
      <span className="block font-mono text-[9px] text-muted">
        {fmtRange(e.startMinutes!, e.endMinutes!)} · L{e.completenessLevel}
        {e.verificationStatus !== "verified" ? " · unverified" : ""}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--color-line)] bg-sheet shadow-2xl ${wide ? "w-[720px]" : "w-[520px]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-line-soft)] px-4 py-3">
          <h3 className="font-display text-[16px] font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-black/5 hover:text-black">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function AddMeetingDialog({
  state, day, groups, batches, teachers, rooms, onClose, onResult,
}: {
  state: { batchId: number; slotStart: number; slotEnd: number; presetGroupId?: number };
  day: number;
  groups: GroupOption[];
  batches: RoutineBatch[];
  teachers: TeacherOption[];
  rooms: RoomOption[];
  onClose: () => void;
  onResult: (r: ActionResult) => boolean;
}) {
  const batch = batches.find((b) => b.id === state.batchId);
  const [groupId, setGroupId] = useState<number>(state.presetGroupId ?? 0);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const batchGroups = groups.filter((g) => g.batchIds.includes(state.batchId) && g.deliveryMode !== "teacher_managed");
  const selectedGroup = groups.find((g) => g.id === groupId);
  const needsLab = selectedGroup?.courseType === "sessional";
  const shownRooms = rooms.filter((r) => (needsLab ? r.roomType === "lab" : true))
    .sort((a, b) => (a.owningDepartmentCode === "CSE" ? 0 : 1) - (b.owningDepartmentCode === "CSE" ? 0 : 1));

  return (
    <Modal title={`Schedule — ${batch ? `${batch.stream}-${batch.label}` : ""} · ${DAY_NAMES[day]}`} onClose={onClose} wide>
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(formRef.current!);
          fd.set("dayOfWeek", String(day));
          startTransition(async () => {
            const r = await createMeetingAction(fd);
            setResult(r);
            onResult(r);
          });
        }}
        className="space-y-4"
      >
        <input type="hidden" name="dayOfWeek" value={day} />
        <div>
          <label className="micro-label mb-1 block">Teaching group (course + audience)</label>
          <select
            name="teachingGroupId"
            required
            value={groupId || ""}
            onChange={(e) => setGroupId(Number(e.target.value))}
            className="w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 py-2 text-[12.5px]"
          >
            <option value="" disabled>Select teaching group…</option>
            {batchGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.courseCode} · {g.courseTitle} — {g.audience} [{g.status}]
              </option>
            ))}
            {state.presetGroupId == null && groups
              .filter((g) => !g.batchIds.includes(state.batchId) && g.deliveryMode !== "teacher_managed")
              .map((g) => (
                <option key={g.id} value={g.id} disabled>
                  {g.courseCode} — {g.audience} (select from its own batch row)
                </option>
              ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="micro-label mb-1 block">Start time</label>
            <input name="startTime" required defaultValue={fmt24(state.slotStart)} placeholder="e.g. 9:30 AM"
              className="w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 py-2 font-mono text-[12.5px]" />
          </div>
          <div>
            <label className="micro-label mb-1 block">End time</label>
            <input name="endTime" required defaultValue={fmt24(state.slotEnd)} placeholder="e.g. 10:45 AM"
              className="w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 py-2 font-mono text-[12.5px]" />
          </div>
        </div>
        <p className="-mt-2 text-[10.5px] text-muted">Exact times are authoritative — a 75-minute class may overlap two 60-minute slots by design.</p>

        <div>
          <label className="micro-label mb-1 block">Teachers (exact short codes — IM ≠ IMN)</label>
          <div className="grid max-h-36 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-[var(--color-line-soft)] p-2">
            {teachers.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12px] hover:bg-black/[0.03]">
                <input type="checkbox" name="teacherIds" value={t.id} className="accent-[var(--color-pine)]" />
                <span className="font-mono font-semibold">{t.shortCode}</span>
                <span className="truncate text-muted">{t.fullName}{t.homeDepartmentCode !== "CSE" ? ` (${t.homeDepartmentCode})` : ""}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="micro-label mb-1 block">Rooms{needsLab ? " (sessional — labs only)" : ""}</label>
          <div className="grid max-h-32 grid-cols-3 gap-1 overflow-y-auto rounded-md border border-[var(--color-line-soft)] p-2">
            {shownRooms.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12px] hover:bg-black/[0.03]">
                <input type="checkbox" name="roomIds" value={r.id} className="accent-[var(--color-pine)]" />
                <span className="font-mono font-semibold">{r.code}</span>
                <span className="text-muted">{r.roomType}{r.capacity ? ` · ${r.capacity}` : ""}{r.owningDepartmentCode !== "CSE" ? " (ext)" : ""}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/5 p-2.5">
          <input id="isException" type="checkbox" name="isException" className="mt-0.5 accent-[var(--color-gold)]" />
          <label htmlFor="isException" className="text-[12px] text-gold-text">
            <strong>Approved window exception</strong> (e.g. HSC Friday). Requires a note explaining approval.
            <input name="exceptionNote" placeholder="Exception note / approval reference…"
              className="mt-1.5 w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-1.5 text-[12px]" />
          </label>
        </div>

        <div>
          <label className="micro-label mb-1 block">Custom time label (optional, display only)</label>
          <input name="customTimeLabel" placeholder="e.g. 10:00 – 11:15 AM*"
            className="w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 py-2 font-mono text-[12px]" />
        </div>

        {result && !result.ok && result.issues && (
          <ul className="space-y-1 rounded-md border border-[var(--color-clay)]/30 bg-[var(--color-clay)]/5 p-2.5">
            {result.issues.map((i, k) => (
              <li key={k} className="flex items-start gap-1.5 text-[11.5px] text-[var(--color-clay)]">
                <ShieldAlert size={12} className="mt-0.5 shrink-0" />
                <span><strong>{i.title}.</strong> {i.detail}</span>
              </li>
            ))}
          </ul>
        )}
        {result?.ok && result.issues && result.issues.length > 0 && (
          <ul className="space-y-1 rounded-md border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/5 p-2.5">
            {result.issues.filter(i => i.severity === "warning").map((i, k) => (
              <li key={k} className="flex items-start gap-1.5 text-[11.5px] text-gold-text">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span><strong>{i.title}.</strong> {i.detail}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--color-line-soft)] pt-3">
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--color-line)] px-3.5 py-2 text-[12.5px] font-semibold text-muted">
            Cancel
          </button>
          <button disabled={pending}
            className="rounded-md bg-[var(--color-pine)] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[var(--color-pine-2)] disabled:opacity-50">
            {pending ? "Validating…" : "Validate & schedule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditMeetingDialog({
  meeting: m, onClose, onDone, onError,
}: {
  meeting: MeetingView;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [ask, confirmDialog] = useConfirm();
  const [day, setDay] = useState(m.dayOfWeek);
  const [start, setStart] = useState(fmt24(m.startMinutes));
  const [end, setEnd] = useState(fmt24(m.endMinutes));
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function move() {
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    if (s == null || e == null) { onError("Enter valid times."); return; }
    startTransition(async () => {
      const r = await moveMeetingAction(m.id, day, s, e);
      setResult(r);
      if (r.ok) onDone(r.message);
    });
  }

  return (
    <Modal title={`${m.courseCode} — ${m.courseTitle}`} onClose={onClose}>{confirmDialog}
      <div className="space-y-3 text-[12.5px]">
        <div className="rounded-md border border-[var(--color-line-soft)] bg-wash p-3">
          <p><span className="micro-label mr-2">Audience</span>{m.audiences.map((a) => `${a.stream}-${a.batchLabel}`).join(" + ")}{m.externalAudienceLabel ? ` + ${m.externalAudienceLabel}` : ""}</p>
          <p className="mt-1"><span className="micro-label mr-2">Teachers</span>{m.teachers.map((t) => `${t.shortCode} (${t.fullName})`).join(", ") || "UT — vacancy"}</p>
          <p className="mt-1"><span className="micro-label mr-2">Rooms</span>{m.rooms.map((r) => `${r.code} (${r.roomType}, cap ${r.capacity ?? "?"})`).join(", ")}</p>
          <p className="mt-1"><span className="micro-label mr-2">Schedule</span>{DAY_NAMES[m.dayOfWeek]} · {fmtRange(m.startMinutes, m.endMinutes)}</p>
          {m.exceptionNote && <p className="mt-1 text-gold-text"><Asterisk size={11} className="mr-1 inline" />{m.exceptionNote}</p>}
          {m.pendingReconciliation && (
            <p className="mt-1 flex items-start gap-1 text-[var(--color-clay)]">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              Cross-stream timing reconciliation pending — one canonical event is stored; confirm the authoritative time.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="micro-label mb-1 block">Day</label>
            <select value={day} onChange={(e) => setDay(Number(e.target.value))}
              className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-2 text-[12px]">
              {DAY_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="micro-label mb-1 block">Start</label>
            <input value={start} onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-2 font-mono text-[12px]" />
          </div>
          <div>
            <label className="micro-label mb-1 block">End</label>
            <input value={end} onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-2 font-mono text-[12px]" />
          </div>
        </div>

        {result && !result.ok && (
          <ul className="space-y-1 rounded-md border border-[var(--color-clay)]/30 bg-[var(--color-clay)]/5 p-2.5">
            <li className="flex items-start gap-1.5 text-[11.5px] text-[var(--color-clay)]">
              <ShieldAlert size={12} className="mt-0.5 shrink-0" /> {result.message}
            </li>
            {result.issues?.map((i, k) => (
              <li key={k} className="flex items-start gap-1.5 text-[11.5px] text-[var(--color-clay)]">
                <Pencil size={12} className="mt-0.5 shrink-0" />
                <span><strong>{i.title}.</strong> {i.detail}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-between gap-2 border-t border-[var(--color-line-soft)] pt-3">
          <button
            disabled={pending}
            onClick={async () => {
              if (!await ask({ title: `Delete ${m.courseCode} on ${DAY_NAMES[m.dayOfWeek]}?`, body: "This class is removed from the working draft for every stream, teacher and room view. The published routine is not affected.", confirmLabel: "Delete class" })) return;
              startTransition(async () => {
                const r = await deleteMeetingAction(m.id);
                if (r.ok) onDone(r.message); else onError(r.message);
              });
            }}
            className="flex items-center gap-1.5 rounded-md border border-[var(--color-clay)]/40 px-3 py-2 text-[12px] font-semibold text-[var(--color-clay)] hover:bg-[var(--color-clay)]/5"
          >
            <Trash2 size={13} /> Delete
          </button>
          <button disabled={pending} onClick={move}
            className="rounded-md bg-[var(--color-pine)] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[var(--color-pine-2)] disabled:opacity-50">
            {pending ? "Validating…" : "Move / retime"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function fmt24(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
