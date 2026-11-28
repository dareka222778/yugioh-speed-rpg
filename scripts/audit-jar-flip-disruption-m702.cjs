'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {getPlayableCard,engineCatalog}=require('../dist/effectRegistry.js');
const {MORPHING_JAR_ID,CYBER_JAR_ID,defaultJarFlipEffect}=require('../dist/jarFlipDisruptionTagAdapter.js');
const certificationSource=fs.readFileSync(path.join(__dirname,'../src/cardCertifications.ts'),'utf8');
const ids=[MORPHING_JAR_ID,CYBER_JAR_ID];
const keys=new Set([...certificationSource.matchAll(/^\s*"(\d{8})"\s*:/gm)].map(match=>match[1]));
for(const id of ids){
  assert.equal(getPlayableCard(id),undefined,'candidate must not become playable without central integration: '+id);
  assert.equal(engineCatalog.some(card=>card.id===id),false,'candidate must remain outside metadata: '+id);
  assert.equal(keys.has(id),false,'candidate must not be certified by import or adapter presence: '+id);
  assert.ok(defaultJarFlipEffect(id),'adapter lookup must be explicit: '+id);
}
const summary={mission:'M702',candidateCards:ids.length,playableCandidates:0,newCertifications:0,explicitCertificationKeys:keys.size,inventoryGranted:0};
process.stdout.write(JSON.stringify(summary,null,2)+'\n');
