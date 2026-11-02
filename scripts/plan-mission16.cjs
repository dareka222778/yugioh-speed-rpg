/** Triage is not certification. Unknown dependencies remain explicit. */
const fs=require('node:fs'),crypto=require('node:crypto');
function matrix(history,enabled,prior){
 const known=new Set(enabled),leads=new Map();
 for(const g of prior.groups)for(const c of g.examples??[]){const list=leads.get(c.id)??[];if(!list.includes(g.family))list.push(g.family);leads.set(c.id,list);}
 const records=history.filter(h=>!h.passwords.some(id=>known.has(id))).map(h=>({canonicalId:h.id,id:h.passwords[0]??null,name:h.names.en,kind:h.kind,regionDates:h.firstObserved,
  triageLeads:h.passwords.flatMap(id=>leads.get(id)??[]),principalOperation:null,secondaryOperations:null,dependencies:null,activation:null,complexity:'not individually reviewed',historicalEvidence:'imported dates; pre-cut official printing still required',certificationAllowed:false}));
 return {basis:'current registry; M13 examples are overlapping discovery leads, never equivalence or full-effect proof',historicalRecords:history.length,certified:known.size,remainingHistoricalRecords:records.length,
  priorities:[
   {priority:1,family:'continuous sources and counts',reuse:'existing v8',individualAdmission:['01434352','04542651','78193831']},
   {priority:2,family:'simultaneous LP damage and recovery',reuse:'new semantics required',example:'Goblin Thief',dependency:'v8 economic sequence checks victory before the subsequent gain; do not silently equate to simultaneous resolution'},
   {priority:3,family:'optional FLIP with paid LP cost',reuse:'prove trigger/cost decision before admission',example:'Needle Ball',dependency:'optional choice, payment and recovery must be exercised'},
   {priority:4,family:'player-selectable recovery',reuse:'new target vocabulary required',example:'Mooyan Curry',dependency:'cannot reduce choose-one-player to heal-self'},
   {priority:5,family:'end-phase and standby durations',reuse:'isolated next resolver when semantics differ',dependency:'phase-specific expiration, triggers, persistence and negation'}
  ],automation:{safe:['identity joins','duplicate detection','missing review report','fingerprint generation','test template generation','source preservation','actual execution gates'],requiresReview:['complete effect equivalence','historical printing discrepancies','secondary effects','certification']},records};
}
module.exports={matrix};
if(require.main===module){const paths=['catalog/historical/2004-10-01/cards.json','docs/evidence/mission13-remaining-families.json'];const [history,prior]=paths.map(p=>JSON.parse(fs.readFileSync(p,'utf8'))),report=matrix(history,require('../dist/effectRegistry').enabledCardIds,prior);report.sourceHashes=Object.fromEntries(paths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));fs.writeFileSync('docs/evidence/mission16-priority-matrix.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({certified:report.certified,remaining:report.remainingHistoricalRecords,priorities:report.priorities}));}
