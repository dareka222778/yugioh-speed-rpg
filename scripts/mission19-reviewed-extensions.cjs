/** Remove the reviewed packet P001 append when verifying the Mission 15 baseline. */
const assert=require('node:assert/strict');
const ids=['68638985','14898066'];
const importLine="import {historicalNormalBatch19} from './historicalNormalBatch19';\n";
function strip(file,bytes){
 let source=bytes.toString('utf8');
 const once=(text)=>{assert.equal(source.split(text).length,2,`M19 append occurrence: ${file}`);source=source.replace(text,'');};
 if(file==='src/cardMetadata.ts'&&source.includes(importLine)){
  once(importLine);once(',...historicalNormalBatch19');
 }
 if(file==='src/cardCertifications.ts'){
  const current=JSON.parse(source.slice(source.indexOf('={')+1,source.lastIndexOf('};')+1));
  if(ids.some(id=>Object.hasOwn(current,id))){
   assert.ok(ids.every(id=>Object.hasOwn(current,id)),'Partial P001 append');
   for(const id of ids){assert.deepEqual(Object.keys(current[id]).sort(),['fingerprint','suites']);assert.match(current[id].fingerprint,/^[a-f0-9]{64}$/);assert.deepEqual(current[id].suites,['tests/historicalNormalBatch19.test.cjs']);}
   const start='  "68638985": {';
   assert.ok(source.includes(start),'First P001 card absent');
   const prefix=source.slice(0,source.indexOf(start)),suffix=source.slice(source.indexOf(start));
   assert.match(prefix,/  },\n$/,'Previous certificate must be preserved');
   assert.match(suffix,/^  "68638985": {[\s\S]*  "14898066": {[\s\S]*\n  }\n};\n$/,'No unreviewed certificates after P001');
   source=prefix.replace(/  },\n$/,'  }\n')+'};\n';
  }
 }
 return Buffer.from(source,'utf8');
}
module.exports={strip,ids};
