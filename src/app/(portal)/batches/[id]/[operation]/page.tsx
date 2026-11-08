import Link from "next/link";
import { notFound } from "next/navigation";
import { getBatchDetail, requireBatchEditor } from "@/lib/batch-data";
import { BatchForm } from "@/components/batches/batch-form";
import { EmptyNote, PageHeader } from "@/components/ui";
export const dynamic="force-dynamic";
export default async function BatchOperation({params}:{params:Promise<{id:string;operation:string}>}){
  const {id,operation}=await params;await requireBatchEditor(`/batches/${id}/${operation}`);
  if(!["edit","count","placement","lifecycle"].includes(operation))notFound();
  const data=await getBatchDetail(id);if(!data)notFound();
  const mode=operation==="edit"?"identity":operation as "count"|"placement"|"lifecycle";
  const blocked=["placement","count"].includes(mode)&&(!data.term||mode==="count"&&!data.current||mode==="placement"&&(data.record.status!=="active"||data.current&&data.activeUse));
  return <div className="mx-auto min-w-0 max-w-[760px]"><Link className="text-sm underline" href={`/batches/${data.record.id}`}>← Batch record</Link><PageHeader context={`${data.record.stream}-${data.record.label} · ${data.term?.name??"No active term"}`} title={{identity:"Edit batch identity",placement:"Place batch in the active term",count:"Student count for this term",lifecycle:"Review cohort lifecycle"}[mode]}/>{blocked?<EmptyNote>This action is unavailable: an active term and eligible placement are required. Used semester placements are protected; inactive/graduated cohorts need an explicit lifecycle review.</EmptyNote>:<BatchForm mode={mode} record={data.record} current={data.current} context={data.writeContext} generation={data.generation} termName={data.term?.name} evidence={data.evidence} fingerprints={data.lifecycleFingerprints}/>}</div>;
}
