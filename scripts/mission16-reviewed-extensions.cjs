/** Remove only the explicitly bounded data admission before historical byte checks. */
const assert=require('node:assert/strict');
const ids=['01434352','04542651','78193831'];
function strip(file,bytes){let text=bytes.toString('utf8');const once=part=>{assert.equal(text.split(part).length,2,'M16 extension must occur once');text=text.replace(part,'');};
 if(file==='src/cardMetadata.ts'&&text.includes("import {mechanicalBatch16}")){once("import {mechanicalBatch16} from './mechanicalBatch16';\n");once(',...mechanicalBatch16');}
 if(file==='src/cardCertifications.ts'){
  const current=JSON.parse(text.slice(text.indexOf('={')+1,text.lastIndexOf('};')+1));
  if(ids.some(id=>Object.hasOwn(current,id))){assert.ok(ids.every(id=>Object.hasOwn(current,id)));const added=Object.fromEntries(ids.map(id=>[id,current[id]]));
   for(const certificate of Object.values(added)){assert.deepEqual(Object.keys(certificate).sort(),['fingerprint','suites']);assert.match(certificate.fingerprint,/^[a-f0-9]{64}$/);assert.deepEqual(certificate.suites,['tests/mechanicalBatch16.test.cjs']);}
   once('\n,'+JSON.stringify(added,null,2).slice(1,-1));
  }
 }
 return Buffer.from(text,'utf8');
}
module.exports={strip,ids};
