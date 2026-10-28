import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader, Notice } from "@/components/ui";
import { buttonClass } from "@/components/account/styles";
import { RoomHistory } from "@/components/rooms/room-history";
import { can, requireActor } from "@/lib/auth";
import { getRoomChanges, getRoomRecord } from "@/lib/room-data";
import { ROOM_FIELDS, ROOM_LABELS } from "@/lib/room-records";
export const dynamic = "force-dynamic";
export default async function RoomDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const { id } = await params;
  const record = await getRoomRecord(id);
  if (!record) notFound();
  const editor = await can(await requireActor(), "manage_rooms");
  const [owner] = record.owningDepartmentId ? await db.select().from(departments).where(eq(departments.id, record.owningDepartmentId)) : [];
  const { done } = await searchParams;
  const display = (field: typeof ROOM_FIELDS[number]) => {
    const value = record[field];
    if (field === "capacity") return value ?? "Unknown";
    if (field === "owningDepartmentId") return owner ? `${owner.code} · ${owner.name}` : "Owner not recorded";
    if (Array.isArray(value)) return value.join(", ") || "None recorded";
    if (value != null && typeof value === "object") return JSON.stringify(value);
    return value ?? "Not recorded";
  };
  return <div className="mx-auto max-w-[980px] min-w-0 break-words"><Link className="text-sm font-semibold underline" href="/rooms">← Rooms & occupancy</Link><PageHeader context="Room directory" title={record.code} description={`${record.building} · ${record.isActive ? "Active" : "Inactive"}`} actions={editor ? <Link className={buttonClass.primary} href={`/rooms/${record.id}/edit`}>Edit room</Link> : undefined} />
    {done && <Notice tone="success">{done}</Notice>}
    <dl className="ruled grid min-w-0 gap-4 rounded-lg p-4 md:grid-cols-2">{ROOM_FIELDS.map((field) => <div key={field} className={`min-w-0 break-words ${field === "notes" ? "md:col-span-2" : ""}`}><dt className="text-xs font-semibold text-muted">{ROOM_LABELS[field]}</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{display(field)}</dd></div>)}</dl>
    <p className="mt-3 text-sm text-muted">Working records use these current values. Published routines keep their saved values.</p>
    {editor && <RoomHistory roomId={record.id} initial={await getRoomChanges(record.id)} />}
  </div>;
}
