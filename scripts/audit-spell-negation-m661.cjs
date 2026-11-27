'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(file)=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const evidence=read('docs/evidence/m661-spell-negation.json');
const manifest=read('catalog/engine-v9/manifest.json');
const revision=manifest.revisions.find(item=>item.id===manifest.current);
assert.ok(revision,'engine-v9 current revision must exist');
const catalog=read(path.join('catalog/engine-v9',revision.file));
const ids=catalog.cards.map(card=>card.id);
assert.equal(new Set(ids).size,ids.length,'catalog IDs must remain unique');
for(const id of ['84636823','61740673']){
 assert.ok(!ids.includes(id),'M661 candidates must not be silently admitted: '+id);
}
assert.equal(evidence.certification.status,'not-certified');
assert.equal(evidence.certification.newCertifications,0);
assert.equal(evidence.inventoryGrants,0);
assert.equal(evidence.base.catalogEntries,969,'recorded base catalog count must match this isolated branch');
assert.equal(evidence.validation.expectedScenarios,32);
console.log('M661 audit OK: '+catalog.cards.length+' catalog entries; 965 behavior-certified baseline recorded separately; 2 candidates remain unadmitted and uncertified.');
