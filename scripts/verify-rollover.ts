import assert from "node:assert/strict";
import { parseRolloverPlan, rolloverDecisions, planGridClone, type RolloverCohort } from "../src/lib/rollover";
const cohort: RolloverCohort = {id:1,label:"SYNTH",stream:"HSC",status:"active",semester:2,studentCount:0,confidence:"verified"};
const choice = {batchId:1,disposition:"progress",carryCount:true,reason:"",graduateConfirmed:false};
const raw = {sourceId:"1",targetId:"2",cloneGrid:"off",reason:"Synthetic review",choices:JSON.stringify([choice])};
const plan = parseRolloverPlan(raw);
assert.equal(rolloverDecisions([cohort],plan.choices)[0].destinationSemester,3);
assert.equal(rolloverDecisions([cohort],plan.choices)[0].destinationCount,0);
for (const change of [{sourceId:"1.0"},{sourceId:"2"},{targetId:"0"},{reason:""},{cloneGrid:"yes"},{choices:"{}"},{choices:JSON.stringify([choice,choice])},{choices:JSON.stringify([{...choice,evil:true}])},{choices:JSON.stringify([{...choice,disposition:"graduate"}])}]) assert.throws(() => parseRolloverPlan({...raw,...change}));
assert.throws(() => rolloverDecisions([{...cohort,semester:8}],plan.choices));
assert.throws(() => rolloverDecisions([{...cohort,status:"inactive"}],plan.choices));
assert.throws(() => rolloverDecisions([cohort],[]));
assert.throws(() => rolloverDecisions([{...cohort,studentCount:-1}],plan.choices));
assert.equal(rolloverDecisions([{...cohort,studentCount:-1}],[{...plan.choices[0],carryCount:false}])[0].destinationCount,null);
for (const disposition of ["repeat","hold","graduate"] as const) {
  const c = {...plan.choices[0],disposition,reason:"Synthetic decision",graduateConfirmed:true};
  const d = rolloverDecisions([cohort],[c])[0];
  assert.equal(d.destinationSemester,disposition === "repeat" ? 2 : null);
}
const pattern = {id:1,termId:1,name:"Morning",periods:[{start:480,end:540}],breaks:[]};
const day = {id:1,termId:1,stream:"HSC",batchId:null,dayOfWeek:0,patternId:1,reason:null};
const exception = {...day,id:2,batchId:1,dayOfWeek:1,patternId:null};
const window = {id:1,termId:1,stream:"HSC",batchId:null,dayOfWeek:0,startMinutes:480,endMinutes:540,requiresExceptionNote:null};
const cloned = planGridClone(1,[pattern],[day,exception],[window,{...window,id:2,termId:null}],[cohort],[]);
assert.equal(cloned.plans.length,1); assert.equal(cloned.excludedExceptions,1); assert.equal(cloned.legacyWindows,1);
assert.equal(planGridClone(1,[pattern],[day,exception],[window],[cohort],[1]).plans[1].patternId,null);
for (const fn of [() => planGridClone(1,[pattern],[day,day],[window],[cohort],[1]),() => planGridClone(1,[pattern],[{...day,patternId:99}],[window],[cohort],[1]),() => planGridClone(1,[pattern],[{...day,batchId:2}],[window],[cohort],[1]),() => planGridClone(1,[pattern],[day],[{...window,endMinutes:20}],[cohort],[1]),() => planGridClone(1,[{...pattern,periods:[]}],[day],[window],[cohort],[1])]) assert.throws(fn);
console.log("Rollover: strict parser, disposition boundaries, verified-zero carry, invalid legacy count, clone scope/ID/duplicate/time rules pass.");
