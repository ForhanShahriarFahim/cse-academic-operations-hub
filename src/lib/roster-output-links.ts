import type { TermWriteContext } from "./term-context-value";

export function rosterOutputQuery(groupId: number, context: TermWriteContext) {
  return `group=${groupId}&term=${context.activeTermId}&generation=${context.generation}`;
}
