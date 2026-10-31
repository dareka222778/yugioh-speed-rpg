/** Only the exact M26 append-only registrations are removed from historical proofs. */
const assert=require('node:assert/strict');
const additions=[["82828051", "9614382d160247ae3cf9ebdbe8b81e490ef140c379829fd1787f8592cddebc62"], ["59744639", "11a51cd1af09184e27ad504a8e34e558a576b83d84850336d64c1c1853d881a4"], ["83133491", "05746cd06be05aac24881a4247c92a1207ef3f9a2122ec0b3ddd02864a8463b8"], ["31785398", "443ac51498ffe5c76f7b00db3b889a9d3f323727693780e6559e3447f0d29044"]];
function strip(file,bytes){bytes=require('./mission27-reviewed-extensions.cjs').strip(file,bytes);let text=bytes.toString('utf8');const once=x=>{assert.equal(text.split(x).length,2,`M26 reviewed addition: ${file}`);text=text.replace(x,'');};
 if(file==='src/cardMetadata.ts'&&text.includes("import {positionBatch26}")){once("import {positionBatch26} from './positionBatch26';\n");once(',...positionBatch26');}
 if(file==='src/cardCertifications.ts'&&additions.some(([id])=>text.includes(`"${id}":`))){for(const [id,fingerprint]of additions)once(`  "${id}":{"fingerprint":"${fingerprint}","suites":["tests/positionBatch26.test.cjs"]},\n`);}
 return Buffer.from(text,'utf8');
}
module.exports={strip,additions};
