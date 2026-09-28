const fs=require('fs');const vm=require('vm');
const ctx={console,Math,Float64Array,Array,Object,Map,Set,JSON,isFinite,Infinity,module:undefined};vm.createContext(ctx);
for(const f of ['core.js','vehicle.js'])vm.runInContext(fs.readFileSync(f,'utf8').replace(/if\(typeof module[\s\S]*$/,''),ctx);
const cy=JSON.parse(fs.readFileSync('cycles.json','utf8'));
vm.runInContext('var CYC='+JSON.stringify({wmtc1:cy.wmtc1,w12:cy.wmtc1.concat(cy.wmtc2),tsdc:cy.tsdc,tsdcGrade:cy.tsdcGrade}),ctx);
vm.runInContext(fs.readFileSync('engine.js','utf8').replace(/if\(typeof module[\s\S]*$/,''),ctx);
module.exports=ctx;
