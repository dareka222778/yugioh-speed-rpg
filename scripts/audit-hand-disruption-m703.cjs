'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {getPlayableCard,engineCatalog}=require('../dist/effectRegistry.js');
const {defaultHandDisruptionEffect}=require('../dist/handDisruptionTagAdapter.js');
const source=fs.readFileSync(path.join(__dirname,'../src/cardCertifications.ts'),'utf8');
const keys=new Set([...source.matchAll(/^\s*"(\d{8})"\s*:/gm)].map(match=>match[1]));
const ids=['77561728','17375316','16435215','15800838'];
for(const id of ids){
 assert.equal(getPlayableCard(id),undefined,'candidate must not become playable without central integration: '+id);
 assert.equal(keys.has(id),false,'candidate must not be certified by import: '+id);
 assert.ok(defaultHandDisruptionEffect(id),'adapter lookup must be explicit: '+id);
}
process.stdout.write(JSON.stringify({mission:'M703',candidateCards:ids.length,playableCandidates:0,newCertifications:0,explicitCertificationKeys:keys.size,inventoryGranted:0},null,2)+'\n');
