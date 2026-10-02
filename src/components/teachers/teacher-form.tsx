"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";
import { saveTeacherAction } from "@/lib/teacher-actions";
import { DESIGNATION_SUGGESTIONS, EMPLOYMENT_LABELS, EMPLOYMENT_TYPES, FIELD_LABELS, type TeacherField } from "@/lib/teacher-records";
import { FieldError, ResultNotice, fieldErrors } from "@/components/account/form-bits";
import { buttonClass, inputClass } from "@/components/account/styles";

export interface TeacherFormValues {
  shortCode: string;
  fullName: string;
  designation: string;
  employmentType: string;
  homeDepartmentId: string;
  email: string;
  phonePrivate: string;
  advisoryLoadUnits: string;
  notes: string;
}

export interface TeacherFormProps {
  mode: "create" | "edit" | "resolve";
  teacherId: number | null;
  expectedUpdatedAt: string | null;
  initial: TeacherFormValues;
  departments: Array<{ id: number; code: string; name: string }>;
  /** False hides the private phone entirely; the server ignores it too. */
  privateContacts: boolean;
  /** Publications that show the current code, for the rename warning. */
  publishedWithCode: string[];
  lastSaved: string | null;
  cancelHref: string;
}

const ORDER: TeacherField[] = ["shortCode", "fullName", "designation", "employmentType", "homeDepartmentId", "advisoryLoadUnits", "email", "phonePrivate", "notes"];

/** TCH-01 add, edit and resolve form. Typed values survive a refused save. */
export function TeacherForm(props: TeacherFormProps) {
  const { mode, teacherId, expectedUpdatedAt, initial, departments, privateContacts, publishedWithCode, lastSaved, cancelHref } = props;
  const router = useRouter();
  const [draft, setDraft] = useState<TeacherFormValues>(initial);
  const [code, setCode] = useState(initial.shortCode);
  const [department, setDepartment] = useState(initial.homeDepartmentId);
  // Navigate from the submit itself: a resolved code's page re-renders without this form.
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(async (previous, formData) => {
    setDraft(Object.fromEntries(ORDER.map((name) => [name, String(formData.get(name) ?? "")])) as unknown as TeacherFormValues);
    const outcome = await saveTeacherAction(previous, formData);
    if (outcome.ok) {
      const id = outcome.outcome?.kind === "success" ? outcome.outcome.entityId : teacherId;
      router.push(`/teachers/${id}?done=${mode === "create" ? "added" : mode === "resolve" ? "resolved" : "saved"}`);
    }
    return outcome;
  }, null);
  const summary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result && !result.ok) summary.current?.focus();
  }, [result]);

  const errors = (name: TeacherField) => fieldErrors(result, name);
  const invalidFields = ORDER.filter((name) => errors(name).length);
  const renaming = mode === "edit" && code.trim().toUpperCase() !== initial.shortCode.toUpperCase() && code.trim() !== "";
  const cse = departments.find((d) => d.code === "CSE")?.id;
  const incomingChange = mode === "edit" && cse != null && department !== initial.homeDepartmentId
    && (String(cse) === department || String(cse) === initial.homeDepartmentId);

  return (
    <form key={JSON.stringify(draft)} action={action} noValidate className="grid gap-4">
      <input type="hidden" name="teacherId" value={teacherId ?? ""} />
      <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt ?? ""} />
      {mode === "resolve" ? <input type="hidden" name="resolve" value="1" /> : null}

      <div ref={summary} tabIndex={-1} className="outline-none">
        {result && !result.ok && invalidFields.length ? (
          <div role="alert" className="flex items-start gap-2.5 rounded-md border border-[var(--color-clay)]/35 bg-clay-tint px-3.5 py-2.5 text-[13px] text-[#5a1d0e]">
            <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-clay)]" />
            <div>
              <p className="font-semibold">{invalidFields.length === 1 ? "1 thing" : `${invalidFields.length} things`} to fix before saving</p>
              <ul className="mt-1 list-disc pl-4">
                {invalidFields.map((name) => <li key={name}><a href={`#tf-${name}`} className="font-semibold underline">{FIELD_LABELS[name]}: {errors(name)[0]}</a></li>)}
              </ul>
            </div>
          </div>
        ) : result && !result.ok ? <ResultNotice result={result} /> : null}
      </div>

      <section className="ruled rounded-lg">
        <h2 className="sr-only">Teacher details</h2>
        <Group title="Identity" hint="How the teacher appears on routines, prints and workload.">
          <Field name="shortCode" label="Short code" errors={errors("shortCode")}
            hint={mode === "resolve" ? "The routine already uses this code, so it stays." : "Letters and digits, up to 8. Codes are exact: IM and IMN are different."}>
            {(props) => <input {...props} defaultValue={draft.shortCode} maxLength={8} autoComplete="off" spellCheck={false} readOnly={mode === "resolve"}
              onChange={(event) => setCode(event.target.value)} className={`${inputClass} max-w-[170px] font-mono uppercase ${mode === "resolve" ? "bg-wash" : ""}`} />}
          </Field>
          <Field name="fullName" label="Full name" errors={errors("fullName")}>
            {(props) => <input {...props} defaultValue={draft.fullName} autoComplete="off" className={inputClass} />}
          </Field>
          {renaming ? (
            <div className="md:col-span-2 flex items-start gap-2.5 rounded-md border border-[var(--color-gold)]/40 bg-gold-tint px-3.5 py-2.5 text-[13px] text-[#4d3a12]" role="status">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-gold-text" />
              <p><strong>Changing the code from {initial.shortCode}.</strong>{" "}
                {publishedWithCode.length
                  ? `${publishedWithCode.join(", ")} ${publishedWithCode.length === 1 ? "shows" : "show"} ${initial.shortCode} and keep${publishedWithCode.length === 1 ? "s" : ""} it until the routine is published again.`
                  : "No published routine shows this code."}{" "}
                The working routine, workload and prints use the new code at once.</p>
            </div>
          ) : null}
          <Field name="designation" label="Designation" optional errors={errors("designation")}>
            {(props) => <>
              <input {...props} defaultValue={draft.designation} list="designation-options" autoComplete="off" className={inputClass} />
              <datalist id="designation-options">{DESIGNATION_SUGGESTIONS.map((d) => <option key={d} value={d} />)}</datalist>
            </>}
          </Field>
        </Group>

        <Group title="Employment" hint={mode === "create" ? "New teachers start as Active." : "Status (active, on leave, inactive) changes from the teacher page, not here."}>
          <Field name="employmentType" label="Employment type" errors={errors("employmentType")}>
            {(props) => <select {...props} defaultValue={draft.employmentType} className={inputClass}>
              <option value="" disabled>Choose…</option>
              {EMPLOYMENT_TYPES.map((type) => <option key={type} value={type}>{EMPLOYMENT_LABELS[type]}</option>)}
            </select>}
          </Field>
          <Field name="homeDepartmentId" label="Home department" errors={errors("homeDepartmentId")}
            hint={incomingChange ? "The Incoming badge will change with this department." : "Another department marks the teacher as Incoming (teaching CSE classes from outside)."}>
            {(props) => <select {...props} defaultValue={draft.homeDepartmentId} onChange={(event) => setDepartment(event.target.value)} className={inputClass}>
              <option value="" disabled>Choose…</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
            </select>}
          </Field>
          <Field name="advisoryLoadUnits" label="Workload limit" optional errors={errors("advisoryLoadUnits")}
            hint="Leave blank for the department default of 15. Going above it is a warning, never a block.">
            {(props) => <span className="flex items-center gap-2">
              <input {...props} defaultValue={draft.advisoryLoadUnits} inputMode="decimal" autoComplete="off" className={`${inputClass} max-w-[110px]`} />
              <span className="text-[13px] text-muted">units a term</span>
            </span>}
          </Field>
        </Group>

        <Group title="Contact" hint="Email does not create a portal account. Accounts are in People & Access.">
          <Field name="email" label="Email" optional errors={errors("email")}>
            {(props) => <input {...props} type="email" defaultValue={draft.email} autoComplete="off" spellCheck={false} className={inputClass} />}
          </Field>
          {privateContacts ? (
            <Field name="phonePrivate" label="Private phone" optional errors={errors("phonePrivate")}
              hint="Only coordinators and administrators see this. It is never written to the change log.">
              {(props) => <input {...props} type="tel" defaultValue={draft.phonePrivate} autoComplete="off" className={inputClass} />}
            </Field>
          ) : null}
        </Group>

        <Group title="Notes" hint="Internal; not printed." last>
          <Field name="notes" label="Notes" hideLabel wide errors={errors("notes")}>
            {(props) => <textarea {...props} defaultValue={draft.notes} rows={3} className={`${inputClass} min-h-[84px] py-2`} />}
          </Field>
        </Group>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-[var(--color-line)] bg-[#f9f7f0] px-4 py-3">
          <p className="text-[12.5px] text-muted">{lastSaved ?? (mode === "create" ? "The teacher is added as Active." : "")}</p>
          <div className="flex flex-wrap gap-2">
            <Link href={cancelHref} className={buttonClass.secondary}>Cancel</Link>
            <button type="submit" disabled={pending} className={buttonClass.primary}>
              {pending ? "Saving…" : mode === "create" ? "Add teacher" : mode === "resolve" ? "Record teacher" : "Save changes"}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}

function Group({ title, hint, children, last = false }: { title: string; hint: string; children: ReactNode; last?: boolean }) {
  return (
    <fieldset className={`grid gap-x-7 gap-y-3 px-4 py-4 md:grid-cols-[200px_minmax(0,1fr)] ${last ? "" : "border-b border-[var(--color-line-soft)]"}`}>
      <legend className="sr-only">{title}</legend>
      <div aria-hidden="true">
        <p className="font-display text-[15px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[12.5px] text-muted">{hint}</p>
      </div>
      <div className="grid content-start gap-x-5 gap-y-4 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

type InputProps = { id: string; name: string; "aria-invalid"?: true; "aria-describedby"?: string };

function Field({ name, label, optional = false, hint, errors, hideLabel = false, wide = false, children }: {
  name: TeacherField; label: string; optional?: boolean; hint?: string; errors: string[]; hideLabel?: boolean; wide?: boolean;
  children: (props: InputProps) => ReactNode;
}) {
  const id = `tf-${name}`;
  const described = [errors.length ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`grid content-start gap-1.5 text-[13.5px] ${wide ? "md:col-span-2" : ""}`}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "font-semibold"}>
        {label}{optional ? <span className="font-normal text-muted"> (optional)</span> : null}
      </label>
      {children({ id, name, "aria-invalid": errors.length ? true : undefined, "aria-describedby": described })}
      <FieldError id={`${id}-error`} messages={errors} />
      {hint ? <p id={`${id}-hint`} className="text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}
