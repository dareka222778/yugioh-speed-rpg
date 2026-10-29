/** Exact, checksum-reviewed extensions to the M29 release; no archived engine rewrites. */
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const proof=require('../docs/evidence/mission29-destruction-review.json');
const hash=content=>crypto.createHash('sha256').update(content).digest('hex');
function strip(file,bytes){
 bytes=require('./mission29-combat-reviewed.cjs').strip(file,bytes);
 if(!['src/cardMetadata.ts','src/cardCertifications.ts','src/releasedCardIds.ts'].includes(file))return bytes;
 let source=bytes.toString('utf8');
 const once=fragment=>{assert.equal(source.split(fragment).length,2,`M29 destruction append: ${file}`);source=source.replace(fragment,'');};
 const block=(start,end,includeEndNewline,expected)=>{
  const a=source.indexOf(start);
  if(a<0)return;
  const b=source.indexOf(end,a+start.length);
  assert.ok(b>a,`M29 destruction block closing marker: ${file}`);
  const finish=b+(includeEndNewline?1:0),content=source.slice(a,finish);
  assert.equal(hash(content),expected,`M29 destruction append checksum: ${file}`);
  source=source.slice(0,a)+source.slice(finish);
 };
 if(file==='src/cardMetadata.ts'&&source.includes('import {destructionBatch29}')){once("import {destructionBatch29} from './destructionBatch29';\n");once(',...destructionBatch29');}
 if(file==='src/cardCertifications.ts')block('\n, // M29 destruction:', '\n\n};',false,proof.certificateBlockSHA256);
 if(file==='src/releasedCardIds.ts')block('// M29 destruction:', '\n]);',true,proof.releaseBlockSHA256);
 return Buffer.from(source);
}
module.exports={strip};
