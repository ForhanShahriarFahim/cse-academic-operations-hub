import { Fragment } from "react";
import Link from "next/link";
import { getPortalData } from "@/lib/data";
import { DAY_SHORT, fmtDate, fmtRange, fmtRange24, overlaps } from "@/lib/time";
import { daysForStream, slotsFor, INSTITUTION, type Stream } from "@/lib/constants";
import { sharingLabel, type MeetingView } from "@/lib/serialize";
import { PrintButton } from "@/components/print-button";
import { AlertTriangle, Asterisk, Clock3, Landmark } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PublicRoutinePage({
  searchParams,
}: {
  searchParams: Promise<{ stream?: string; day?: string }>;
}) {
  const sp = await searchParams;
  const data = await getPortalData();
  const snapshot = data.publishedSnapshot;
  const published = data.versions.find((v) => v.state === "published");

  const stream: Stream = sp.stream === "DIPLOMA" ? "DIPLOMA" : "HSC";
  const streamDays = daysForStream(stream);
  const day = streamDays.includes(Number(sp.day)) ? Number(sp.day) : streamDays[0];
  const slots = slotsFor(stream, day);

  if (!snapshot || !published) {
    return (
      <Shell stream={stream} day={day}>
        <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-white/60 p-10 text-center">
          <AlertTriangle size={22} className="mx-auto text-[var(--color-gold)]" />
          <h2 className="font-display mt-2 text-[19px] font-semibold">No published routine</h2>
          <p className="mt-1 text-[12.5px] text-[#66705f]">
            The public viewer only displays approved, published versions. Draft data is never exposed here.
          </p>
        </div>
      </Shell>
    );
  }

  const meetings = snapshot.meetings as MeetingView[];
  const rows = data.batches.filter((b) => b.stream === stream);
  const dayMeetings = meetings.filter((m) => m.dayOfWeek === day);
  const dayExternals = data.externals.filter(
    (e) => e.verificationStatus === "verified" && e.dayOfWeek === day && e.startMinutes != null && e.endMinutes != null,
  );

  const breakColumns = data.breaks
    .filter((b) => (b.dayOfWeek == null || b.dayOfWeek === day) && (b.scope === "institution" || b.stream === stream))
    .map((b) => {
      let after = -1;
      slots.forEach((s, i) => { if (s.end <= b.startMinutes) after = i; });
      return { ...b, afterSlot: after };
    })
    .filter((b) => b.afterSlot >= 0 && b.afterSlot < slots.length - 1);

  function forCell(batchId: number) {
    const off = dayMeetings.filter(
      (m) => m.audiences.some((a) => a.batchId === batchId) &&
        !slots.some((s) => overlaps(m.startMinutes, m.endMinutes, s.start, s.end)),
    );
    const bySlot = slots.map((s) =>
      dayMeetings.filter(
        (m) => m.audiences.some((a) => a.batchId === batchId) &&
          overlaps(m.startMinutes, m.endMinutes, s.start, s.end),
      ),
    );
    return { off, bySlot };
  }

  return (
    <Shell stream={stream} day={day} version={published.versionNumber} publishedAt={published.publishedAt}>
      {/* Official document surface */}
      <div className="print-surface rounded-lg border border-[var(--color-line)] bg-[#fffef8] shadow-sm">
        {/* Letterhead */}
        <header className="border-b-2 border-[var(--color-pine)] px-6 pb-4 pt-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--color-pine)] text-[var(--color-pine)]">
            <Landmark size={26} strokeWidth={1.6} />
          </div>
          <h1 className="font-display text-[21px] font-bold tracking-tight text-[var(--color-ink)]">
            {INSTITUTION.universityName}
          </h1>
          <p className="mt-0.5 text-[12.5px] font-medium text-[#3f4a41]">{INSTITUTION.departmentName}</p>
          <p className="mt-2 text-[13px] font-semibold tracking-wide text-[var(--color-pine)]">
            Class Routine — {INSTITUTION.programme} ({stream === "HSC" ? "HSC Stream" : "Diploma Stream"})
          </p>
          <p className="mt-0.5 text-[11px] text-[#66705f]">
            {data.term.name} · {DAY_SHORT[day]} · Effective from {fmtDate(data.term.effectiveFrom)} ·
            Publication version {snapshot.versionNumber}
          </p>
        </header>

        {/* Table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="routine-table text-[11.5px]">
            <thead>
              <tr>
                <th className="w-[72px] px-2 py-2 text-left"><span className="micro-label">Batch</span></th>
                <th className="w-[104px] px-2 py-2 text-left"><span className="micro-label">Custom</span></th>
                {slots.map((s, i) => (
                  <Fragment key={s.start}>
                    <th className="min-w-[120px] px-2 py-2 text-center">
                      <span className="font-mono text-[11.5px] font-semibold text-[var(--color-pine)]">{fmtRange24(s.start, s.end)}</span>
                      <span className="block text-[9.5px] font-normal text-[#8a8571]">{fmtRange(s.start, s.end)}</span>
                    </th>
                    {breakColumns.filter((b) => b.afterSlot === i).map((b) => (
                      <th key={b.id} className="break-column w-[30px] px-0 py-2 text-center">
                        <span className="inline-block rotate-180 text-[8.5px] font-bold uppercase tracking-[0.16em] text-[#75806f] [writing-mode:vertical-rl]">{b.name}</span>
                      </th>
                    ))}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((b, ri) => {
                const { off, bySlot } = forCell(b.id);
                return (
                  <tr key={b.id} className={ri % 2 ? "bg-[#fbf9ef]" : "bg-[#fffef8]"}>
                    <td className="px-2 py-1.5">
                      <p className="font-mono text-[12px] font-bold">{stream === "HSC" ? "HSC" : "DIP"}-{b.label}</p>
                      <p className="text-[9.5px] text-[#8a8571]">Semester {b.semester ?? "?"}</p>
                    </td>
                    <td className="px-1.5 py-1.5">
                      {off.map((m) => <PublicMeeting key={m.id} m={m} />)}
                    </td>
                    {bySlot.map((cell, i) => (
                      <Fragment key={slots[i].start}>
                        <td className="px-1.5 py-1.5 align-top">
                          {cell.map((m) => <PublicMeeting key={m.id} m={m} slot={slots[i]} />)}
                        </td>
                        {breakColumns.filter((x) => x.afterSlot === i).map((x) => (
                          <td key={x.id} className="break-column w-[30px]" />
                        ))}
                      </Fragment>
                    ))}
                  </tr>
                );
              })}
              <tr className="bg-[#f0ede0]">
                <td className="px-2 py-1.5">
                  <p className="font-mono text-[11.5px] font-bold text-[var(--color-clay)]">OD</p>
                  <p className="text-[8.5px] text-[#8a8571]">Other Depts.</p>
                </td>
                <td className="px-1.5 py-1.5">
                  {dayExternals.filter((e) => !slots.some((s) => overlaps(e.startMinutes!, e.endMinutes!, s.start, s.end)))
                    .map((e) => (
                      <div key={e.id} className="mb-1 rounded border border-[var(--color-clay)]/25 bg-white/70 px-1.5 py-1 text-[9.5px] last:mb-0">
                        <b className="font-mono text-[var(--color-clay)]">{e.counterpartDepartment}</b> — {e.roomCode ?? e.teacherShortCode ?? "details pending"}
                        <span className="block font-mono text-[8.5px] text-[#8a8571]">{fmtRange(e.startMinutes!, e.endMinutes!)}</span>
                      </div>
                    ))}
                </td>
                {slots.map((s, i) => (
                  <Fragment key={s.start}>
                    <td className="px-1.5 py-1.5 align-top">
                      {dayExternals.filter((e) => overlaps(e.startMinutes!, e.endMinutes!, s.start, s.end)).map((e) => (
                        <div key={e.id} className="mb-1 rounded border border-[var(--color-clay)]/25 bg-white/70 px-1.5 py-1 text-[9.5px] last:mb-0">
                          <b className="font-mono text-[var(--color-clay)]">{e.counterpartDepartment}</b> —{" "}
                          {e.kind === "room_reservation" ? `room ${e.roomCode ?? "?"}` : `${e.teacherShortCode ?? "?"}${e.courseLabel ? ` · ${e.courseLabel.split(" ")[0]}` : ""}`}
                          <span className="block font-mono text-[8.5px] text-[#8a8571]">{fmtRange(e.startMinutes!, e.endMinutes!)}</span>
                        </div>
                      ))}
                    </td>
                    {breakColumns.filter((x) => x.afterSlot === i).map((x) => (
                      <td key={x.id} className="break-column w-[30px]" />
                    ))}
                  </Fragment>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Mobile agenda */}
        <div className="px-4 py-4 md:hidden">
          {rows.map((b) => {
            const items = dayMeetings
              .filter((m) => m.audiences.some((a) => a.batchId === b.id))
              .sort((a, b2) => a.startMinutes - b2.startMinutes);
            if (items.length === 0) return null;
            return (
              <div key={b.id} className="mb-3">
                <p className="font-mono text-[12px] font-bold text-[var(--color-pine)]">
                  {stream === "HSC" ? "HSC" : "DIP"}-{b.label}
                </p>
                <ul className="mt-1 space-y-1.5">
                  {items.map((m) => (
                    <li key={m.id} className="rounded-md border border-[var(--color-line-soft)] bg-white px-2.5 py-1.5 text-[11.5px]">
                      <span className="font-mono font-semibold">{m.courseCode}</span>
                      <span className="mx-1.5 text-[#8a8571]">·</span>
                      <span className="font-mono text-[var(--color-pine)]">{fmtRange(m.startMinutes, m.endMinutes)}</span>
                      <span className="block text-[10.5px] text-[#66705f]">
                        {m.teachers.map((t) => t.shortCode).join("+") || "UT"} · {m.rooms.map((r) => r.code).join("/")}
                        {sharingLabel(m) ? ` · ${sharingLabel(m)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Footnotes + signatures */}
        <footer className="border-t border-[var(--color-line)] px-6 py-4">
          <div className="grid gap-2 text-[10px] leading-relaxed text-[#66705f] md:grid-cols-2">
            <p>* Custom/timed entry — teacher-managed or approved exception; exact times shown on the cell.</p>
            <p>Labels such as HSC + DIP or CSE + EEE denote one merged physical class stored once.</p>
            <p className="flex items-start gap-1">
              <AlertTriangle size={10} className="mt-0.5 shrink-0 text-[var(--color-clay)]" />
              Items flagged for source reconciliation are stored provisionally pending institutional confirmation.
            </p>
            <p>Colour dots preserve source highlights only; they do not indicate status or ownership.</p>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-6 text-center text-[10.5px] text-[#4a544c]">
            {["Course Coordinator, CSE", "Head, Dept. of CSE", "Registrar"].map((role) => (
              <div key={role}>
                <div className="mx-auto mb-1 h-px w-40 bg-[#9a947e]" />
                <p className="font-semibold">{role}</p>
                <p className="text-[9.5px] text-[#8a8571]">Signature pending approval workflow</p>
              </div>
            ))}
          </div>
        </footer>
      </div>

      <p className="mt-3 text-center text-[10.5px] text-[#8a8571]">
        Generated from immutable publication v{snapshot.versionNumber} · {new Date(snapshot.generatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} ·
        This page always reflects the effective published version — draft changes never appear here.
      </p>
    </Shell>
  );
}

function Shell({
  children, stream, day, version, publishedAt,
}: {
  children: React.ReactNode;
  stream: Stream;
  day: number;
  version?: number;
  publishedAt?: string | null;
}) {
  return (
    <div className="paper-grain min-h-screen">
      <header className="no-print border-b border-[var(--color-line)] bg-[var(--color-ink)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-gold)]/15 text-[var(--color-gold)]">
            <Landmark size={16} />
          </span>
          <div>
            <p className="font-display text-[15px] font-semibold text-white">Official Class Routine</p>
            <p className="text-[10.5px] text-white/50">Department of Computer Science &amp; Engineering · public viewer</p>
          </div>
          <div className="no-print ml-auto flex items-center gap-2">
            <div className="flex rounded-md border border-white/15 p-0.5">
              {(["HSC", "DIPLOMA"] as Stream[]).map((s) => (
                <Link key={s} href={`/public/routine?stream=${s}&day=${daysForStream(s)[0]}`}
                  className={`rounded px-3 py-1 text-[11.5px] font-semibold ${stream === s ? "bg-white/15 text-white" : "text-white/55 hover:text-white"}`}>
                  {s === "HSC" ? "HSC" : "Diploma"}
                </Link>
              ))}
            </div>
            <div className="flex rounded-md border border-white/15 p-0.5">
              {daysForStream(stream).map((d) => (
                <Link key={d} href={`/public/routine?stream=${stream}&day=${d}`}
                  className={`rounded px-2.5 py-1 text-[11.5px] font-semibold ${day === d ? "bg-[var(--color-gold)] text-[var(--color-ink)]" : "text-white/55 hover:text-white"}`}>
                  {DAY_SHORT[d]}
                </Link>
              ))}
            </div>
            {version && (
              <span className="rounded-md border border-white/15 px-2.5 py-1 text-[10.5px] text-white/60">
                v{version}{publishedAt ? ` · ${new Date(publishedAt).toLocaleDateString("en-GB")}` : ""}
              </span>
            )}
            <PrintButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

function PublicMeeting({ m, slot }: { m: MeetingView; slot?: { start: number; end: number } }) {
  const shared = sharingLabel(m);
  const custom = m.customTimeLabel != null || !slot || m.startMinutes !== slot.start || m.endMinutes !== slot.end;
  return (
    <div className={`mb-1 last:mb-0 rounded border px-1.5 py-1 ${
      m.pendingReconciliation
        ? "border-[var(--color-clay)]/40 bg-[var(--color-clay)]/[0.05]"
        : shared ? "border-[var(--color-gold)]/40 bg-[var(--color-gold)]/[0.06]" : "border-[var(--color-line)] bg-white"
    }`}>
      <p className="flex items-center gap-1">
        <span className="font-mono text-[11px] font-bold">{m.courseCode}</span>
        {m.isException && <Asterisk size={10} className="text-[var(--color-gold)]" />}
        {m.pendingReconciliation && <AlertTriangle size={10} className="text-[var(--color-clay)]" />}
        {shared && <span className="rounded-full bg-[var(--color-gold)]/15 px-1 text-[8px] font-bold text-[#8a5d16]">{shared}</span>}
      </p>
      <p className="font-mono text-[9.5px] text-[#4a544c]">
        {m.teachers.map((t) => t.shortCode).join("+") || "UT"} · {m.rooms.map((r) => r.code).join("/")}
      </p>
      {custom && (
        <p className="mt-0.5 inline-flex items-center gap-0.5 rounded bg-[var(--color-pine)]/10 px-1 text-[8.5px] font-bold text-[var(--color-pine)]">
          <Clock3 size={8} /> {m.customTimeLabel ?? fmtRange(m.startMinutes, m.endMinutes)}
        </p>
      )}
    </div>
  );
}
