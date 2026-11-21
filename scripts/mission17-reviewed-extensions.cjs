/**
 * Remove only Mission 17's reviewed append-only admissions before comparing
 * byte-identical pre-M15 code. Unknown changes still fail the old hash checks.
 */
const assert=require('node:assert/strict');
const ids=['45311864','46700124','82108372','18891691','42883273'];
const importLine="import {mechanicalBatch17} from './mechanicalBatch17';\n";
function strip(file,bytes){
 let text=bytes.toString('utf8');
 const once=snippet=>{assert.equal(text.split(snippet).length,2,`M17 extension occurrence: ${file}`);text=text.replace(snippet,'');};
 if(file==='src/cardMetadata.ts'&&text.includes(importLine)){
  once(importLine);once(',...mechanicalBatch17');
 }
 if(file==='src/cardCertifications.ts'){
  const current=JSON.parse(text.slice(text.indexOf('={')+1,text.lastIndexOf('};')+1));
  if(ids.some(id=>Object.hasOwn(current,id))){
   assert.ok(ids.every(id=>Object.hasOwn(current,id)),'Incomplete Mission 17 certificate cohort');
   for(const id of ids){const certificate=current[id];assert.deepEqual(Object.keys(certificate).sort(),['fingerprint','suites']);assert.match(certificate.fingerprint,/^[a-f0-9]{64}$/);assert.deepEqual(certificate.suites,['tests/mechanicalBatch17.test.cjs']);}
   const first='  "45311864": {';
   assert.ok(text.indexOf(first)>=0,'Missing M17 append');
   const head=text.slice(0,text.indexOf(first));
   const tail=text.slice(text.indexOf(first));
   assert.match(head,/  },\n\n$/,'M17 certificates must follow the original final entry');
   assert.match(tail,/^  "45311864": {[\s\S]+  }\n};\n$/,'No code may follow M17 certificates');
   text=head.replace(/  },\n\n$/,'  }\n\n')+'};\n';
  }
 }
 return Buffer.from(text,'utf8');
}
module.exports={strip,ids};
