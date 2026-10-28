import { PageHeader } from "@/components/ui";
import { RoomForm } from "@/components/rooms/room-form";
import { requireRoomEditor, roomDepartments } from "@/lib/room-data";
export const dynamic = "force-dynamic";
export default async function NewRoomPage() {
  await requireRoomEditor("/rooms/new");
  return <div className="mx-auto max-w-[980px]"><PageHeader context="Rooms" title="Add room" description="Record a room without inferring its capacity, ownership or capabilities." /><RoomForm record={null} departments={await roomDepartments()} references={{ meetings: [], externals: [] }} /></div>;
}
