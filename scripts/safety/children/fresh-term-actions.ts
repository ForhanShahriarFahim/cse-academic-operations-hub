/**
 * Existing scenarios represent freshly rendered pages. Supply their new explicit
 * context at submission; production modules remain untouched. SET-01A scenarios
 * deliberately use raw actions for missing/stale/ABA checks, never this adapter.
 */
import { loadApp } from "./controlled-runtime";
const arity: Record<string,number> = {
  createMeetingAction:1,moveMeetingAction:4,updateMeetingAction:2,deleteMeetingAction:1,
  createExternalAction:1,verifyExternalAction:1,deleteExternalAction:1,publishAction:1,
  updateAcademicPolicyAction:1,createExtraLoadClassAction:1,deleteExtraLoadClassAction:1,
  createManualTopSheetRowAction:1,deleteManualTopSheetRowAction:1,upsertStudentAction:1,
  importStudentCsvAction:1,deactivateStudentAction:2,createAttendanceSessionAction:1,
  saveAttendanceAction:2,deleteAttendanceSessionAction:1,applyAutoScheduleAction:0,
  savePatternAction:1,deletePatternAction:2,setDayPlanAction:1,removeExceptionAction:2,copyGridFromTermAction:2,
};
export function freshTermActions<T extends object>(module:T):T {
  return new Proxy(module,{get(target,key,receiver){
    const value=Reflect.get(target,key,receiver);
    if(typeof key!=="string"||typeof value!=="function"||!(key in arity)&&key!=="setTeacherStatusAction")return value;
    return async(...args:unknown[])=>{
      const context=loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
      const expected=await context.captureActiveContext().then(x=>x.writeContext).catch(()=>({activeTermId:1,generation:1}));
      if(key==="setTeacherStatusAction"){
        const form=args[1] as FormData;
        form.set("_activeTermId",String(expected.activeTermId));form.set("_termGeneration",String(expected.generation));
      }else args[arity[key]]=expected;
      return (value as (...parameters:unknown[])=>unknown)(...args);
    };
  }});
}
