const assert=require('node:assert/strict'),crypto=require('node:crypto'),proof=require('../docs/evidence/mission28-recruit-review.json');
function strip(file,bytes){bytes=require('./mission29-destruction-reviewed.cjs').strip(file,bytes);let text=bytes.toString('utf8');const once=s=>{assert.equal(text.split(s).length,2,'M28 recruit append '+file);text=text.replace(s,'');};
 if(file==='src/cardMetadata.ts'&&text.includes('import {recruitBatch28}')){once("import {recruitBatch28} from './recruitBatch28';\n");once(',...recruitBatch28');}
 if(file==='src/cardCertifications.ts'&&text.includes('tests/recruitBatch28.test.cjs')){assert.equal(crypto.createHash('sha256').update(proof.certificateBlock).digest('hex'),proof.certificateBlockSHA256);once(proof.certificateBlock);text=text.replace(/([^\n])};\s*$/,'$1\n};\n');}
 if(file==='src/releasedCardIds.ts'&&text.includes('// M28 recruits:'))once(proof.releaseBlock);
 if(file==='src/duelStore.ts'&&text.includes(proof.aiHook)){assert.equal(crypto.createHash('sha256').update(proof.aiHook).digest('hex'),proof.aiHookSHA256);once(proof.aiHook);}return Buffer.from(text);
}
module.exports={strip};
