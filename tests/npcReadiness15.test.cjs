const {test}=require('node:test'),assert=require('node:assert/strict');
const {auditNPC}=require('../scripts/duel-readiness.cjs'),{npcs}=require('../dist/npcContent');
const registry=require('../dist/effectRegistry'),{RULES_PROFILE}=require('../dist/rulesProfile');
const fusions=registry.engineCatalog.filter(c=>registry.getPlayableCard(c.id)?.fusion).map(c=>c.id);
test('beta readiness: every shipped NPC deck satisfies the approved classic rules',()=>{
 for(const npc of npcs)assert.equal(auditNPC(npc).ready,true,npc.id);
 assert.equal(RULES_PROFILE.extraDeckMax,5);
});
test('beta readiness: six distinct Extra Deck cards are rejected instead of using a legacy six-card limit',()=>{
 assert.ok(fusions.length>=6);const row=auditNPC({...npcs[0],extra:fusions.slice(0,6)});assert.equal(row.ready,false);assert.ok(row.invalid.some(x=>x.includes('exceeds 5')));
 assert.equal(auditNPC({...npcs[0],extra:fusions.slice(0,5)}).ready,true);
});
test('beta readiness: Extra Deck copy limit is enforced independently of total deck size',()=>{
 const row=auditNPC({...npcs[0],extra:Array(4).fill(fusions[0])});assert.equal(row.ready,false);assert.ok(row.invalid.some(x=>x.includes('copy limit')));
});
test('beta readiness: a main-deck monster or unknown card cannot pass as a Fusion',()=>{
 for(const extra of [['91152256'],['00000000']])assert.equal(auditNPC({...npcs[0],extra}).ready,false);
});
