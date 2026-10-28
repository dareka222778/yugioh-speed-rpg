/** Remove only the exact newly reviewed M23/M24 append-only registrations before
 * comparing the historical M15/M21 source proofs. Unknown edits still fail. */
const assert=require('node:assert/strict');
const additions=[
 ['99518961','0f942d1998a3dd33089cfd4cc6b4349cb2e0282a9e5d9706d8806185a00cf866','economicCountBatch24'],
 ['27053506','7b9891c069cfae62aba900a16d36208ede256a05b3a0dff02b3f17cdcd78eacf','economicCountBatch24'],
 ['51394546','cbe35c4c0b88ff8d7fcbcbc2bde06f828760c3616f26259c97019b68e3d97c8c','economicCountBatch24'],
 ['98299011','9f0da84ed0d0ba609ee57b73d79d0387235ed9bb2331220215307d804366ab32','economicCountBatch24'],
 ['44472639','630d110bb78fff689f4ed5663e51f21b01eb917009d247254ccafd929ee41030','economicCountBatch24'],
 ['58074572','5bc33794ffec7b0182e28cdd9d5c74ac1f8c1e8dae482af83a359442f811e44b','economicBatch23'],
 ['08842266','5a4a4786e3c0bd0632bd77810cf3fc15143054140b5e7d66b0d01e77a88835b8','economicBatch23']
];
function strip(file,bytes){let text=bytes.toString('utf8');const once=part=>{assert.equal(text.split(part).length,2,`M24 reviewed addition: ${file}`);text=text.replace(part,'');};
 if(file==='src/cardMetadata.ts'){
  const first="import {economicCountBatch24} from './economicCountBatch24';\n";
  const second="import {economicBatch23} from './economicBatch23';\n";
  if(text.includes(first)||text.includes(second)){once(first);once(second);once(',...economicBatch23,...economicCountBatch24');}
 }
 if(file==='src/cardCertifications.ts'){
  const found=additions.some(([id])=>text.includes(`"${id}":`));
  if(found){for(const [id,fingerprint,batch] of additions)once(`  "${id}":{"fingerprint":"${fingerprint}","suites":["tests/${batch}.test.cjs"]},\n`);}
 }
 return Buffer.from(text,'utf8');
}
module.exports={strip,additions};
