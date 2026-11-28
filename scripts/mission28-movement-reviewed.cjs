const assert=require('node:assert/strict'),crypto=require('node:crypto'),proof=require('../docs/evidence/mission28-movement-review.json');
function strip(file,bytes){bytes=require('./mission28-attack-reviewed.cjs').strip(file,bytes);let text=bytes.toString('utf8');const once=s=>{assert.equal(text.split(s).length,2,'M28 movement append '+file);text=text.replace(s,'');};
 if(file==='src/cardMetadata.ts'&&text.includes('import {movementBatch28}')){once("import {movementBatch28} from './movementBatch28';\n");once(',...movementBatch28');}
 if(file==='src/cardCertifications.ts'&&text.includes('tests/movementBatch28.test.cjs')){assert.equal(crypto.createHash('sha256').update(proof.certificateBlock).digest('hex'),proof.certificateBlockSHA256);once(proof.certificateBlock);text=text.replace(/([^\n])};\s*$/,"$1\n};\n");}
 if(file==='src/releasedCardIds.ts'&&text.includes('// M28 movements:'))once(proof.releaseBlock);return Buffer.from(text);
}
module.exports={strip};
