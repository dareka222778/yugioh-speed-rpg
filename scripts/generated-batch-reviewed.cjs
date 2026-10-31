'use strict';
/** Replay only checksummed, bounded registration edits; never strip executable engines. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function strip(file,bytes){if(!['src/cardMetadata.ts','src/cardCertifications.ts','src/releasedCardIds.ts'].includes(file))return bytes;const manifest=JSON.parse(fs.readFileSync(path.join(root,'catalog/batches/admitted.json')));let text=bytes.toString('utf8'),changed=false;
 for(const batch of [...manifest.batches].reverse()){
  assert.match(batch.id,/^[a-z][a-z0-9-]{2,50}$/);const raw=fs.readFileSync(path.join(root,'docs/evidence/generated-'+batch.id+'.json'));assert.equal(hash(raw),batch.proofSHA256,'Generated admission proof changed');const proof=JSON.parse(raw);
  for(const h of [...proof.hooks].reverse().filter(h=>h.path===file)){if(!text.includes(h.to))continue;assert.equal(text.split(h.to).length,2,'Generated hook must occur exactly once');text=text.replace(h.to,h.from);changed=true;}
 }
 return changed?Buffer.from(text):bytes;
}
module.exports={strip};
