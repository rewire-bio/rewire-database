import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { deployedContributionHttpHandler } from "../src/http-handler.js";

test("audit GET procedures remain accessible while contribution activation is disabled", async()=>{
 const previous=process.env.OMICS_CONTRIBUTIONS_ENABLED;delete process.env.OMICS_CONTRIBUTIONS_ENABLED;
 const server=createServer(deployedContributionHttpHandler);
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/trpc/`;
 try{
  for(const name of ["auditRuns","auditRecords","auditChecks"]){
   const response=await fetch(`${base}catalogue.${name}?input=${encodeURIComponent(JSON.stringify({release_id:"INVALID RELEASE"}))}`);
   assert.equal(response.status,400,name);
   assert.equal((await response.json()).error.data.code,"BAD_REQUEST");
  }
  const mutation=await fetch(`${base}catalogue.auditChecks`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});assert.equal(mutation.status,503);
  const mixed=await fetch(`${base}catalogue.auditRuns,submission.list?batch=1`);assert.equal(mixed.status,503);
 }finally{
  if(previous===undefined)delete process.env.OMICS_CONTRIBUTIONS_ENABLED;else process.env.OMICS_CONTRIBUTIONS_ENABLED=previous;
  server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 }
});
