const {test}=require('node:test'),assert=require('node:assert/strict');
const e=require('../dist/duelEngine'),r=require('../dist/effectRegistry'),archive=require('../dist/resolverArchive'),tag=require('../dist/tagDuel');
const {historicalNormalBatch:batch}=require('../dist/historicalNormalBatch'),review=require('../docs/evidence/mission3-card-review.json'),{cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const {assertDuelState,duelCards}=require('../dist/duelIntegrity'),{starterContents}=require('../dist/cardCatalog');
const base=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id)),clone=s=>JSON.parse(JSON.stringify(s));
function game(){return e.createDuel([{id:'a',name:'Yugi (adapted test deck)',cards:base},{id:'b',name:'Kaiba (adapted test deck)',cards:base}],undefined,0,{randomSeed:'cd'.repeat(32)});}
function act(s,actor,kind,predicate=()=>true){const a=e.legalActions(s,actor).find(a=>a.kind===kind&&predicate(a));assert.ok(a,kind);return e.step(s,actor,a);}
for(const card of batch)test(`individual normal certification ${card.id}: ${card.englishName}`,()=>{
 const evidence=review.cards.find(c=>c.id===card.id);assert.equal(evidence.primary.cid,card.konamiId);assert.equal(evidence.primary.atk,card.atk);assert.equal(evidence.primary.def,card.defense);assert.equal(evidence.primary.level,card.level);assert.equal(evidence.primary.ocgDate,'1999-02-04');assert.equal(card.monsterType,'normal');assert.equal(r.getEffect(card.id).kind,'normal');assert.equal(r.getCardStatus(card.id).stage,'certified');assert.equal(cardDistributionAllowed(card.id),false);
 assert.equal(card.race,{'水族':'Aqua','恐竜族':'Dinosaur','魔法使い族':'Spellcaster','戦士族':'Warrior','岩石族':'Rock','天使族':'Fairy','アンデット族':'Zombie','獣族':'Beast','悪魔族':'Fiend','雷族':'Thunder','昆虫族':'Insect'}[evidence.primary.raceJA]);assert.equal(card.attribute,{'水':'WATER','地':'EARTH','闇':'DARK','光':'LIGHT','風':'WIND'}[evidence.primary.attributeJA]);assert.equal(card.englishName,evidence.name);assert.match(card.id,/^\d{8}$/);
 for(const version of ['engine-v1','engine-v2'])assert.equal(archive.getArchivedDefinitionResolver(version).getPlayableCard(card.id),undefined);
 for(const position of ['atk','set']){
  let s=game();s.turn=3;s.players[0].hand[0].id=card.id;const uid=s.players[0].hand[0].uid,initial=duelCards(s).map(c=>c.uid).sort();assertDuelState(s);
  const action=e.legalActions(s,'a').find(a=>a.kind==='summon'&&a.card===uid&&a.position===position);assert.ok(action);
  const next=e.step(s,'a',action);assert.deepEqual(clone(e.step(clone(s),'a',action)),clone(next));s=clone(next);assertDuelState(s);const monster=s.players[0].monsters.find(m=>m.uid===uid);assert.equal(monster.id,card.id);assert.equal(monster.faceUp,position==='atk');assert.equal(e.atk(monster,s),card.atk);assert.deepEqual(duelCards(s).map(c=>c.uid).sort(),initial);assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='summon'));
  if(position==='set')continue;
  // A real spell destroys the newly summoned physical card; no fabricated grave entry.
  s.players[1].hand[0].id='66788016';s=act(s,'a','end');s=act(s,'b','spell',a=>a.card===s.players[1].hand.find(c=>c.id==='66788016').uid);
  for(let n=0;s.phase==='response';n++){assert.ok(n<12);s=act(s,s.players[e.decisionPlayer(s)].id,'pass');}
  assert.ok(s.players[0].grave.some(c=>c.uid===uid&&c.id===card.id));assertDuelState(s);assert.deepEqual(duelCards(s).map(c=>c.uid).sort(),initial);
 }
});
test('v3 is additive; v1/v2 retain exactly 130 certified cards and preserved pending rules',()=>{
 assert.equal(r.enabledCardIds.length,692);assert.equal(new Set(batch.map(c=>c.id)).size,20);
 for(const version of ['engine-v1','engine-v2']){const pinned=archive.getArchivedDefinitionResolver(version),s=pinned.createDuel([{id:'a',name:'A',cards:base},{id:'b',name:'B',cards:base}],()=>.5);assert.equal(pinned.IMPLEMENTED_DUEL_CARDS.length,130);assertDuelState(clone(s));const a=e.legalActions(s,'a')[0];assert.deepEqual(clone(e.step(clone(s),'a',a)),clone(pinned.step(clone(s),'a',a)));}
 assert.equal(game().resolverVersion,'engine-v7');
});
for(const card of batch)test(`ownership and tribute recovery ${card.id}: ${card.englishName}`,()=>{
 function controlled(){let s=game();s.turn=3;const target=s.players[1].hand.shift();target.id=card.id;s.players[1].monsters=[{...target,owner:1,faceUp:true,position:'atk',entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0}];s.players[0].hand[0].id='04031928';s=act(s,'a','spell',a=>a.target===target.uid);assert.equal(s.players[0].monsters.find(m=>m.uid===target.uid).owner,1);return {s:clone(s),uid:target.uid};}
 let {s,uid}=controlled();const inventory=duelCards(s).map(c=>c.uid).sort();s=act(s,'a','end');assert.ok(s.players[1].monsters.some(m=>m.uid===uid));assert.ok(!s.players[0].monsters.some(m=>m.uid===uid));assert.deepEqual(duelCards(s).map(c=>c.uid).sort(),inventory);assertDuelState(clone(s));
 ({s,uid}=controlled());s.players[0].hand[0].id='28279543';s=act(s,'a','summon',a=>a.position==='atk'&&a.tributes.includes(uid));assert.ok(s.players[1].grave.some(c=>c.uid===uid&&c.id===card.id));assert.ok(!s.players[0].grave.some(c=>c.uid===uid));s=act(clone(s),'a','end');assert.ok(!s.players.flatMap(p=>p.monsters).some(m=>m.uid===uid));assertDuelState(clone(s));
});
test('all 20 normals survive complete four-seat rotation and JSON restoration without grants',()=>{
 const decks=batch.map(c=>c.id);let s=tag.createTagDuel([0,1,2,3].map(i=>({id:'m'+i,name:'Adapted classical '+i,cards:decks})),{seed:'reviewed-normals',classic:true});const initial=tag.tagInventory(s).map(c=>c.uid).sort();
 for(let n=0;n<40&&s.core.phase!=='finished';n++){s=clone(s);tag.assertTagDuel(s);const actor=tag.tagDecisionMember(s).id,actions=tag.tagActions(s,actor),a=actions.find(a=>a.kind==='summon'&&a.position==='atk')??actions.find(a=>a.kind==='end')??actions[0];s=tag.stepTagDuel(s,actor,a);assert.deepEqual(tag.tagInventory(s).map(c=>c.uid).sort(),initial);}
 tag.assertTagDuel(clone(s));assert.ok(s.core.turn>=8);
});
