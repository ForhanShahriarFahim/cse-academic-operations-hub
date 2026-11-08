/** Import-boundary regression: injected-adapter helpers must never initialize the configured DB. */
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
const root=path.resolve(__dirname,".."),dbFile=path.join(root,"src/db/index.ts");
const loader=Module as unknown as {_load:(name:string,parent:unknown,main:boolean)=>unknown;_resolveFilename:(name:string,parent:unknown)=>string};
const original=loader._load;
loader._load=function(name,parent,main){
  const resolved=loader._resolveFilename(name,parent);
  if(path.resolve(resolved)===dbFile)throw new Error("An injected-adapter helper attempted to initialize the configured application database");
  return original.call(this,name,parent,main);
};
try{
  for(const name of ["term-lock","room-transaction","room-lifecycle-transaction","room-maintenance-transaction","batch-records","batch-store","rollover","rollover-store","term-protection"])assert.ok(require(path.join(root,"src/lib",name+".ts")));
  assert.equal(require.cache[dbFile],undefined);
  console.log("Injected adapter helpers import without loading src/db/index.ts; configured storage initialization is blocked by the regression guard.");
}finally{loader._load=original;}
