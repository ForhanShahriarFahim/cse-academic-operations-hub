import Link from "next/link";
import { notFound } from "next/navigation";
import { CommitmentLinkForm } from "@/components/od/commitment-link-form";
import { Notice, PageHeader } from "@/components/ui";
import { getCommitment, requireCommitmentManager } from "@/lib/commitment-data";
import { commitmentDateLabel, meetingCoversCommitment, safeRegisterReturn, scheduleText } from "@/lib/commitment-records";

export const dynamic = "force-dynamic";

export default async function CommitmentLinkPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return?: string }> }) {
  const { id } = await params;
  await requireCommitmentManager(`/od/${id}/link`);
  if (!/^[1-9]\d{0,8}$/.test(id)) notFound();
  const workspace = await getCommitment(Number(id));
  if (!workspace) notFound();
  const { row, term, options, writeContext } = workspace;
  const returnTo = safeRegisterReturn((await searchParams).return);
  const linked = row.linkedTeachingGroupId !== null;
  const matches = options.meetings.filter((meeting) => meetingCoversCommitment(row, meeting, options.bounds));
  const candidates = [...new Map(matches.map((meeting) => [meeting.teachingGroupId, {
    id: meeting.teachingGroupId,
    label: [`Group #${meeting.teachingGroupId}`, meeting.courseCode, meeting.audience, meeting.teachers.map((teacher) => teacher.shortCode).join(", "),
      meeting.rooms.map((room) => room.code).join(", "), scheduleText(meeting), !commitmentDateLabel(meeting) && "Whole term"].filter(Boolean).join(" · "),
  }])).values()];
  return <div className="min-w-0 space-y-4">
    <Link href={returnTo} className="underline">← Cross-department commitments</Link>
    <PageHeader context={term.name} title={linked ? `Teaching group #${row.linkedTeachingGroupId}` : "Link to a formal teaching group"}
      description={[row.counterpartDepartment, row.teacherCode, row.roomCode, row.schedule].filter(Boolean).join(" · ")} />
    {linked && <Notice tone={row.lifecycleStatus === "active" && !row.linkedCoverage ? "warn" : "info"}>
      {row.lifecycleStatus === "archived" ? "This commitment is archived. Removing the link leaves it archived." : row.linkedCoverage
        ? "Removing the link restores this commitment as an independent booking."
        : "The formal meeting no longer covers this commitment. The original booking is in planning. Restore coverage or remove the link before publishing."}
    </Notice>}
    {!linked && row.workload.length ? <Notice tone="warn">This commitment counts toward workload. Resolve that allocation before linking.</Notice>
      : !linked && row.lifecycleStatus !== "active" ? <Notice tone="info">Reactivate the commitment before linking.</Notice>
        : <CommitmentLinkForm id={row.id} revision={row.revision} context={writeContext} linked={linked} candidates={candidates} returnTo={returnTo} />}
  </div>;
}
