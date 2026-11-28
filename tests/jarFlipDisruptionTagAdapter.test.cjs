'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel.js');
const {getPlayableCard,engineCatalog,getEffect}=require('../dist/effectRegistry.js');
const {rulesFor}=require('../dist/rulesProfile.js');
const {
  MORPHING_JAR_ID,CYBER_JAR_ID,defaultJarFlipEffect,activateJarFlip,resolveJarFlip
}=require('../dist/jarFlipDisruptionTagAdapter.js');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=31,'fixtures need four physical 20-card decks');
const baseSet=new Set(NORMALS.slice(0,20));
const LOW_IDS=engineCatalog.filter(c=>c.kind==='monster'&&typeof c.level==='number'&&c.level<=4&&c.monsterType!=='ritual'&&!c.fusion&&getPlayableCard(c.id)&&!baseSet.has(c.id)).map(c=>c.id).slice(0,4);
const SPELL_IDS=engineCatalog.filter(c=>c.kind==='spell'&&getPlayableCard(c.id)&&!baseSet.has(c.id)).map(c=>c.id).slice(0,5);
const FIELD_ID=(engineCatalog.find(c=>c.kind==='spell'&&c.field===true&&getPlayableCard(c.id))||{}).id;
const EQUIP_ID=(engineCatalog.find(c=>getEffect(c.id)?.kind==='equip'&&getPlayableCard(c.id))||{}).id;
assert.ok(LOW_IDS.length>=4,'need four playable Level 4 or lower monsters outside the base fixture');
assert.ok(SPELL_IDS.length>=5,'need five playable Spells outside the base fixture');
assert.ok(FIELD_ID,'need a playable Field Spell fixture');
assert.ok(EQUIP_ID,'need a playable Equip Spell fixture');

let sequence=0;
function member(seat){return 'm702-seat-'+seat;}
function deckWith(ids){
  const selected=[...ids],rest=NORMALS.filter(id=>!selected.includes(id));
  const deck=[...selected,...rest.slice(0,20-selected.length)];
  assert.equal(deck.length,20);
  assert.equal(new Set(deck).size,20,'fixture decks must use unique card identities');
  return deck;
}
function create(first=0,decks=null,seed='default'){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M702 Seat '+seat,cards:decks?.[seat]??NORMALS.slice(0,20)
  })),{classic:true,first,seed:'m702-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function addMonster(state,team,ownerSeat){
  const physical=holder(state,ownerSeat),card=physical.deck.shift();
  assert.ok(card,'monster fixture must exist in the physical Deck');
  state.core.players[team].monsters.push({
    ...card,position:'atk',faceUp:true,entered:state.core.turn,changed:state.core.turn,
    attacked:0,atkBoost:0,defBoost:0,owner:team
  });
  return card;
}
function addSource(state,team,ownerSeat,effect){
  const card=addMonster(state,team,ownerSeat);
  return {uid:card.uid,id:card.id,ownerSeat,lookup:id=>id===card.id?effect:undefined};
}
function takeCard(state,seat,id){
  const physical=holder(state,seat);
  let index=physical.deck.findIndex(card=>card.id===id);
  if(index>=0)return physical.deck.splice(index,1)[0];
  index=physical.hand.findIndex(card=>card.id===id);
  if(index>=0)return physical.hand.splice(index,1)[0];
  throw new Error('fixture card not found: '+id);
}
function arrangeTop(state,seat,ids){
  const physical=holder(state,seat),cards=ids.map(id=>takeCard(state,seat,id));
  physical.deck.unshift(...cards);
}
function addField(state,team,ownerSeat,id=FIELD_ID){
  const card=takeCard(state,ownerSeat,id);
  state.core.players[team].field={...card,faceUp:true,setTurn:0};
  return card;
}
function addEquip(state,team,ownerSeat,targetUid){
  const card=takeCard(state,ownerSeat,EQUIP_ID);
  state.core.players[team].backrow.push({...card,faceUp:true,setTurn:0,equippedTo:targetUid});
  return card;
}
function moveHand(state,seat,count){
  const physical=holder(state,seat);
  while(physical.hand.length<count&&physical.deck.length)physical.hand.push(physical.deck.shift());
}
function inventory(state){
  const cards=tag.tagInventory(state).filter(card=>card.entityKind!=='token');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,cards.length,'physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const after=inventory(state);
  assert.equal(after.size,before.size);
  for(const [uid,id] of before)assert.equal(after.get(uid),id,'physical identity changed: '+uid);
}
function assertRules(state){
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);assert.equal(rules.handCheck,'end');
  assert.equal(rules.monsterZones,3);assert.equal(rules.spellTrapZones,3);
  assert.equal(rules.extraDeckMax,5);
  for(const player of state.core.players){
    assert.ok(player.monsters.length<=3);assert.ok(player.backrow.length<=3);
  }
}
function event(state,actorSeat,source,activationId){
  return {
    activationId:activationId||'m702:'+state.core.turn+':'+source.uid+':'+(++sequence),
    actorSeat,sourceUid:source.uid
  };
}
function activate(state,actorSeat,source,activationId){
  return activateJarFlip(state,event(state,actorSeat,source,activationId),source.lookup);
}
function resolve(activation,choices={},negated=false){
  return resolveJarFlip(activation.state,activation.plan,choices,negated);
}
function sourceInGrave(state,team,uid){
  return state.core.players[team].grave.some(card=>card.uid===uid);
}
function zones(state,seat){
  const physical=holder(state,seat);
  return {deck:physical.deck.length,hand:physical.hand.length};
}
function cyberDecks(){
  return [
    deckWith([...LOW_IDS,SPELL_IDS[0]]),
    deckWith([LOW_IDS[0],...SPELL_IDS.slice(1,5)]),
    NORMALS.slice(0,20),
    NORMALS.slice(0,20)
  ];
}
function prepareCyber(state){
  arrangeTop(state,0,[...LOW_IDS,SPELL_IDS[0]]);
  arrangeTop(state,1,[LOW_IDS[0],...SPELL_IDS.slice(1,5)]);
  const field=addField(state,0,2);
  const source=addSource(state,0,2,'cyber-jar');
  const opponent=addMonster(state,1,3);
  const equip=addEquip(state,1,3,opponent.uid);
  return {source,opponent,field,equip};
}

test('candidate IDs map explicitly but remain outside the playable catalogue and certification set',()=>{
  assert.equal(defaultJarFlipEffect(MORPHING_JAR_ID),'morphing-jar');
  assert.equal(defaultJarFlipEffect(CYBER_JAR_ID),'cyber-jar');
  for(const id of [MORPHING_JAR_ID,CYBER_JAR_ID]){
    assert.equal(getPlayableCard(id),undefined);
    assert.equal(engineCatalog.some(card=>card.id===id),false);
  }
});

test('activation records a face-up FLIP trigger without mutating the input',()=>{
  const state=create(0,null,'activation'),source=addSource(state,0,2,'morphing-jar');
  const original=JSON.stringify(state),before=inventory(state);
  const activation=activate(state,0,source);
  assert.equal(activation.status,'triggered');
  assert.equal(JSON.stringify(state),original);
  assert.ok(activation.state.jarFlipPending.some(item=>item.activationId===activation.plan.activationId));
  assertConserved(activation.state,before);assertRules(activation.state);
});

test('only the active physical member of the controlling team can register the trigger',()=>{
  const state=create(0,null,'inactive'),source=addSource(state,0,2,'morphing-jar');
  assert.throws(()=>activate(state,2,source),/participante ativo/);
});

test('face-down source and opposing source are rejected',()=>{
  const faceDown=create(0,null,'face-down'),source=addSource(faceDown,0,2,'morphing-jar');
  faceDown.core.players[0].monsters.find(card=>card.uid===source.uid).faceUp=false;
  assert.throws(()=>activate(faceDown,0,source),/face para cima/);
  const opposing=create(0,null,'opposing'),other=addSource(opposing,1,1,'cyber-jar');
  assert.throws(()=>activate(opposing,0,other),/não está no campo/);
});

test('invalid seat, empty ID and duplicate activation are rejected',()=>{
  const state=create(0,null,'invalid'),source=addSource(state,0,2,'morphing-jar');
  assert.throws(()=>activateJarFlip(state,{activationId:'bad',actorSeat:4,sourceUid:source.uid},source.lookup),/inválido/);
  assert.throws(()=>activateJarFlip(state,{activationId:' ',actorSeat:0,sourceUid:source.uid},source.lookup),/inválido/);
  const eventData=event(state,0,source,'m702-duplicate');
  activateJarFlip(state,eventData,source.lookup);
  const first=activateJarFlip(state,eventData,source.lookup);
  assert.equal(first.status,'triggered');
});

test('Morphing Jar discards and draws for the two active team representatives only',()=>{
  const state=create(0,null,'morphing-active-only'),source=addSource(state,0,2,'morphing-jar');
  moveHand(state,0,7);moveHand(state,1,6);moveHand(state,2,6);moveHand(state,3,6);
  const partnerHands=[holder(state,2).hand.map(card=>card.uid),holder(state,3).hand.map(card=>card.uid)];
  const before=inventory(state),activeDecks=[holder(state,0).deck.length,holder(state,1).deck.length];
  const activation=activate(state,0,source),result=resolve(activation);
  assert.equal(result.status,'resolved');
  assert.equal(holder(result.state,0).hand.length,5);
  assert.equal(holder(result.state,1).hand.length,5);
  assert.deepEqual(holder(result.state,2).hand.map(card=>card.uid),partnerHands[0]);
  assert.deepEqual(holder(result.state,3).hand.map(card=>card.uid),partnerHands[1]);
  assert.equal(holder(result.state,0).deck.length,activeDecks[0]-5);
  assert.equal(holder(result.state,1).deck.length,activeDecks[1]-5);
  assert.equal(result.receipt.discardedCounts[0],7);
  assert.equal(result.receipt.discardedCounts[1],6);
  assert.equal(result.receipt.drawnCounts[0],5);
  assert.equal(result.receipt.drawnCounts[1],5);
  assert.ok(result.receipt.visibility==='public');
  assertConserved(result.state,before);assertRules(result.state);
});

test('Morphing Jar sends discards to each physical owner team graveyard',()=>{
  const state=create(0,null,'morphing-graves'),source=addSource(state,0,2,'morphing-jar');
  moveHand(state,0,6);moveHand(state,1,6);
  const discarded0=holder(state,0).hand.map(card=>card.uid);
  const discarded1=holder(state,1).hand.map(card=>card.uid);
  const result=resolve(activate(state,0,source));
  for(const uid of discarded0)assert.ok(sourceInGrave(result.state,0,uid));
  for(const uid of discarded1)assert.ok(sourceInGrave(result.state,1,uid));
});

test('Morphing Jar does not perform the six-card hand check before End Phase',()=>{
  const state=create(0,null,'morphing-end-phase'),source=addSource(state,0,2,'morphing-jar');
  moveHand(state,0,7);moveHand(state,1,7);
  const result=resolve(activate(state,0,source));
  assert.equal(holder(result.state,0).hand.length,5);
  assert.equal(holder(result.state,1).hand.length,5);
  assert.equal(rulesFor(result.state.core).handCheck,'end');
  assert.equal(result.state.core.handFlow,undefined);
});

test('Morphing Jar draws as many as possible and reports deck-out for host adjudication',()=>{
  const state=create(0,null,'morphing-short-deck'),source=addSource(state,0,2,'morphing-jar');
  const physical=holder(state,0);
  physical.hand.push(...physical.deck.splice(3));
  const result=resolve(activate(state,0,source));
  assert.equal(result.status,'deckout-pending');
  assert.deepEqual(result.receipt.deckOutSeats,[0]);
  assert.equal(holder(result.state,0).hand.length,3);
  assert.equal(holder(result.state,0).deck.length,0);
  assert.equal(result.state.core.phase,'main');
  assert.equal(result.state.core.winner,null,'adapter does not invent team loss before host adjudication');
});

test('Morphing Jar negation preserves hands, Decks, graves, logs and RNG',()=>{
  const state=create(0,null,'morphing-negated'),source=addSource(state,0,2,'morphing-jar');
  moveHand(state,0,7);moveHand(state,1,7);
  const activation=activate(state,0,source),before=inventory(activation.state);
  const beforeZones=[0,1,2,3].map(seat=>zones(activation.state,seat));
  const beforeGraves=activation.state.core.players.map(player=>player.grave.map(card=>card.uid));
  const log=JSON.stringify(activation.state.core.log),random=activation.state.core.random.counter;
  const result=resolve(activation,{},true);
  assert.equal(result.status,'negated');
  assert.deepEqual([0,1,2,3].map(seat=>zones(result.state,seat)),beforeZones);
  assert.deepEqual(result.state.core.players.map(player=>player.grave.map(card=>card.uid)),beforeGraves);
  assert.equal(JSON.stringify(result.state.core.log),log);
  assert.equal(result.state.core.random.counter,random);
  assertConserved(result.state,before);
});

test('Cyber Jar destroys both shared fields and routes monsters by physical owner',()=>{
  const state=create(0,cyberDecks(),'cyber-owner-routing'),prepared=prepareCyber(state);
  const before=inventory(state),activation=activate(state,0,prepared.source);
  const choices={};
  for(const uid of holder(activation.state,0).deck.slice(0,4).map(card=>card.uid))choices[uid]='attack';
  for(const uid of holder(activation.state,1).deck.slice(0,1).map(card=>card.uid))choices[uid]='attack';
  const result=resolve(activation,choices);
  assert.equal(result.status,'resolved');
  assert.ok(sourceInGrave(result.state,0,prepared.source.uid));
  assert.ok(sourceInGrave(result.state,1,prepared.opponent.uid));
  assert.ok(sourceInGrave(result.state,1,prepared.equip.uid));
  assert.equal(result.receipt.destroyedMonsterCount,2);
  assert.equal(result.state.core.players[0].monsters.length,3);
  assert.equal(result.state.core.players[1].monsters.length,1);
  assert.equal(result.state.core.players[0].field.uid,prepared.field.uid,'Field Zone must not be destroyed');
  assert.equal(result.state.core.players[1].backrow.some(card=>card.uid===prepared.equip.uid),false);
  assertConserved(result.state,before);assertRules(result.state);
});

test('Cyber Jar special summons low-level monsters and adds all remaining revealed cards to private hands',()=>{
  const state=create(0,cyberDecks(),'cyber-resolution'),prepared=prepareCyber(state);
  const activation=activate(state,0,prepared.source),choices={};
  const top0=holder(activation.state,0).deck.slice(0,4);
  const top1=holder(activation.state,1).deck.slice(0,1);
  choices[top0[0].uid]='attack';choices[top0[1].uid]='set';choices[top0[2].uid]='attack';
  choices[top1[0].uid]='attack';
  const beforeHands=[holder(activation.state,0).hand.length,holder(activation.state,1).hand.length];
  const before=inventory(activation.state),result=resolve(activation,choices);
  assert.equal(result.receipt.revealed.length,2);
  assert.equal(result.receipt.revealed[0].cardIds.length,5);
  assert.equal(result.receipt.revealed[1].cardIds.length,5);
  assert.equal(result.receipt.summonedFaceUpCounts[0],2);
  assert.equal(result.receipt.summonedFaceDownCounts[0],1);
  assert.equal(result.receipt.summonedFaceUpCounts[1],1);
  assert.equal(result.receipt.addedToHandCounts[0],2);
  assert.equal(result.receipt.addedToHandCounts[1],4);
  assert.equal(holder(result.state,0).hand.length,beforeHands[0]+2);
  assert.equal(holder(result.state,1).hand.length,beforeHands[1]+4);
  assert.equal(result.state.core.players[0].monsters.filter(card=>card.faceUp===false&&card.position==='def').length,1);
  assert.equal(result.state.core.players[0].monsters.length,3,'third Monster Zone is respected');
  assertConserved(result.state,before);assertRules(result.state);
});

test('Cyber Jar does not expose cards drawn into hands in the receipt beyond their public reveal',()=>{
  const state=create(0,cyberDecks(),'cyber-public-reveal'),prepared=prepareCyber(state);
  const activation=activate(state,0,prepared.source),choices={};
  for(const card of holder(activation.state,0).deck.slice(0,3))choices[card.uid]='attack';
  for(const card of holder(activation.state,1).deck.slice(0,1))choices[card.uid]='attack';
  const result=resolve(activation,choices);
  assert.ok(result.receipt.revealed.every(entry=>entry.cardIds.length===5));
  assert.equal(Object.prototype.hasOwnProperty.call(result.receipt,'handUids'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.receipt,'drawnUids'),false);
});

test('Cyber Jar requires a position choice for every summonable monster with an available zone',()=>{
  const state=create(0,cyberDecks(),'cyber-choice-required'),prepared=prepareCyber(state);
  const activation=activate(state,0,prepared.source);
  assert.throws(()=>resolve(activation,{}),/Escolha Ataque/);
  assert.equal(activation.state.core.players[0].monsters.length,1,'failed resolution must not mutate its input');
});

test('Cyber Jar rejects choices for non-monsters or monsters beyond available zones',()=>{
  const state=create(0,cyberDecks(),'cyber-extra-choice'),prepared=prepareCyber(state);
  const activation=activate(state,0,prepared.source),choices={};
  for(const card of holder(activation.state,0).deck.slice(0,4))choices[card.uid]='attack';
  for(const card of holder(activation.state,1).deck.slice(0,1))choices[card.uid]='attack';
  const first=holder(activation.state,0).deck[4];
  choices[first.uid]='set';
  assert.throws(()=>resolve(activation,choices),/não pode ser Invocado/);
});

test('Cyber Jar reveals only the available cards when a Deck has fewer than five',()=>{
  const state=create(0,cyberDecks(),'cyber-short-deck'),prepared=prepareCyber(state);
  const physical=holder(state,0),keep=physical.deck.splice(0,2);
  physical.hand.push(...physical.deck.splice(0));
  physical.deck.push(...keep);
  const activation=activate(state,0,prepared.source),choices={};
  for(const card of holder(activation.state,0).deck.slice(0,2))if(LOW_IDS.includes(card.id))choices[card.uid]='attack';
  for(const card of holder(activation.state,1).deck.slice(0,1))if(LOW_IDS.includes(card.id))choices[card.uid]='attack';
  const result=resolve(activation,choices);
  assert.equal(result.receipt.revealed.find(item=>item.seat===0).cardIds.length,2);
  assert.deepEqual(result.receipt.deckShortSeats,[0]);
  assert.equal(result.status,'resolved','Cyber Jar explicitly reveals as many as possible; it does not cause deck-out');
  assert.equal(result.receipt.deckOutSeats.length,0);
});

test('Cyber Jar keeps inactive partner hands and Decks private and unchanged',()=>{
  const state=create(0,cyberDecks(),'cyber-partners'),prepared=prepareCyber(state);
  const partnerZones=[zones(state,2),zones(state,3)];
  const partnerHands=[holder(state,2).hand.map(card=>card.uid),holder(state,3).hand.map(card=>card.uid)];
  const activation=activate(state,0,prepared.source),choices={};
  for(const card of holder(activation.state,0).deck.slice(0,4))choices[card.uid]='attack';
  for(const card of holder(activation.state,1).deck.slice(0,1))choices[card.uid]='attack';
  const result=resolve(activation,choices);
  assert.deepEqual([zones(result.state,2),zones(result.state,3)],partnerZones);
  assert.deepEqual(holder(result.state,2).hand.map(card=>card.uid),partnerHands[0]);
  assert.deepEqual(holder(result.state,3).hand.map(card=>card.uid),partnerHands[1]);
});

test('Cyber Jar supports the active pair after a different tag rotation',()=>{
  const state=create(2,null,'cyber-rotated'),source=addSource(state,0,2,'cyber-jar');
  const before=inventory(state),activation=activate(state,2,source);
  const result=resolve(activation,{});
  assert.equal(result.status,'resolved');
  assert.equal(result.receipt.affectedSeats[0],2);
  assert.equal(result.receipt.affectedSeats[1],3);
  assertConserved(result.state,before);assertRules(result.state);
});

test('a plan cannot be tampered with or resolved after the active pair rotates',()=>{
  const state=create(0,null,'tamper'),source=addSource(state,0,2,'morphing-jar');
  const activation=activate(state,0,source);
  const tampered={...activation.plan,affectedSeats:[2,3]};
  assert.throws(()=>resolveJarFlip(activation.state,tampered,{},false),/registro imutável/);
  const rotated=structuredClone(activation.state);
  rotated.active=[2,3];
  rotated.core.teamRotation.active=[2,3];
  rotated.core.teamRotation.cursor=2;
  rotated.cursor=2;
  assert.throws(()=>resolveJarFlip(rotated,activation.plan,{},false),/Rotação 2v2 mudou/);
});

test('resolved activation IDs are idempotent',()=>{
  const state=create(0,null,'idempotent'),source=addSource(state,0,2,'morphing-jar');
  const result=resolve(activate(state,0,source));
  const duplicate=resolveJarFlip(result.state,result.state.jarFlipResolvedIds?.length?{
    ...result.state.jarFlipPending?.[0],...result.state.jarFlipResolvedIds?.[0]
  }:null);
  assert.equal(duplicate.status,'duplicate');
});

test('Morphing Jar rejects position choices and negated effects reject choices',()=>{
  const state=create(0,null,'invalid-choices'),source=addSource(state,0,2,'morphing-jar');
  const activation=activate(state,0,source);
  assert.throws(()=>resolve(activation,{fake:'attack'}),/não recebe escolhas/);
  assert.throws(()=>resolve(activation,{fake:'attack'},true),/Efeito negado/);
});

test('Field Zone remains separate from three backrow slots during Cyber Jar',()=>{
  const state=create(0,cyberDecks(),'cyber-zones'),prepared=prepareCyber(state);
  assert.equal(state.core.players[0].backrow.length,0);
  assert.ok(state.core.players[0].field);
  const activation=activate(state,0,prepared.source),choices={};
  for(const card of holder(activation.state,0).deck.slice(0,4))choices[card.uid]='attack';
  for(const card of holder(activation.state,1).deck.slice(0,1))choices[card.uid]='attack';
  const result=resolve(activation,choices);
  assert.ok(result.state.core.players[0].field);
  assert.ok(result.state.core.players.every(player=>player.backrow.length<=3));
});

test('no FLIP resolution mutates the input or consumes random state',()=>{
  const state=create(0,cyberDecks(),'immutable'),prepared=prepareCyber(state);
  const original=JSON.stringify(state),activation=activate(state,0,prepared.source);
  const activationState=JSON.stringify(activation.state),random=activation.state.core.random.counter;
  const choices={};
  for(const card of holder(activation.state,0).deck.slice(0,4))choices[card.uid]='attack';
  for(const card of holder(activation.state,1).deck.slice(0,1))choices[card.uid]='attack';
  const result=resolve(activation,choices);
  assert.equal(JSON.stringify(state),original);
  assert.equal(activation.state.core.random.counter,random);
  assert.notEqual(JSON.stringify(result.state),activationState);
});

test('physical identities remain unchanged through both effects',()=>{
  const morph=create(0,null,'conserve-morph'),morphSource=addSource(morph,0,2,'morphing-jar');
  const morphBefore=inventory(morph),morphResult=resolve(activate(morph,0,morphSource));
  assertConserved(morphResult.state,morphBefore);
  const cyber=create(0,cyberDecks(),'conserve-cyber'),prepared=prepareCyber(cyber);
  const cyberBefore=inventory(cyber),activation=activate(cyber,0,prepared.source),choices={};
  for(const card of holder(activation.state,0).deck.slice(0,4))choices[card.uid]='attack';
  for(const card of holder(activation.state,1).deck.slice(0,1))choices[card.uid]='attack';
  const cyberResult=resolve(activation,choices);
  assertConserved(cyberResult.state,cyberBefore);
});
