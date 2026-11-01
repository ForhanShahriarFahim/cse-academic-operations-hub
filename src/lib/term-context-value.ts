/** Private operational context. Never include this in publication snapshots. */
export interface TermWriteContext { activeTermId: number; generation: number }
export function parseTermWriteContext(input: unknown): TermWriteContext | null {
  const value = input instanceof FormData
    ? { activeTermId: Number(input.get("_activeTermId")), generation: Number(input.get("_termGeneration")) }
    : input;
  if (!value || typeof value !== "object") return null;
  const { activeTermId, generation } = value as Partial<TermWriteContext>;
  return Number.isSafeInteger(activeTermId) && Number(activeTermId) > 0
    && Number.isSafeInteger(generation) && Number(generation) > 0
    ? { activeTermId: Number(activeTermId), generation: Number(generation) } : null;
}
export function appendTermContext(form: FormData, context: TermWriteContext): FormData {
  form.set("_activeTermId", String(context.activeTermId));
  form.set("_termGeneration", String(context.generation));
  return form;
}
