import { it } from "vitest";
import { batteryReport, DEFAULT_PROFILE as D, simulate } from "../scenario";
it("x",()=>{
for (const ct of ["vast","variabel","dynamisch"] as const) for (const kwh of [5,10]) for (const sel of [["battery"],["solar","battery"]]) for (const nm of [true,false]){
 const p={...D,consumption:4300,existingPanels:8,existingYield:3060,newPanels:8,newBattery:kwh,contractType:ct,netMetering:nm,year:2026};
 const r=batteryReport(p,sel); const y=r.y2026, z=r.y2027;
 console.log(ct,kwh,sel.join("+"),"nm",nm,"26:",y.net.toFixed(0),"27:",z.net.toFixed(0),"imp",z.avoidedImport.toFixed(0),"miss",z.missedExport.toFixed(0),"self",z.extraSelfKwh.toFixed(0));
}});
