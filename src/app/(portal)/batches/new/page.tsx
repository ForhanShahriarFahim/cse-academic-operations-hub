import { requireBatchEditor } from "@/lib/batch-data";
import { BatchForm } from "@/components/batches/batch-form";
import { PageHeader } from "@/components/ui";
export const dynamic="force-dynamic";
export default async function NewBatch(){await requireBatchEditor("/batches/new");return <div className="mx-auto max-w-[760px]"><PageHeader context="Cohort identity" title="Add a batch" description="Create the lasting identity first. New cohorts start active without a term placement."/><BatchForm mode="identity"/></div>;}
