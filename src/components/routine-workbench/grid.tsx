"use client";

import { Fragment } from "react";
import { AlertTriangle, XCircle } from "lucide-react";
import { fmtRange } from "@/lib/time";
import type { ExternalCommitmentView, MeetingView } from "@/lib/serialize";
import type { RoutineDayProjection } from "@/lib/routine-projection";
import { matchesColumns, rowCells, type GridCell } from "@/lib/routine-workbench";

export type ClassStatus = "blocker" | "warning" | "clear";

export interface DropPreview { ok: boolean; reason: string }

export interface GridProps {
  day: RoutineDayProjection;
  meetings: MeetingView[];
  statusById: Map<number, ClassStatus>;
  showWarnings: boolean;
  selectedId: number | null;
  related: { meetingIds: Set<number>; externalIds: Set<number> };
  matches: (m: MeetingView) => boolean;
  fits: Map<string, string>;
  dragging: MeetingView | null;
  dropTarget: string | null;
  dropPreview: DropPreview | null;
  onSelect: (meeting: MeetingView, trigger: HTMLElement) => void;
  onAdd: (batchId: number, slotIndex: number, trigger: HTMLElement) => void;
  onDragStart: (meeting: MeetingView) => void;
  onDragEnd: () => void;
  onDragOverCell: (batchId: number, slotIndex: number) => boolean;
  onDrop: (batchId: number, slotIndex: number) => void;
}

const batchName = (stream: string, label: string) => `${stream === "HSC" ? "HSC" : "DIP"}-${label}`;
/** "9:30–10:45 AM", or "11:30 AM–12:45 PM" when the period changes. */
function clock(start: number, end: number): string {
  const part = (minutes: number) => `${((Math.floor(minutes / 60) + 11) % 12) + 1}:${String(minutes % 60).padStart(2, "0")}`;
  const period = (minutes: number) => (minutes < 12 * 60 ? "AM" : "PM");
  return period(start) === period(end) ? `${part(start)}–${part(end)} ${period(end)}` : `${part(start)} ${period(start)}–${part(end)} ${period(end)}`;
}

const visibleStatus = (status: ClassStatus | undefined, showWarnings: boolean): ClassStatus =>
  status === "blocker" || (status === "warning" && showWarnings) ? status : "clear";

export function RoutineGrid(props: GridProps) {
  const { day } = props;
  const slots = day.slots;
  const breakAfter = (index: number) => day.breaks.filter((b) => b.afterSlot === index);
  const breaksInside = (cell: GridCell) => day.breaks.filter((b) => b.afterSlot >= cell.first && b.afterSlot < cell.last).length;

  return (
    <div role="region" aria-label="Routine grid for the selected day" tabIndex={0} className="table-region overflow-auto rounded-lg border border-[var(--color-line)] bg-sheet">
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <caption className="sr-only">Classes by batch and time. Select a class to edit it, or an empty cell to add one.</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 top-0 z-[3] w-[96px] border-b border-r border-[var(--color-line)] bg-wash px-3 py-2 text-left font-semibold">Batch</th>
            {slots.map((slot, index) => (
              <Fragment key={slot.start}>
                <th scope="col" className="sticky top-0 z-[2] min-w-[150px] border-b border-r border-[var(--color-line-soft)] border-b-[var(--color-line)] bg-wash px-3 py-2 text-left font-semibold">
                  <span className="font-mono text-[12.5px]">{clock(slot.start, slot.end)}</span>
                </th>
                {breakAfter(index).map((b) => (
                  <th key={b.id} scope="col" className="break-column sticky top-0 z-[2] w-[26px] border-b border-r border-[var(--color-line)] px-0 py-2">
                    <span className="inline-block rotate-180 text-[11px] font-medium text-muted [writing-mode:vertical-rl]">{b.name}</span>
                  </th>
                ))}
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {day.rows.map(({ batch }) => {
            const rowMeetings = props.meetings.filter((m) => m.audiences.some((a) => a.batchId === batch.id));
            const cells = rowCells(rowMeetings, slots);
            return (
              <tr key={batch.id}>
                <th scope="row" className="sticky left-0 z-[1] border-b border-r border-[var(--color-line-soft)] bg-sheet px-3 py-2 text-left align-top font-normal">
                  <span className="block font-mono text-[13px] font-semibold">{batchName(batch.stream, batch.label)}</span>
                  {batch.semester ? <span className="text-[12px] text-muted">Semester {batch.semester}</span> : null}
                </th>
                {cells.map((cell) => {
                  const key = `${batch.id}:${cell.first}`;
                  const isTarget = props.dropTarget === key;
                  return (
                    <Fragment key={cell.first}>
                      <td
                        colSpan={cell.last - cell.first + 1 + breaksInside(cell)}
                        onDragOver={(event) => { if (props.onDragOverCell(batch.id, cell.first)) event.preventDefault(); }}
                        onDrop={(event) => { event.preventDefault(); props.onDrop(batch.id, cell.first); }}
                        className={`relative border-b border-r border-[var(--color-line-soft)] p-1.5 align-top ${isTarget ? (props.dropPreview?.ok ? "bg-pine-tint outline outline-2 -outline-offset-2 outline-[var(--color-pine)]" : "bg-clay-tint outline outline-2 -outline-offset-2 outline-[var(--color-clay)]") : ""}`}
                      >
                        {cell.meetings.map((m) => (
                          <ClassCard key={m.id} meeting={m} status={visibleStatus(props.statusById.get(m.id), props.showWarnings)} batchId={batch.id}
                            exact={matchesColumns(m, slots, cell)} selected={props.selectedId === m.id}
                            related={props.related.meetingIds.has(m.id)} dim={!props.matches(m)}
                            onSelect={props.onSelect} onDragStart={props.onDragStart} onDragEnd={props.onDragEnd} />
                        ))}
                        {cell.meetings.length === 0 ? (
                          <AddButton label={props.fits.get(key)} batch={batchName(batch.stream, batch.label)} time={clock(slots[cell.first].start, slots[cell.first].end)}
                            onClick={(trigger) => props.onAdd(batch.id, cell.first, trigger)} />
                        ) : null}
                        {isTarget && props.dropPreview ? (
                          <p className={`pointer-events-none absolute inset-x-1.5 bottom-1.5 z-10 rounded bg-white/95 px-1.5 py-0.5 text-[12px] font-semibold shadow-sm ${props.dropPreview.ok ? "text-[var(--color-pine)]" : "text-[var(--color-clay)]"}`}>{props.dropPreview.reason}</p>
                        ) : null}
                      </td>
                      {breakAfter(cell.last).map((b) => <td key={b.id} aria-hidden="true" className="break-column border-b border-r border-[var(--color-line-soft)]" />)}
                    </Fragment>
                  );
                })}
              </tr>
            );
          })}
          <tr>
            <th scope="row" className="sticky left-0 z-[1] border-r border-[var(--color-line-soft)] bg-wash px-3 py-2 text-left align-top font-normal">
              <span className="block text-[13px] font-semibold text-[var(--color-clay)]">Other departments</span>
              <span className="text-[12px] text-muted">Bookings</span>
            </th>
            {slots.map((slot, index) => (
              <Fragment key={slot.start}>
                <td className="border-r border-[var(--color-line-soft)] bg-wash p-1.5 align-top">
                  {day.externals.filter((e) => e.startMinutes != null && e.endMinutes != null && e.startMinutes < slot.end && e.endMinutes > slot.start
                    && (index === 0 || !(e.startMinutes < slots[index - 1].end && e.endMinutes! > slots[index - 1].start)))
                    .map((e) => <Booking key={e.id} booking={e} related={props.related.externalIds.has(e.id)} />)}
                </td>
                {breakAfter(index).map((b) => <td key={b.id} aria-hidden="true" className="break-column border-r border-[var(--color-line-soft)]" />)}
              </Fragment>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ClassCard({ meeting: m, status, batchId, exact, selected, related, dim, onSelect, onDragStart, onDragEnd }: {
  meeting: MeetingView; status: ClassStatus; batchId: number; exact: boolean; selected: boolean; related: boolean; dim: boolean;
  onSelect: GridProps["onSelect"]; onDragStart: GridProps["onDragStart"]; onDragEnd: GridProps["onDragEnd"];
}) {
  const others = m.audiences.filter((a) => a.batchId !== batchId).map((a) => batchName(a.stream, a.batchLabel));
  if (m.externalAudienceLabel) others.push(m.externalAudienceLabel);
  const edge = status === "blocker" ? "border-l-[var(--color-clay)] bg-[#fffaf7]" : others.length ? "border-l-[var(--color-gold)] bg-white" : "border-l-[var(--color-pine)] bg-white";
  const statusWord = status === "blocker" ? "Clash" : status === "warning" ? "Check" : null;
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(m.id)); onDragStart(m); }}
      onDragEnd={onDragEnd}
      onClick={(event) => onSelect(m, event.currentTarget)}
      aria-pressed={selected}
      aria-label={`${m.courseCode}, ${m.teachers.map((t) => t.shortCode).join(" and ") || "no teacher"}, ${m.rooms.map((r) => r.code).join(" and ") || "no room"}, ${fmtRange(m.startMinutes, m.endMinutes)}${statusWord ? `, ${statusWord === "Clash" ? "has a blocking clash" : "has a warning"}` : ""}${others.length ? `, merged with ${others.join(", ")}` : ""}`}
      className={`mb-1.5 block w-full cursor-pointer rounded-[5px] border border-l-[3px] border-[var(--color-line)] px-2 py-1.5 text-left last:mb-0 ${edge} ${selected ? "outline outline-2 outline-offset-1 outline-[var(--color-pine)]" : ""} ${related && !selected ? "shadow-[0_0_0_2px_var(--color-gold-tint),0_0_0_3px_var(--color-gold)]" : ""} ${dim ? "opacity-35" : ""}`}
    >
      <span className="flex items-center gap-1.5 font-mono text-[13px] font-semibold">
        {m.courseCode}
        {statusWord ? (
          <span className={`ml-auto inline-flex items-center gap-0.5 font-sans text-[11.5px] font-semibold ${status === "blocker" ? "text-[var(--color-clay)]" : "text-gold-text"}`}>
            {status === "blocker" ? <XCircle size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />}{statusWord}
          </span>
        ) : null}
      </span>
      <span className="mt-0.5 block font-mono text-[12px] text-ink-2">{m.teachers.map((t) => t.shortCode).join(" + ") || "No teacher"} · {m.rooms.map((r) => r.code).join(" / ") || "No room"}</span>
      {others.length ? <span className="mt-0.5 block text-[12px] text-muted">With {others.join(", ")}</span> : null}
      {!exact ? <span className="mt-1 inline-block rounded bg-pine-tint px-1.5 text-[11.5px] font-semibold text-[var(--color-pine)]">{fmtRange(m.startMinutes, m.endMinutes)}</span> : null}
      {m.isException ? <span className="mt-1 block text-[11.5px] font-semibold text-gold-text">Approved exception</span> : null}
      {related && !selected ? <span className="mt-1 block text-[11.5px] font-semibold text-gold-text">Same teacher or room</span> : null}
    </button>
  );
}

function AddButton({ label, batch, time, onClick }: { label?: string; batch: string; time: string; onClick: (trigger: HTMLElement) => void }) {
  return (
    <button type="button" onClick={(event) => onClick(event.currentTarget)}
      aria-label={label ? `${label} — add it to ${batch} at ${time}` : `Add a class to ${batch} at ${time}`}
      className={`grid min-h-[46px] w-full place-items-center rounded-[5px] border border-dashed text-[12.5px] font-medium ${label
        ? "border-[var(--color-pine)] bg-pine-tint text-[var(--color-pine)]"
        : "border-transparent text-transparent hover:border-[var(--color-line)] hover:bg-pine-tint hover:text-[var(--color-pine)] focus-visible:border-[var(--color-line)] focus-visible:bg-pine-tint focus-visible:text-[var(--color-pine)]"}`}>
      {label ? `+ ${label}` : "+ Add class"}
    </button>
  );
}

function Booking({ booking: e, related }: { booking: ExternalCommitmentView; related: boolean }) {
  return (
    <div className={`mb-1 rounded-[5px] border border-dashed border-[#d9b7aa] bg-white px-2 py-1 text-[12px] last:mb-0 ${related ? "outline outline-2 outline-offset-1 outline-[var(--color-gold)]" : ""}`}>
      <span className="font-mono font-semibold text-[var(--color-clay)]">{e.counterpartDepartment}</span>{" "}
      <span className="font-mono">{e.kind === "room_reservation" ? e.roomCode ?? "Room" : e.teacherShortCode ?? "Teacher"}</span>
      <span className="block text-muted">{fmtRange(e.startMinutes!, e.endMinutes!)}{e.verificationStatus !== "verified" ? " · not confirmed" : ""}</span>
      {related ? <span className="block font-semibold text-gold-text">Same teacher or room</span> : null}
    </div>
  );
}
