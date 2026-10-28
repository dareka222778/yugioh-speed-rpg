/** Bounded normalization of reviewed development additions; archives stay byte-exact. */
const assert=require('node:assert/strict');
const ids=['91932350','52040216','40453765','20394040','47480070','38033121','11901678','63224564','27967615','81380218','10012614'];
function strip(file,bytes){bytes=require('./mission24-reviewed-extensions.cjs').strip(file,bytes);bytes=require('./mission22-reviewed-extensions.cjs').strip(file,bytes);let text=bytes.toString('utf8');
 const once=part=>{assert.equal(text.split(part).length,2,`M21 reviewed addition: ${file}`);text=text.replace(part,'');};
 if(file==='src/cardCatalog.ts'&&text.includes('; alwaysTreatedAs?:string'))once('; alwaysTreatedAs?:string; archetypes?:readonly string[]');
 if(file==='src/cardMetadata.ts'&&text.includes("import {mechanicalBatch20}")){once("import {mechanicalBatch20} from './mechanicalBatch20';\n");once(',...mechanicalBatch20');}
 if(file==='src/decks.ts'&&text.includes("import {rulesCardName}")){
  once("import {rulesCardName} from './cardIdentity';\n");
  for(const line of text.split('\n').filter(l=>l.includes('const byRulesName=')||l.includes('byRulesName.set(')||l.includes('of byRulesName)')))once(line+'\n');
 }
 if(file==='src/cardCertifications.ts'){
  const current=JSON.parse(text.slice(text.indexOf('={')+1,text.lastIndexOf('};')+1));
  if(ids.some(id=>Object.hasOwn(current,id))){assert.ok(ids.every(id=>Object.hasOwn(current,id)));const additions=Object.fromEntries(ids.map(id=>[id,current[id]]));
   for(const c of Object.values(additions)){assert.deepEqual(Object.keys(c).sort(),['fingerprint','suites']);assert.match(c.fingerprint,/^[a-f0-9]{64}$/);assert.deepEqual(c.suites,['tests/mission21ActiveBatch.test.cjs']);}
   once('\n,'+JSON.stringify(additions,null,2).slice(1,-1));
  }
 }
 return Buffer.from(text,'utf8');
}
module.exports={strip,ids};
