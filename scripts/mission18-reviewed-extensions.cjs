/** Independently bounded Mission 18 append-only admissions for older hashes. */
const assert=require('node:assert/strict');
const ids=['23995348','37101832'];
const importLine="import {mechanicalBatch18} from './mechanicalBatch18';\n";
function strip(file,bytes){
 let text=bytes.toString('utf8');
 const once=snippet=>{assert.equal(text.split(snippet).length,2,`M18 extension occurrence: ${file}`);text=text.replace(snippet,'');};
 if(file==='src/cardMetadata.ts'&&text.includes(importLine)){
  once(importLine);once(',...mechanicalBatch18');
 }
 if(file==='src/cardCertifications.ts'){
  const current=JSON.parse(text.slice(text.indexOf('={')+1,text.lastIndexOf('};')+1));
  if(ids.some(id=>Object.hasOwn(current,id))){
   assert.ok(ids.every(id=>Object.hasOwn(current,id)),'Incomplete Mission 18 certificate cohort');
   for(const id of ids){const c=current[id];assert.deepEqual(Object.keys(c).sort(),['fingerprint','suites']);assert.match(c.fingerprint,/^[a-f0-9]{64}$/);assert.deepEqual(c.suites,['tests/mechanicalBatch18.test.cjs']);}
   const first='  "23995348": {';
   assert.ok(text.includes(first),'Missing M18 append');
   const head=text.slice(0,text.indexOf(first)),tail=text.slice(text.indexOf(first));
   assert.match(head,/  },\n$/,'M18 certificates must follow the original final entry');
   assert.match(tail,/^  "23995348": {[\s\S]+  }\n};\n$/,'No code may follow M18 certificates');
   text=head.replace(/  },\n$/,'  }\n')+'};\n';
  }
 }
 return Buffer.from(text,'utf8');
}
module.exports={strip,ids};
