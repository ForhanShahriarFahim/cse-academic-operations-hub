import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { Notice, PageHeader } from "@/components/ui";
import { RoomForm } from "@/components/rooms/room-form";
import { getRoomRecord, requireRoomEditor, roomDepartments } from "@/lib/room-data";
import { readRoomReferences } from "@/lib/room-transaction";
export const dynamic = "force-dynamic";
export default async function EditRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRoomEditor(`/rooms/${id}/edit`);
  const record = await getRoomRecord(id);
  if (!record) notFound();
  if (!Array.isArray(record.capabilities) || record.capabilities.some((token) => typeof token !== "string")) return <Notice tone="warn">This room has unsupported legacy capability data. A correction needs an owner decision. <Link href={`/rooms/${record.id}`}>Back to room</Link></Notice>;
  const [departments, references] = await Promise.all([roomDepartments(), readRoomReferences(db, record.id)]);
  return <div className="mx-auto max-w-[980px] min-w-0 break-words"><PageHeader context="Rooms" title={`Edit ${record.code}`} description="Review assigned use before saving. Published routines keep their recorded values." /><RoomForm record={record} departments={departments} references={references} /></div>;
}
