/** Remove only explicit append-only admissions when checking preserved baselines. */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),proof=require('../docs/evidence/mission29-combat-review.json');
function strip(file,bytes){bytes=require('./mission29-trigger-reviewed.cjs').strip(file,bytes);if(!['src/cardMetadata.ts','src/cardCertifications.ts','src/releasedCardIds.ts'].includes(file))return bytes;let text=bytes.toString('utf8');const once=s=>{assert.equal(text.split(s).length,2,'M29 combat append '+file);text=text.replace(s,'');};
 if(file==='src/cardMetadata.ts'&&text.includes('import {combatBatch29}')){once("import {combatBatch29} from './combatBatch29';\n");once(',...combatBatch29');}
 if(file==='src/cardCertifications.ts'&&text.includes('tests/combatBatch29.test.cjs')){assert.equal(crypto.createHash('sha256').update(proof.certificateBlock).digest('hex'),proof.certificateBlockSHA256);once(proof.certificateBlock);}
 if(file==='src/releasedCardIds.ts'&&text.includes('// M29 combat:')){assert.equal(crypto.createHash('sha256').update(proof.releaseBlock).digest('hex'),proof.releaseBlockSHA256);once(proof.releaseBlock);}
 return Buffer.from(text);
}
module.exports={strip};
