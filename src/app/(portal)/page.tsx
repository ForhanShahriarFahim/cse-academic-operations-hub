import Link from "next/link";
import { ArrowRight, Globe, ShieldAlert, FileCheck2 } from "lucide-react";
import { getPortalData } from "@/lib/data";
import { analyzeSchedule } from "@/lib/conflicts";
import { fmtDate, fmtRange, DAY_NAMES, jsDayToAcademic } from "@/lib/time";
import { sharingLabel, type MeetingView } from "@/lib/serialize";
import { PageHeader, Panel, Badge, EmptyNote, StatusText } from "@/components/ui";

export const dynamic = "force-dynamic";

const linkClass = "inline-flex items-center gap-1 text-[13px] font-medium text-[var(--color-pine)] underline-offset-2 hover:underline";

export default async function DashboardPage() {
  const data = await getPortalData();
  const issues = analyzeSchedule({
    meetings: data.meetings,
    externals: data.externals,
    breaks: data.breaks,
    grid: data.timeGrid,
    windows: data.windows,
  });
  const blockers = issues.filter((i) => i.severity === "blocker");
  const warnings = issues.filter((i) => i.severity === "warning");

  const streamCount = (stream: "HSC" | "DIPLOMA") => data.batches.filter((batch) => batch.stream === stream).length;
  const vacancies = data.coverage.filter((c) => c.status === "vacancy");
  const partial = data.coverage.filter((c) => c.status === "partial" || c.status === "unscheduled");
  const expectedMinutes = data.coverage.reduce((s, c) => s + (c.expectedWeeklyMinutes ?? 0), 0);
  const scheduledMinutes = data.coverage
    .filter((c) => c.deliveryMode !== "teacher_managed")
    .reduce((s, c) => s + c.scheduledMinutes, 0);
  const coveragePct = expectedMinutes > 0 ? Math.round((Math.min(scheduledMinutes, expectedMinutes) / expectedMinutes) * 100) : 100;
  const pendingExternal = data.externals.filter((e) => e.verificationStatus === "pending");

  // Only a version in the published state counts; a draft never implies publication (#30).
  const publishedVersion = data.versions.find((v) => v.state === "published") ?? null;
  const snapshotMeetings: MeetingView[] = data.publishedSnapshot?.meetings ?? [];
  const todayIdx = jsDayToAcademic(new Date().getDay());
  const todaysClasses = snapshotMeetings
    .filter((m) => m.dayOfWeek === todayIdx)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const term = data.term.name;

  const headline = publishedVersion
    ? `Version ${publishedVersion.versionNumber} of the ${term} routine is published`
    : blockers.length
      ? `The ${term} routine is not published yet`
      : `The ${term} routine is ready to publish`;
  const draftSentence = blockers.length
    ? `${blockers.length} blocking ${blockers.length === 1 ? "conflict" : "conflicts"} in the working draft must be resolved before ${publishedVersion ? "a new version" : "the routine"} can be published.`
    : `The working draft has no blocking conflicts and can be reviewed for publication.`;
  const publicSentence = publishedVersion
    ? `It has been in effect since ${fmtDate(publishedVersion.effectiveFrom)}, and it is what students and teachers see on the public page.`
    : "Until then, students and teachers see no routine on the public page.";

  const figures = [
    { label: "Active batches", value: data.batches.length, sub: `${streamCount("HSC")} HSC · ${streamCount("DIPLOMA")} Diploma` },
    { label: "Teaching groups", value: data.coverage.length, sub: `${data.coverage.filter((c) => c.audience.includes("+")).length} merged or shared` },
    { label: "Weekly minutes placed", value: `${coveragePct}%`, sub: `${scheduledMinutes.toLocaleString("en-US")} of ${expectedMinutes.toLocaleString("en-US")}` },
    { label: "Unassigned teaching groups", value: vacancies.length, sub: vacancies.map((v) => v.courseCode).join(", ") || "Every group has a teacher" },
    { label: "External bookings to confirm", value: pendingExternal.length, sub: `${data.externals.length} on record` },
  ];

  return (
    <div>
      <PageHeader
        context={term}
        title="Dashboard"
        actions={
          <>
            <Link href="/public/routine" target="_blank" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-sheet px-3.5 text-[13.5px] font-medium">
              <Globe size={15} strokeWidth={1.8} aria-hidden="true" /> Public view<span className="sr-only"> (opens in a new tab)</span>
            </Link>
            {blockers.length ? (
              <Link href="/conflicts" className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[var(--color-pine)] px-3.5 text-[13.5px] font-semibold text-white">
                <ShieldAlert size={15} strokeWidth={1.8} aria-hidden="true" /> Resolve blockers
              </Link>
            ) : (
              <Link href="/publications" className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[var(--color-pine)] px-3.5 text-[13.5px] font-semibold text-white">
                <FileCheck2 size={15} strokeWidth={1.8} aria-hidden="true" /> Review and publish
              </Link>
            )}
          </>
        }
      />

      <section aria-labelledby="readiness-heading" className="grid gap-6 rounded-lg border border-[var(--color-line)] bg-sheet px-5 py-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <h2 id="readiness-heading" className="font-display text-[21px] font-semibold leading-snug">{headline}</h2>
          <p className="mt-1.5 max-w-[62ch] text-[14px] leading-relaxed text-ink-2">
            {publishedVersion ? `${publicSentence} ${draftSentence}` : `${draftSentence} ${publicSentence}`}
          </p>
        </div>
        <ul aria-label="Publication checklist" className="space-y-2 text-[13.5px]">
          <ChecklistRow tone={coveragePct >= 100 ? "ok" : "warn"} label="Required weekly minutes placed" value={`${coveragePct}%`} />
          <ChecklistRow tone={blockers.length ? "block" : "ok"} label="Blocking conflicts" value={blockers.length} />
          <ChecklistRow tone={warnings.length ? "warn" : "ok"} label="Warnings published with the routine" value={warnings.length} />
          <ChecklistRow tone={vacancies.length ? "block" : "ok"} label="Unassigned teaching groups" value={vacancies.length} />
        </ul>
      </section>

      <dl className="my-6 grid grid-cols-2 border-y border-[var(--color-line)] sm:grid-cols-3 xl:grid-cols-5">
        {figures.map((figure) => (
          <div key={figure.label} className="border-[var(--color-line-soft)] px-1 py-3.5 sm:px-4 xl:border-l xl:first:border-l-0 xl:first:pl-0">
            <dt className="text-[12.5px] text-muted">{figure.label}</dt>
            <dd className="mt-0.5">
              <span className="font-display tabular block text-[26px] font-semibold leading-tight">{figure.value}</span>
              <span className="block text-[12px] leading-snug text-muted">{figure.sub}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel
          title={blockers.length ? "Blocking conflicts" : "Warnings"}
          sub={`${blockers.length} blocking · ${warnings.length} warnings in the working draft`}
          actions={<Link href="/conflicts" className={linkClass}>Open Validation <ArrowRight size={13} aria-hidden="true" /></Link>}
        >
          {issues.length === 0 ? (
            <EmptyNote>No clashes: teachers, rooms and batches are each booked once at a time, and breaks and class windows are respected.</EmptyNote>
          ) : (
            <ul className="-my-2 divide-y divide-[var(--color-line-soft)]">
              {(blockers.length ? blockers : warnings).slice(0, 6).map((issue) => (
                <li key={issue.id} className="py-2.5">
                  <p className="text-[13.5px] font-medium">{issue.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{issue.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel
            title={`Today · ${DAY_NAMES[todayIdx]}`}
            sub={publishedVersion ? `From published version ${publishedVersion.versionNumber}` : undefined}
          >
            {!publishedVersion ? (
              <EmptyNote>No published classes today, because no routine has been published. <Link href="/routine" className={linkClass}>Open the working draft</Link></EmptyNote>
            ) : todaysClasses.length === 0 ? (
              <EmptyNote>No classes are scheduled today in the published routine.</EmptyNote>
            ) : (
              <ul className="-my-2 divide-y divide-[var(--color-line-soft)]">
                {todaysClasses.map((m) => (
                  <li key={m.id} className="py-2.5 text-[13px]">
                    <p className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-mono text-[12.5px] text-ink-2">{fmtRange(m.startMinutes, m.endMinutes)}</span>
                      <span className="font-mono font-semibold">{m.courseCode}</span>
                      <span className="font-mono text-[12.5px] text-ink-2">{m.rooms.map((r) => r.code).join("/") || "No room"}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
                      {m.teachers.map((t) => t.shortCode).join(", ") || "Teacher to be assigned"}
                      <Badge tone="sage">{m.audiences.map((a) => `${a.stream === "HSC" ? "HSC" : "Diploma"}-${a.batchLabel}`).join(" + ")}</Badge>
                      {sharingLabel(m) ? <Badge tone="gold">{sharingLabel(m)}</Badge> : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Scheduling gaps" actions={<Link href="/courses" className={linkClass}>Courses <ArrowRight size={13} aria-hidden="true" /></Link>}>
            {vacancies.length + partial.length === 0 ? (
              <EmptyNote>Every required class is fully scheduled and has a teacher.</EmptyNote>
            ) : (
              <ul className="space-y-2 text-[13px]">
                {[...vacancies, ...partial].slice(0, 6).map((c) => (
                  <li key={c.teachingGroupId} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-mono font-semibold">{c.courseCode}</span>
                    <span className="text-ink-2">{c.audience}</span>
                    <StatusText tone={c.status === "vacancy" ? "block" : "warn"}>
                      {c.status === "vacancy" ? "No teacher assigned" : `${c.scheduledMinutes} of ${c.expectedWeeklyMinutes} minutes placed`}
                    </StatusText>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="External commitments" actions={<Link href="/od" className={linkClass}>Register <ArrowRight size={13} aria-hidden="true" /></Link>}>
            <p className="text-[13px] leading-relaxed text-ink-2">
              {pendingExternal.length
                ? `${pendingExternal.length} of ${data.externals.length} bookings by other departments still need confirming. Until they are confirmed, the portal cannot say that a room or teacher is free at those times.`
                : `All ${data.externals.length} bookings by other departments are confirmed.`}
            </p>
            <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
              {(["A", "B", "C", "D"] as const).map((level) => (
                <div key={level} className="rounded-md border border-[var(--color-line-soft)] bg-wash px-2 py-2">
                  <dt className="text-[12px] text-muted">Level {level}</dt>
                  <dd className="font-display tabular text-[20px] font-semibold">{data.externals.filter((e) => e.completenessLevel === level).length}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[12px] text-muted">Level A records are complete; level D records are unresolved notes.</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ChecklistRow({ tone, label, value }: { tone: "ok" | "warn" | "block"; label: string; value: string | number }) {
  const word = tone === "ok" ? "Done" : tone === "warn" ? "Check" : "Needs action";
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2.5">
      <StatusText tone={tone} className="w-[7.5rem]">{word}</StatusText>
      <span>{label}</span>
      <span className="tabular font-semibold">{value}</span>
    </li>
  );
}
