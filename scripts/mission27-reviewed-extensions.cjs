/** Strip only the exact owner-authorized M27 allowlist addition in historical source proofs. */
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const proof=require('../docs/evidence/mission27-release.json');
function strip(file,bytes){bytes=require('./mission28-reviewed-extensions.cjs').strip(file,bytes);let text=bytes.toString('utf8');
 if(file==='src/releasedCardIds.ts'&&text.includes('// M27: owner authorized distribution')){
  const block='\n  // M27: owner authorized distribution of all currently certified cards.\n'+proof.addedIds.map(id=>'  "'+id+'",\n').join('');
  assert.equal(crypto.createHash('sha256').update(block).digest('hex'),proof.appendedBlockSHA256);
  assert.equal(new Set(proof.addedIds).size,696);assert.equal(text.split(block).length,2);
  text=text.replace('  "06390406",'+block+']);\n','  "06390406"\n]);\n');
 }
 return Buffer.from(text,'utf8');
}
module.exports={strip};
