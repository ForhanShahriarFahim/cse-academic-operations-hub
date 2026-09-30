import Link from "next/link";
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock3,
  FileCheck2, GraduationCap, BookOpen, UserX, Unplug,
} from "lucide-react";
import { getPortalData } from "@/lib/data";
import { analyzeSchedule } from "@/lib/conflicts";
import { fmtDate, fmtRange, DAY_NAMES, jsDayToAcademic } from "@/lib/time";
import { sharingLabel, type MeetingView } from "@/lib/serialize";
import { PageHeader, StatCard, Panel, Badge, EmptyNote } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getPortalData();
  const issues = analyzeSchedule({
    meetings: data.meetings,
    externals: data.externals,
    breaks: data.breaks,
    windows: data.windows,
  });
  const blockers = issues.filter((i) => i.severity === "blocker");
  const warnings = issues.filter((i) => i.severity === "warning");

  const activeBatches = data.batches.length;
  const batchSummary = (["HSC", "DIPLOMA"] as const)
    .map((stream) => {
      const labels = data.batches.filter((batch) => batch.stream === stream).map((batch) => batch.label);
      return `${stream === "DIPLOMA" ? "Diploma" : "HSC"} ${labels.join(", ")}`;
    })
    .join(" · ");
  const openOfferings = data.coverage.length;
  const vacancies = data.coverage.filter((c) => c.status === "vacancy");
  const partial = data.coverage.filter((c) => c.status === "partial" || c.status === "unscheduled");
  const expectedMinutes = data.coverage.reduce((s, c) => s + (c.expectedWeeklyMinutes ?? 0), 0);
  const scheduledMinutes = data.coverage
    .filter((c) => c.deliveryMode !== "teacher_managed")
    .reduce((s, c) => s + c.scheduledMinutes, 0);
  const coveragePct = expectedMinutes > 0 ? Math.round((Math.min(scheduledMinutes, expectedMinutes) / expectedMinutes) * 100) : 100;
  const pendingExternal = data.externals.filter((e) => e.verificationStatus === "pending");

  const publishedVersion = data.versions.find((v) => v.state === "published");
  const snapshotMeetings: MeetingView[] = data.publishedSnapshot?.meetings ?? [];
  const todayIdx = jsDayToAcademic(new Date().getDay());
  const todaysClasses = snapshotMeetings
    .filter((m) => m.dayOfWeek === todayIdx)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  return (
    <div>
      <PageHeader
        kicker="CSE Coordinator Console"
        title={`Dashboard — ${data.term.name}`}
        description={`Working draft vs published routine. Published v${publishedVersion?.versionNumber ?? "—"} effective ${fmtDate(data.term.effectiveFrom)}. All statistics below are derived from live database records — no fabricated figures.`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active batches" value={activeBatches} sub={batchSummary} />
        <StatCard label="Teaching groups" value={openOfferings} sub={`${data.coverage.filter((c) => c.audience.includes("+")).length} merged or shared`} />
        <StatCard
          label="Unfilled assignments"
          value={vacancies.length}
          sub={vacancies.map((v) => v.courseCode).join(", ") || "none"}
          tone={vacancies.length > 0 ? "warn" : "good"}
        />
        <StatCard label="Minutes scheduled" value={`${coveragePct}%`} sub={`${scheduledMinutes} of ${expectedMinutes} required weekly minutes`} tone={coveragePct < 98 ? "warn" : "good"} />
        <StatCard
          label="Blocking issues"
          value={blockers.length}
          sub={blockers.length ? "Publication is blocked" : "Draft passes validation"}
          tone={blockers.length ? "bad" : "good"}
        />
        <StatCard
          label="OD awaiting review"
          value={pendingExternal.length}
          sub={`${data.externals.length} external commitments total`}
          tone={pendingExternal.length ? "warn" : "default"}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {/* Today's published classes */}
        <Panel
          className="xl:col-span-2"
          title={`Published classes — ${DAY_NAMES[todayIdx]}`}
          sub={data.publishedSnapshot ? `From immutable snapshot of v${data.publishedSnapshot.versionNumber} · regenerated drafts never leak here` : "No published version yet"}
          actions={
            <Link href="/public/routine" target="_blank" className="flex items-center gap-1 text-[12px] font-semibold text-[var(--color-pine)] hover:underline">
              Public view <ArrowRight size={13} />
            </Link>
          }
        >
          {todaysClasses.length === 0 ? (
            <EmptyNote>No classes are published for today in the current effective version. Future-effective versions never replace today&apos;s routine early (spec §17.5).</EmptyNote>
          ) : (
            <ul className="divide-y divide-[var(--color-line-soft)]">
              {todaysClasses.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <span className="font-mono w-[150px] text-[12px] font-medium text-[var(--color-pine)]">
                    <Clock3 size={12} className="mr-1 inline -translate-y-px" />
                    {fmtRange(m.startMinutes, m.endMinutes)}
                  </span>
                  <span className="min-w-[180px]">
                    <span className="font-mono text-[13px] font-semibold">{m.courseCode}</span>
                    <span className="ml-2 text-[12.5px] text-ink-2">{m.courseTitle}</span>
                  </span>
                  <span className="font-mono text-[11.5px] text-ink-2">
                    {m.teachers.map((t) => t.shortCode).join(", ") || "UT"} · {m.rooms.map((r) => r.code).join("/") || "—"}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <Badge tone="sage">{m.audiences.map((a) => `${a.stream === "HSC" ? "H" : "D"}-${a.batchLabel}`).join(" + ")}</Badge>
                    {sharingLabel(m) ? <Badge tone="gold">{sharingLabel(m)}</Badge> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Right column */}
        <div className="space-y-4">
          <Panel title="Publication state" sub="Immutable versions, date-aware">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-pine)]/10 text-[var(--color-pine)]">
                <FileCheck2 size={18} />
              </span>
              <div>
                <p className="font-display text-[17px] font-semibold">
                  Version {publishedVersion?.versionNumber ?? "—"} published
                </p>
                <p className="text-[11.5px] text-muted">
                  Effective {fmtDate(data.term.effectiveFrom)} · working draft open for editing
                </p>
              </div>
            </div>
            <Link
              href="/publications"
              className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-[var(--color-pine)]/30 bg-[var(--color-pine)]/5 px-3 py-2 text-[12.5px] font-semibold text-[var(--color-pine)] transition-colors hover:bg-[var(--color-pine)]/10"
            >
              Review &amp; publish a revision <ArrowRight size={13} />
            </Link>
          </Panel>

          <Panel title="Scheduling gaps" sub="Unscheduled / partial requirements">
            {partial.length === 0 ? (
              <EmptyNote>Every approved fixed-delivery requirement is fully scheduled.</EmptyNote>
            ) : (
              <ul className="space-y-2">
                {[...vacancies, ...partial].slice(0, 6).map((c) => (
                  <li key={c.teachingGroupId} className="flex items-start gap-2 text-[12.5px]">
                    {c.status === "vacancy" ? (
                      <UserX size={14} className="mt-0.5 shrink-0 text-[var(--color-clay)]" />
                    ) : (
                      <CalendarClock size={14} className="mt-0.5 shrink-0 text-gold-text" />
                    )}
                    <span>
                      <span className="font-mono font-semibold">{c.courseCode}</span>{" "}
                      <span className="text-ink-2">{c.audience}</span>
                      <span className="ml-1.5 text-[11px] text-muted">
                        {c.status === "vacancy"
                          ? "vacancy — UT (Upcoming Teacher)"
                          : `${c.scheduledMinutes}/${c.expectedWeeklyMinutes} min scheduled`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/courses" className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-pine)] hover:underline">
              Open completeness tracker <ArrowRight size={12} />
            </Link>
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel
          title="Validation summary"
          sub={`${blockers.length} blockers · ${warnings.length} advisories in the working draft`}
          actions={
            <Link href="/conflicts" className="flex items-center gap-1 text-[12px] font-semibold text-[var(--color-pine)] hover:underline">
              Full report <ArrowRight size={13} />
            </Link>
          }
        >
          {issues.length === 0 ? (
            <EmptyNote>
              <CheckCircle2 size={13} className="mr-1 inline text-[var(--color-pine)]" />
              Draft passes all checks: no teacher, room, or audience clashes; breaks and permitted windows respected.
            </EmptyNote>
          ) : (
            <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {issues.slice(0, 12).map((i) => (
                <li key={i.id} className="flex items-start gap-2 rounded-md border border-[var(--color-line-soft)] bg-sheet px-2.5 py-1.5 text-[12px]">
                  <AlertTriangle size={13} className={`mt-0.5 shrink-0 ${i.severity === "blocker" ? "text-[var(--color-clay)]" : "text-gold-text"}`} />
                  <span>
                    <span className="font-semibold">{i.title}.</span>{" "}
                    <span className="text-muted">{i.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="External data coverage (OD)"
          sub="Incompleteness is disclosed, never hidden behind a fake total"
          actions={
            <Link href="/od" className="flex items-center gap-1 text-[12px] font-semibold text-[var(--color-pine)] hover:underline">
              OD register <ArrowRight size={13} />
            </Link>
          }
        >
          <div className="grid grid-cols-4 gap-2 text-center">
            {(["A", "B", "C", "D"] as const).map((lvl) => {
              const n = data.externals.filter((e) => e.completenessLevel === lvl).length;
              return (
                <div key={lvl} className="rounded-md border border-[var(--color-line-soft)] bg-wash px-2 py-2.5">
                  <p className="font-display text-[22px] font-semibold">{n}</p>
                  <p className="micro-label mt-0.5">Level {lvl}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 space-y-1.5 text-[12px] text-ink-2">
            <p className="flex items-center gap-1.5">
              <Unplug size={13} className="text-gold-text" />
              The app never claims “no university-wide conflicts” while level B/C/D records remain unverified.
            </p>
            {pendingExternal.slice(0, 3).map((e) => (
              <p key={e.id} className="flex items-start gap-1.5">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-gold-text" />
                <span>
                  <strong>{e.counterpartDepartment}</strong> — {e.kind.replace("_", " ")} ({e.courseLabel ?? e.notes?.slice(0, 60) ?? "details pending"})
                </span>
              </p>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-wash px-4 py-3 text-[12px] text-muted">
        <GraduationCap size={15} className="shrink-0 text-[var(--color-pine)]" />
        <span>
          <strong>Batch identity note:</strong> HSC-22B and Diploma-22B are distinct cohorts.
          <strong className="ml-2">Identity note:</strong> IM and IMN are different teachers —
          <BookOpen size={12} className="mx-1 inline" />
          matching is exact, never by substring.
        </span>
      </div>
    </div>
  );
}
