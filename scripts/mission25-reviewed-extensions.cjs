/** Exact M25 append-only boundary for M15 historical source-byte verification. */
const assert=require('node:assert/strict');
const additions=[
 ['73628505','a59f760372ad8651a81311c763861c92d4de37768f59b34b2109cfe503533851'],
 ['32807846','5af969bfa4a28e4cc73e9280dca281b3eb90718d7f77ed1994f93591ff5778de'],
 ['26902560','d408583b8d2585f85e761a00f9144d3aaddbe3ab64e5ca559d6a770575e32c42'],
 ['95281259','1785aaac21c47b33e856ebe384800e88f39031ee8fdd6551334b5447b869dab8'],
 ['89997728','c9ce54e9346a4bb47ec5479eda8d1ae300fb67c9280a8651f4ab192b717dfa28'],
 ['06390406','37a4601e4dc1953f548239e25484017155338c1d1d223b69d2b914d94f6f0d8f']
];
function strip(file,bytes){let text=bytes.toString('utf8');const once=x=>{assert.equal(text.split(x).length,2,`M25 reviewed addition: ${file}`);text=text.replace(x,'');};
 if(file==='src/cardMetadata.ts'&&text.includes("import {searchSpellBatch25}")){
  once("import {searchSpellBatch25} from './searchSpellBatch25';\n");once(',...searchSpellBatch25');
 }
 if(file==='src/cardCertifications.ts'&&additions.some(([id])=>text.includes(`"${id}":`))){
  for(const [id,fingerprint] of additions)once(`  "${id}":{"fingerprint":"${fingerprint}","suites":["tests/searchSpellBatch25.test.cjs"]},\n`);
 }
 return Buffer.from(text,'utf8');
}
module.exports={strip,additions};
