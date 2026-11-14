/** Only remove the exact reviewed M28 append from protected historical proofs. */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),proof=require('../docs/evidence/mission28-review.json');
function strip(file,bytes){bytes=require('./mission28-movement-reviewed.cjs').strip(file,bytes);let text=bytes.toString('utf8');const once=s=>{assert.equal(text.split(s).length,2,'M28 reviewed append '+file);text=text.replace(s,'');};
 if(file==='src/cardMetadata.ts'&&text.includes('import {mechanicalBatch28}')){once("import {mechanicalBatch28} from './mechanicalBatch28';\n");once(',...mechanicalBatch28');}
 if(file==='src/cardCertifications.ts'&&text.includes('tests/mechanicalBatch28.test.cjs')){const block=proof.certificateBlock;assert.equal(crypto.createHash('sha256').update(block).digest('hex'),proof.certificateBlockSHA256);once(block);text=text.replace(/\n  },\n\n};\s*$/,'\n  }\n\n};\n');}
 if(file==='src/releasedCardIds.ts'&&text.includes('// M28:'))once(proof.releaseBlock);
 return Buffer.from(text);
}
module.exports={strip};
