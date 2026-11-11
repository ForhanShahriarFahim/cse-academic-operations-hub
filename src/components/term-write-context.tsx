"use client";

import { createContext, useContext, useState } from "react";
import type { TermWriteContext } from "@/lib/term-context-value";
import { appendTermContext } from "@/lib/term-context-value";
import type { ActionResult } from "@/lib/action-result";
import * as a0 from "@/lib/actions";
import * as a1 from "@/lib/academic-actions";
import * as a2 from "@/lib/time-grid-actions";
import { setTeacherStatusAction as teacherStatus } from "@/lib/teacher-actions";

const TermScope = createContext<{ value: TermWriteContext; report: (r: ActionResult) => ActionResult } | null>(null);
/** The value comes from the SAME page data as its forms, never the layout's independently loaded term. */
export function TermWriteProvider({value,children}:{value:TermWriteContext;children:React.ReactNode}) {
 const contextKey=`${value.activeTermId}:${value.generation}`;
 const [notice,setNotice]=useState<{contextKey:string;message:string}|null>(null);
 function report(result:ActionResult){if(result.outcome?.kind==='stale'&&/term|context/i.test(result.message))setNotice({contextKey,message:result.message});return result;}
 // A soft refresh can preserve client state. Remount forms when their context
 // changes so A's uncontrolled inputs/undo closures cannot adopt B's token.
 return <TermScope.Provider key={contextKey} value={{value,report}}>{notice?.contextKey===contextKey&&<div role="alert" className="no-print mb-4 rounded-md border border-[var(--color-clay)]/40 bg-[var(--color-clay)]/5 p-4 text-sm"><p>{notice.message}</p><button type="button" onClick={()=>location.reload()} className="mt-2 font-semibold underline">Refresh active workspace</button></div>}{children}</TermScope.Provider>;
}
export function useTermActions(){
 const scope=useContext(TermScope);const context=scope?.value;
 const report=(result:ActionResult)=>scope?.report(result)??result;
 return {
  createMeetingAction: (formData: Parameters<typeof a0.createMeetingAction>[0]) => a0.createMeetingAction(formData, context).then(report),
  moveMeetingAction: (meetingId: Parameters<typeof a0.moveMeetingAction>[0], dayOfWeek: Parameters<typeof a0.moveMeetingAction>[1], startMinutes: Parameters<typeof a0.moveMeetingAction>[2], endMinutes: Parameters<typeof a0.moveMeetingAction>[3]) => a0.moveMeetingAction(meetingId, dayOfWeek, startMinutes, endMinutes, context).then(report),
  updateMeetingAction: (meetingId: Parameters<typeof a0.updateMeetingAction>[0], update: Parameters<typeof a0.updateMeetingAction>[1]) => a0.updateMeetingAction(meetingId, update, context).then(report),
  deleteMeetingAction: (meetingId: Parameters<typeof a0.deleteMeetingAction>[0]) => a0.deleteMeetingAction(meetingId, context).then(report),
  createExternalAction: (formData: Parameters<typeof a0.createExternalAction>[0]) => a0.createExternalAction(formData, context).then(report),
  verifyExternalAction: (id: Parameters<typeof a0.verifyExternalAction>[0]) => a0.verifyExternalAction(id, context).then(report),
  deleteExternalAction: (id: Parameters<typeof a0.deleteExternalAction>[0]) => a0.deleteExternalAction(id, context).then(report),
  publishAction: (changeSummary: Parameters<typeof a0.publishAction>[0], expectedLatestVersionId: number | null) => a0.publishAction(changeSummary, context, expectedLatestVersionId).then(report),
  updateAcademicPolicyAction: (formData: Parameters<typeof a1.updateAcademicPolicyAction>[0]) => a1.updateAcademicPolicyAction(formData, context).then(report),
  createExtraLoadClassAction: (formData: Parameters<typeof a1.createExtraLoadClassAction>[0]) => a1.createExtraLoadClassAction(formData, context).then(report),
  deleteExtraLoadClassAction: (id: Parameters<typeof a1.deleteExtraLoadClassAction>[0]) => a1.deleteExtraLoadClassAction(id, context).then(report),
  createManualTopSheetRowAction: (formData: Parameters<typeof a1.createManualTopSheetRowAction>[0]) => a1.createManualTopSheetRowAction(formData, context).then(report),
  deleteManualTopSheetRowAction: (id: Parameters<typeof a1.deleteManualTopSheetRowAction>[0]) => a1.deleteManualTopSheetRowAction(id, context).then(report),
  upsertStudentAction: (formData: Parameters<typeof a1.upsertStudentAction>[0]) => a1.upsertStudentAction(formData, context).then(report),
  importStudentCsvAction: (formData: Parameters<typeof a1.importStudentCsvAction>[0]) => a1.importStudentCsvAction(formData, context).then(report),
  deactivateStudentAction: (studentId: Parameters<typeof a1.deactivateStudentAction>[0], teachingGroupId: Parameters<typeof a1.deactivateStudentAction>[1]) => a1.deactivateStudentAction(studentId, teachingGroupId, context).then(report),
  createAttendanceSessionAction: (formData: Parameters<typeof a1.createAttendanceSessionAction>[0]) => a1.createAttendanceSessionAction(formData, context).then(report),
  saveAttendanceAction: (sessionId: Parameters<typeof a1.saveAttendanceAction>[0], values: Parameters<typeof a1.saveAttendanceAction>[1]) => a1.saveAttendanceAction(sessionId, values, context).then(report),
  deleteAttendanceSessionAction: (id: Parameters<typeof a1.deleteAttendanceSessionAction>[0]) => a1.deleteAttendanceSessionAction(id, context).then(report),
  applyAutoScheduleAction: () => a1.applyAutoScheduleAction(context).then(report),
  savePatternAction: (input: Parameters<typeof a2.savePatternAction>[0]) => a2.savePatternAction(input, context).then(report),
  deletePatternAction: (patternId: Parameters<typeof a2.deletePatternAction>[0], expectedUpdatedAt: Parameters<typeof a2.deletePatternAction>[1]) => a2.deletePatternAction(patternId, expectedUpdatedAt, context).then(report),
  setDayPlanAction: (input: Parameters<typeof a2.setDayPlanAction>[0]) => a2.setDayPlanAction(input, context).then(report),
  removeExceptionAction: (planId: Parameters<typeof a2.removeExceptionAction>[0], expectedUpdatedAt: Parameters<typeof a2.removeExceptionAction>[1]) => a2.removeExceptionAction(planId, expectedUpdatedAt, context).then(report),
  copyGridFromTermAction: (sourceTermId: Parameters<typeof a2.copyGridFromTermAction>[0], expectedPatternCount: Parameters<typeof a2.copyGridFromTermAction>[1]) => a2.copyGridFromTermAction(sourceTermId, expectedPatternCount, context).then(report),
  setTeacherStatusAction: (previous:ActionResult|null,form:FormData)=>teacherStatus(previous,context?appendTermContext(form,context):form).then(report),
 };
}
