/** Strip checksum-reviewed M30 admissions before comparing older immutable baselines. */
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const proof=require('../docs/evidence/mission30-conditional-review.json');
const hash=content=>crypto.createHash('sha256').update(content).digest('hex');
function strip(file,bytes){
 bytes=require('./mission31-target-reviewed.cjs').strip(file,bytes);
 bytes=require('./generated-batch-reviewed.cjs').strip(file,bytes);
 if(!['src/cardMetadata.ts','src/cardCertifications.ts','src/releasedCardIds.ts'].includes(file))return require('./mission29-destruction-reviewed.cjs').strip(file,bytes);
 let source=bytes.toString('utf8');
 const once=s=>{assert.equal(source.split(s).length,2,`M30 reviewed append ${file}`);source=source.replace(s,'');};
 const block=(start,end,includeEndNewline,sha)=>{
  const a=source.indexOf(start);if(a<0)return;
  const b=source.indexOf(end,a+start.length);assert.ok(b>a,`M30 reviewed end ${file}`);
  const finish=b+(includeEndNewline?1:0),content=source.slice(a,finish);
  assert.equal(hash(content),sha,`M30 reviewed SHA-256 ${file}`);
  source=source.slice(0,a)+source.slice(finish);
 };
 if(file==='src/cardMetadata.ts'&&source.includes('import {conditionalBatch30}')){once("import {conditionalBatch30} from './conditionalBatch30';\n");once(',...conditionalBatch30');}
 if(file==='src/cardCertifications.ts')block('\n\n, "13839120":','\n\n};',false,proof.certificateBlockSHA256);
 if(file==='src/releasedCardIds.ts')block('// M30 conditional destruction','\n]);',true,proof.releaseBlockSHA256);
 return require('./mission29-destruction-reviewed.cjs').strip(file,Buffer.from(source));
}
module.exports={strip};
