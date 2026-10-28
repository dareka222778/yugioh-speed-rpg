/** Normalize only the explicitly reviewed AI hook and append-only card data.
 * Everything outside these bounded additions must retain the original Git hash. */
const assert=require('node:assert/strict');
const ids=['26725158','21323861','56606928','20101223','90873992','94716515','95051344','90330453'];
const aiImport="import {filteredDestructionUtility} from './filteredDestructionStrategy';\n";
const aiHook="  if(effect.kind==='destroyFiltered')return filteredDestructionUtility(s,p===s.players[0]?0:1,effect)>0;\n";
const metadataImport="import {mechanicalBatch15} from './mechanicalBatch15';\n";
function removeOnce(text,part){assert.equal(text.split(part).length,2,'Reviewed extension must occur exactly once');return text.replace(part,'');}
function baselineBytes(file,bytes){bytes=require('./mission18-reviewed-extensions.cjs').strip(file,bytes);bytes=require('./mission17-reviewed-extensions.cjs').strip(file,bytes);bytes=require('./mission16-reviewed-extensions.cjs').strip(file,bytes);let text=bytes.toString('utf8');
 if(file==='src/duelStore.ts'&&text.includes(aiImport)){text=removeOnce(text,aiImport);text=removeOnce(text,aiHook);}
 if(file==='src/cardMetadata.ts'&&text.includes(metadataImport)){text=removeOnce(text,metadataImport);text=removeOnce(text,',...mechanicalBatch15');}
 if(file==='src/cardCertifications.ts'){
  const current=JSON.parse(text.slice(text.indexOf('={')+1,text.lastIndexOf('};')+1));
  if(!ids.some(id=>Object.hasOwn(current,id)))return bytes;
  assert.ok(ids.every(id=>Object.hasOwn(current,id)));const additions=Object.fromEntries(ids.map(id=>[id,current[id]]));
  for(const c of Object.values(additions)){assert.deepEqual(Object.keys(c).sort(),['fingerprint','suites']);assert.match(c.fingerprint,/^[a-f0-9]{64}$/);assert.deepEqual(c.suites,['tests/filteredDestruction15.test.cjs','tests/mechanicalBatch15.test.cjs']);}
  text=removeOnce(text,'\n,'+JSON.stringify(additions,null,2).slice(1,-1));
 }
 return Buffer.from(text,'utf8');
}
module.exports={baselineBytes,aiImport,aiHook,metadataImport,ids};
