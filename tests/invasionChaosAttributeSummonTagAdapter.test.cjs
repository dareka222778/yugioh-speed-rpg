'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createTagDuel,tagInventory}=require('../dist/tagDuel');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');
const {bindTarget,synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
 GIGANTES_ID,GIGANTES_KONAMI_CID,FENRIR_ID,FENRIR_KONAMI_CID,
 INFERNO_ID,INFERNO_KONAMI_CID,SILPHEED_ID,SILPHEED_KONAMI_CID,
 createExactInvasionChaosLookups,assertInvasionChaosRules,
 specialSummonInvasionChaosFromHand,isInvasionChaosSpecialSummonOnly,assertInvasionChaosNormalSummonForbidden,createInvasionChaosLedger,
 recordInvasionChaosBattleEvent,resolveInvasionChaosBattleTrigger,
 consumeInvasionChaosDrawSkip
}=require('../dist/invasionChaosAttributeSummonTagAdapter');

const enabled=getEnabledCardIds();
const monsters=enabled.filter(id=>getDuelCard(id)?.kind==='monster'&&!getDuelCard(id)?.fusion);
const byAttribute=attribute=>monsters.filter(id=>getDuelCard(id)?.attribute===attribute);
const attributes=['EARTH','WATER','FIRE','WIND'];
for(const attribute of attributes)assert.ok(byAttribute(attribute).length>=3,'Fixture precisa de três monstros '+attribute);
const placeholders={
 gigantes:byAttribute('EARTH')[0],
 fenrir:byAttribute('WATER')[0],
 inferno:byAttribute('FIRE')[0],
 silpheed:byAttribute('WIND')[0]
};
const costs={
 earth:byAttribute('EARTH')[1],
 water1:byAttribute('WATER')[1],
 water2:byAttribute('WATER')[2],
 fire:byAttribute('FIRE')[1],
 wind:byAttribute('WIND')[1]
};
const excluded=new Set([...Object.values(placeholders),...Object.values(costs)]);
const filler=monsters.filter(id=>!excluded.has(id)).slice(0,6);
assert.equal(filler.length,6,'Fixture precisa de seis monstros adicionais.');
const spells=enabled.filter(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field);
const traps=enabled.filter(id=>getDuelCard(id)?.kind==='trap');
const fields=enabled.filter(id=>getDuelCard(id)?.kind==='spell'&&getDuelCard(id)?.field);
assert.ok(spells.length>=2&&traps.length>=2&&fields.length>=1,'Fixture precisa de Magias, Armadilhas e Magia de Campo.');
const deck=[...Object.values(placeholders),...Object.values(costs),...filler,spells[0],spells[1],traps[0],traps[1],fields[0]];
assert.equal(deck.length,20);
assert.equal(new Set(deck).size,20);
for(const id of deck)assert.ok(enabled.includes(id));
const lookups={
 gigantes:id=>id===placeholders.gigantes,
 fenrir:id=>id===placeholders.fenrir,
 inferno:id=>id===placeholders.inferno,
 silpheed:id=>id===placeholders.silpheed
};
const exact=createExactInvasionChaosLookups();

function base(seed='m699-ioc-attribute-summons',first=0){
 const players=[
  {id:'p0',name:'Azul A',cards:[...deck],extra:[]},
  {id:'p1',name:'Vermelho A',cards:[...deck],extra:[]},
  {id:'p2',name:'Azul B',cards:[...deck],extra:[]},
  {id:'p3',name:'Vermelho B',cards:[...deck],extra:[]}
 ];
 return createTagDuel(players,{seed,first,classic:true});
}
function holder(duel,seat){
 const team=seat%2,active=duel.active[team]===seat?duel.core.players[team]:duel.reserves[seat];
 if(!active)throw new Error('Assento físico indisponível: '+seat);
 return active;
}
function take(duel,seat,id){
 const held=holder(duel,seat);
 for(const pool of [held.hand,held.deck,held.extra??[]]){
  const index=pool.findIndex(card=>card.id===id);
  if(index>=0)return pool.splice(index,1)[0];
 }
 throw new Error('Carta física indisponível: '+seat+'/'+id);
}
function moveToHand(duel,seat,id){
 const held=holder(duel,seat);
 if(held.hand.some(card=>card.id===id))return held.hand.find(card=>card.id===id);
 const index=held.deck.findIndex(card=>card.id===id);
 assert.ok(index>=0,'Carta deve estar no Deck do assento físico.');
 const [card]=held.deck.splice(index,1);held.hand.push(card);return card;
}
function addMonster(duel,seat,controllerTeam,id){
 const card=take(duel,seat,id);
 const monster={...card,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,
  attacked:0,atkBoost:0,defBoost:0,owner:seat%2};
 duel.core.players[controllerTeam].monsters.push(monster);
 synchronizeCardLifetimes(duel.core);
 return monster;
}
function putCostInGrave(duel,seat,id){
 const card=take(duel,seat,id);duel.core.players[seat%2].grave.push(card);synchronizeCardLifetimes(duel.core);return card;
}
function inventory(duel){
 return tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]).sort((a,b)=>a[0].localeCompare(b[0]));
}
function destroySource(duel,monster,{eventId='source-destroyed',sequence=1,destruction='battle',destination='grave'}={}){
 const controllerTeam=duel.core.players.findIndex(player=>player.monsters.some(card=>card.uid===monster.uid));
 assert.ok(controllerTeam>=0);
 const sourceBinding=bindTarget(duel.core,monster.uid);
 const source=duel.core.players[controllerTeam].monsters.find(card=>card.uid===monster.uid);
 duel.core.players[controllerTeam].monsters=duel.core.players[controllerTeam].monsters.filter(card=>card.uid!==monster.uid);
 const ownerTeam=Number(/^m([0-3]):/.exec(monster.uid)[1])%2;
 if(destination==='grave')duel.core.players[ownerTeam].grave.push({uid:source.uid,id:source.id});
 else duel.core.players[ownerTeam].banished.push({uid:source.uid,id:source.id});
 synchronizeCardLifetimes(duel.core);
 return {state:duel,event:{kind:'ioc-attribute-source-destroyed',eventId,sequence,turn:duel.core.turn,
  sourceUid:monster.uid,controllerTeam,destruction,destination,sourceBinding}};
}
function destroyTarget(duel,source,target,{eventId='target-destroyed',sequence=1,destination='grave'}={}){
 const sourceControllerTeam=duel.core.players.findIndex(player=>player.monsters.some(card=>card.uid===source.uid));
 const targetControllerTeam=duel.core.players.findIndex(player=>player.monsters.some(card=>card.uid===target.uid));
 assert.ok(sourceControllerTeam>=0&&targetControllerTeam>=0);
 const sourceBinding=bindTarget(duel.core,source.uid),targetBinding=bindTarget(duel.core,target.uid);
 const targetCard=duel.core.players[targetControllerTeam].monsters.find(card=>card.uid===target.uid);
 duel.core.players[targetControllerTeam].monsters=duel.core.players[targetControllerTeam].monsters.filter(card=>card.uid!==target.uid);
 const ownerTeam=Number(/^m([0-3]):/.exec(target.uid)[1])%2;
 if(destination==='grave')duel.core.players[ownerTeam].grave.push({uid:targetCard.uid,id:targetCard.id});
 else duel.core.players[ownerTeam].banished.push({uid:targetCard.uid,id:targetCard.id});
 synchronizeCardLifetimes(duel.core);
 return {state:duel,event:{kind:'ioc-attribute-target-destroyed',eventId,sequence,turn:duel.core.turn,
  sourceUid:source.uid,sourceControllerTeam,sourceBinding,targetUid:target.uid,targetControllerTeam,
  targetDestination:destination,targetBinding,destruction:'battle'}};
}
function addBackrow(duel,seat,team,id){
 const card=take(duel,seat,id);duel.core.players[team].backrow.push({...card,setTurn:duel.core.turn,faceUp:true});
 synchronizeCardLifetimes(duel.core);return card;
}
function addField(duel,seat,team,id){
 const card=take(duel,seat,id);duel.core.players[team].field={...card,setTurn:duel.core.turn,faceUp:true};
 synchronizeCardLifetimes(duel.core);return card;
}
function activateSeat(duel,seat,turn){
 const team=seat%2,oldSeat=duel.active[team];
 if(oldSeat!==seat){
  const player=duel.core.players[team];
  duel.reserves[oldSeat]={deck:player.deck,hand:player.hand,extra:player.extra??[]};
  const incoming=duel.reserves[seat];
  player.deck=incoming.deck;player.hand=incoming.hand;player.extra=incoming.extra;
  delete duel.reserves[seat];duel.active[team]=seat;
 }
 duel.cursor=seat;duel.core.current=team;duel.core.priority=team;duel.core.turn=turn;
 duel.core.teamRotation.cursor=seat;duel.core.teamRotation.active=duel.active;duel.core.teamRotation.reserves=duel.reserves;
 return duel;
}
function windowFor(duel,eventId,flags={}){
 return {kind:'ioc-attribute-trigger-window',eventId,turn:duel.core.turn,
  activeTeam:duel.core.current,activeSeat:duel.cursor,...flags};
}
function summonCandidate(duel,key){
 const seat=duel.cursor,id=placeholders[key],candidate=moveToHand(duel,seat,id);
 const costIds=key==='gigantes'?[costs.earth]:key==='fenrir'?[costs.water1,costs.water2]:
  key==='inferno'?[costs.fire]:[costs.wind];
 const costCards=costIds.map(costId=>putCostInGrave(duel,seat,costId));
 return {candidate,costCards};
}

test('candidate identities, Konami IDs and exact lookups are fixed; none is admitted automatically',()=>{
 assert.equal(GIGANTES_ID,'47606319');assert.equal(GIGANTES_KONAMI_CID,5831);
 assert.equal(FENRIR_ID,'00218704');assert.equal(FENRIR_KONAMI_CID,5830);
 assert.equal(INFERNO_ID,'74823665');assert.equal(INFERNO_KONAMI_CID,5829);
 assert.equal(SILPHEED_ID,'73001017');assert.equal(SILPHEED_KONAMI_CID,5832);
 for(const id of [GIGANTES_ID,FENRIR_ID,INFERNO_ID,SILPHEED_ID]){
  assert.equal(getDuelCard(id),undefined);assert.equal(enabled.includes(id),false);
 }
 assert.equal(exact.gigantes(GIGANTES_ID),true);assert.equal(exact.fenrir(FENRIR_ID),true);
 assert.equal(exact.inferno(INFERNO_ID),true);assert.equal(exact.silpheed(SILPHEED_ID),true);
});


test('all four IOC monsters are explicitly blocked from Normal Summon and Set',()=>{
 for(const key of ['gigantes','fenrir','inferno','silpheed']){
  assert.equal(isInvasionChaosSpecialSummonOnly(placeholders[key],lookups),true);
  assert.throws(()=>assertInvasionChaosNormalSummonForbidden(placeholders[key],lookups),/não pode ser Invocado/i);
 }
 assert.equal(isInvasionChaosSpecialSummonOnly(filler[0],lookups),false);
 assert.equal(assertInvasionChaosNormalSummonForbidden(filler[0],lookups),undefined);
});

test('owner rules remain Deck 20–30, hand 6 only at End Phase, zones 3+3 and Extra 5',()=>{
 const duel=base();assert.equal(assertInvasionChaosRules(duel),undefined);
 for(let i=0;i<7;i++)duel.core.players[0].hand.push(duel.core.players[0].deck.pop());
 assert.equal(duel.core.players[0].hand.length,11);
 assert.equal(assertInvasionChaosRules(duel),undefined);
});

for(const key of ['gigantes','fenrir','inferno','silpheed']){
 test(key+' uses its exact attribute and banishes the correct number of team-GY monsters',()=>{
  const duel=base(),{candidate,costCards}=summonCandidate(duel,key),before=inventory(duel);
  const result=specialSummonInvasionChaosFromHand(duel,duel.cursor,candidate.uid,costCards.map(card=>card.uid),lookups);
  assert.equal(result.status,'summoned');assert.equal(result.summonedUid,candidate.uid);
  assert.equal(result.banishedCostUids.length,key==='fenrir'?2:1);
  assert.ok(result.state.core.players[0].monsters.some(card=>card.uid===candidate.uid));
  assert.ok(result.banishedCostUids.every(uid=>result.state.core.players[0].banished.some(card=>card.uid===uid)));
  assert.deepEqual(inventory(result.state),before);
  assert.equal(result.state.core.players[0].summoned,duel.core.players[0].summoned,'Special Summon does not consume the Normal Summon.');
 });
}

test('Fenrir requires two distinct WATER monsters and rejects one or three costs',()=>{
 const duel=base(),candidate=moveToHand(duel,0,placeholders.fenrir);
 const one=putCostInGrave(duel,0,costs.water1);
 assert.throws(()=>specialSummonInvasionChaosFromHand(duel,0,candidate.uid,[one.uid],lookups),/quantidade/i);
 const two=putCostInGrave(duel,0,costs.water2);
 assert.throws(()=>specialSummonInvasionChaosFromHand(duel,0,candidate.uid,[one.uid,two.uid,one.uid],lookups),/quantidade|identidade/i);
});

test('an incorrect attribute cannot be paid as a summon cost',()=>{
 const duel=base(),candidate=moveToHand(duel,0,placeholders.gigantes),wrong=putCostInGrave(duel,0,costs.water1);
 assert.throws(()=>specialSummonInvasionChaosFromHand(duel,0,candidate.uid,[wrong.uid],lookups),/atributo/i);
});

test('a cost in the opposing GY cannot pay for the active team procedure',()=>{
 const duel=base(),candidate=moveToHand(duel,0,placeholders.gigantes),wrong=putCostInGrave(duel,1,costs.earth);
 assert.throws(()=>specialSummonInvasionChaosFromHand(duel,0,candidate.uid,[wrong.uid],lookups),/Cemitério compartilhado/i);
});


test('a teammate GY cost is legal on the shared field and retains the partner physical UID',()=>{
 const duel=base(),candidate=moveToHand(duel,0,placeholders.gigantes),partnerCost=putCostInGrave(duel,2,costs.earth);
 assert.ok(partnerCost.uid.startsWith('m2:'));
 const result=specialSummonInvasionChaosFromHand(duel,0,candidate.uid,[partnerCost.uid],lookups);
 assert.equal(result.status,'summoned');
 assert.ok(result.state.core.players[0].banished.some(card=>card.uid===partnerCost.uid));
 assert.ok(result.state.core.players[0].monsters.some(card=>card.uid===candidate.uid));
});

test('the active seat cannot summon a candidate from its partner private hand',()=>{
 const duel=base(),candidate=moveToHand(duel,2,placeholders.gigantes),cost=putCostInGrave(duel,0,costs.earth);
 assert.throws(()=>specialSummonInvasionChaosFromHand(duel,0,candidate.uid,[cost.uid],lookups),/mão privada/i);
});

test('a partner may summon from their own hand on their physical turn without changing ownership',()=>{
 const duel=activateSeat(base(),2,2),candidate=moveToHand(duel,2,placeholders.gigantes),cost=putCostInGrave(duel,2,costs.earth);
 const result=specialSummonInvasionChaosFromHand(duel,2,candidate.uid,[cost.uid],lookups);
 assert.equal(result.status,'summoned');assert.ok(result.summonedUid.startsWith('m2:'));
 assert.equal(result.state.core.players[0].monsters.find(card=>card.uid===candidate.uid).owner,0);
 assert.ok(result.state.core.players[0].banished.some(card=>card.uid===cost.uid&&card.uid.startsWith('m2:')));
});

test('a full three-monster field returns no-space without paying costs or moving the hand card',()=>{
 const duel=base(),candidate=moveToHand(duel,0,placeholders.gigantes),cost=putCostInGrave(duel,0,costs.earth);
 for(let i=0;i<3;i++)duel.core.players[0].monsters.push({
  ...take(duel,0,filler[i]),position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,
  attacked:0,atkBoost:0,defBoost:0,owner:0
 });
 synchronizeCardLifetimes(duel.core);
 const before=inventory(duel),result=specialSummonInvasionChaosFromHand(duel,0,candidate.uid,[cost.uid],lookups);
 assert.equal(result.status,'no-space');assert.deepEqual(inventory(result.state),before);
 assert.ok(result.state.core.players[0].grave.some(card=>card.uid===cost.uid));
 assert.ok(result.state.core.players[0].hand.some(card=>card.uid===candidate.uid));
});

test('source destruction triggers only for battle destruction sent to the physical owner GY',()=>{
 for(const destruction of ['battle','effect']){
  const duel=base(),source=addMonster(duel,0,0,placeholders.gigantes);
  const moved=destroySource(duel,source,{destruction,destination:'grave'});
  const result=recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups);
  assert.equal(result.status,destruction==='battle'?'scheduled':'no-trigger');
 }
 const duel=base(),source=addMonster(duel,0,0,placeholders.silpheed);
 const moved=destroySource(duel,source,{destruction:'battle',destination:'banished'});
 assert.equal(recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups).status,'no-trigger');
});

test('Gigantes resolves its mandatory non-targeting sweep across both teams and the Field Zone',()=>{
 const duel=base(),source=addMonster(duel,0,0,placeholders.gigantes);
 const backA=addBackrow(duel,0,0,spells[0]),backB=addBackrow(duel,1,1,traps[0]);
 const partnerOwnedOnOpponentField=addBackrow(duel,0,1,spells[1]);
 const field=addField(duel,1,1,fields[0]),before=inventory(duel);
 const moved=destroySource(duel,source,{eventId:'gigantes-sweep',sequence:1});
 const recorded=recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups);
 assert.equal(recorded.status,'scheduled');
 const resolved=resolveInvasionChaosBattleTrigger(moved.state,recorded.ledger,windowFor(moved.state,'gigantes-sweep'));
 assert.equal(resolved.status,'resolved');
 assert.equal(resolved.state.core.players[0].backrow.length,0);
 assert.equal(resolved.state.core.players[1].backrow.length,0);
 assert.equal(resolved.state.core.players[1].field,null);
 assert.ok(resolved.state.core.players[0].grave.some(card=>card.uid===backA.uid));
 assert.ok(resolved.state.core.players[1].grave.some(card=>card.uid===backB.uid));
 assert.ok(resolved.state.core.players[1].grave.some(card=>card.uid===field.uid));
 assert.ok(resolved.state.core.players[0].grave.some(card=>card.uid===partnerOwnedOnOpponentField.uid));
 assert.deepEqual(inventory(resolved.state),before);
});

test('Gigantes effect negation leaves all Spell/Trap cards intact',()=>{
 const duel=base(),source=addMonster(duel,0,0,placeholders.gigantes),back=addBackrow(duel,0,0,spells[0]);
 const moved=destroySource(duel,source,{eventId:'gigantes-negated',sequence:1});
 const recorded=recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups);
 const resolved=resolveInvasionChaosBattleTrigger(moved.state,recorded.ledger,windowFor(moved.state,'gigantes-negated',{effectNegated:true}));
 assert.equal(resolved.status,'effect-negated');
 assert.ok(resolved.state.core.players[0].backrow.some(card=>card.uid===back.uid));
});

test('Silpheed uses the persisted HMAC stream to discard only from the active opponent private hand',()=>{
 const duel=base('m699-silpheed-random'),source=addMonster(duel,0,0,placeholders.silpheed);
 const reserveBefore=duel.reserves[3].hand.map(card=>card.uid).sort();
 const activeBefore=duel.core.players[1].hand.map(card=>card.uid).sort();
 const moved=destroySource(duel,source,{eventId:'silpheed-discard',sequence:1});
 const recorded=recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups);
 const resolved=resolveInvasionChaosBattleTrigger(moved.state,recorded.ledger,windowFor(moved.state,'silpheed-discard'));
 assert.equal(resolved.status,'resolved');assert.ok(resolved.discardedUid);
 assert.equal(resolved.state.core.players[1].hand.length,activeBefore.length-1);
 assert.deepEqual(resolved.state.reserves[3].hand.map(card=>card.uid).sort(),reserveBefore);
 assert.ok(resolved.state.core.players[1].grave.some(card=>card.uid===resolved.discardedUid));
 assert.deepEqual(inventory(resolved.state),inventory(duel));
});

test('Silpheed random discard is reproducible for the same private duel seed and action sequence',()=>{
 function run(){
  const duel=base('m699-silpheed-replay'),source=addMonster(duel,0,0,placeholders.silpheed);
  const moved=destroySource(duel,source,{eventId:'silpheed-replay',sequence:1});
  const recorded=recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups);
  return resolveInvasionChaosBattleTrigger(moved.state,recorded.ledger,windowFor(moved.state,'silpheed-replay')).discardedUid;
 }
 assert.equal(run(),run());
});

test('Silpheed does not invent a discard when the active opponent hand is empty',()=>{
 const duel=base(),source=addMonster(duel,0,0,placeholders.silpheed);
 duel.core.players[1].grave.push(...duel.core.players[1].hand.splice(0));synchronizeCardLifetimes(duel.core);
 const moved=destroySource(duel,source,{eventId:'silpheed-empty',sequence:1});
 const recorded=recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups);
 const resolved=resolveInvasionChaosBattleTrigger(moved.state,recorded.ledger,windowFor(moved.state,'silpheed-empty'));
 assert.equal(resolved.status,'no-target');assert.equal(resolved.discardedUid,null);
});

test('Silpheed effect negation preserves both opposing private hands',()=>{
 const duel=base(),source=addMonster(duel,0,0,placeholders.silpheed),before=inventory(duel);
 const moved=destroySource(duel,source,{eventId:'silpheed-negated',sequence:1});
 const recorded=recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups);
 const resolved=resolveInvasionChaosBattleTrigger(moved.state,recorded.ledger,windowFor(moved.state,'silpheed-negated',{effectNegated:true}));
 assert.equal(resolved.status,'effect-negated');assert.deepEqual(inventory(resolved.state),before);
});

test('Inferno burns 1500 shared LP only when its battle target is sent to the GY',()=>{
 const duel=base(),source=addMonster(duel,0,0,placeholders.inferno),target=addMonster(duel,1,1,filler[0]);
 const moved=destroyTarget(duel,source,target,{eventId:'inferno-burn',sequence:1});
 const recorded=recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups);
 assert.equal(recorded.status,'scheduled');
 const resolved=resolveInvasionChaosBattleTrigger(moved.state,recorded.ledger,windowFor(moved.state,'inferno-burn'));
 assert.equal(resolved.status,'resolved');assert.equal(resolved.damage,1500);
 assert.equal(resolved.state.core.players[1].lp,2500);
});

test('Inferno does not burn when the battle-destroyed target is banished instead of sent to GY',()=>{
 const duel=base(),source=addMonster(duel,0,0,placeholders.inferno),target=addMonster(duel,1,1,filler[0]);
 const moved=destroyTarget(duel,source,target,{eventId:'inferno-banished',sequence:1,destination:'banished'});
 const recorded=recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups);
 assert.equal(recorded.status,'no-trigger');
});

test('Inferno effect negation prevents the 1500 LP change',()=>{
 const duel=base(),source=addMonster(duel,0,0,placeholders.inferno),target=addMonster(duel,1,1,filler[0]);
 const moved=destroyTarget(duel,source,target,{eventId:'inferno-negated',sequence:1});
 const recorded=recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups);
 const resolved=resolveInvasionChaosBattleTrigger(moved.state,recorded.ledger,windowFor(moved.state,'inferno-negated',{effectNegated:true}));
 assert.equal(resolved.status,'effect-negated');assert.equal(resolved.state.core.players[1].lp,4000);
});

test('Fenrir schedules the opponent next Draw Phase when the target is destroyed by battle',()=>{
 const duel=base(),source=addMonster(duel,0,0,placeholders.fenrir),target=addMonster(duel,1,1,filler[0]);
 const moved=destroyTarget(duel,source,target,{eventId:'fenrir-skip',sequence:1,destination:'banished'});
 const recorded=recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups);
 assert.equal(recorded.status,'scheduled');
 const resolved=resolveInvasionChaosBattleTrigger(moved.state,recorded.ledger,windowFor(moved.state,'fenrir-skip'));
 assert.equal(resolved.status,'skip-scheduled');assert.equal(resolved.ledger.drawSkips[0].team,1);
 assert.equal(resolved.ledger.drawSkips[0].dueTurn,2);
 const consumed=consumeInvasionChaosDrawSkip(resolved.ledger,1,2);
 assert.equal(consumed.skip,true);assert.equal(consumed.sourceUid,source.uid);
 assert.equal(consumeInvasionChaosDrawSkip(consumed.ledger,1,2).skip,false);
});


test('Fenrir effect negation does not schedule a Draw Phase skip',()=>{
 const duel=base(),source=addMonster(duel,0,0,placeholders.fenrir),target=addMonster(duel,1,1,filler[0]);
 const moved=destroyTarget(duel,source,target,{eventId:'fenrir-negated',sequence:1});
 const recorded=recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups);
 const resolved=resolveInvasionChaosBattleTrigger(moved.state,recorded.ledger,windowFor(moved.state,'fenrir-negated',{effectNegated:true}));
 assert.equal(resolved.status,'effect-negated');assert.equal(resolved.ledger.drawSkips.length,0);
});

test('Fenrir triggered during the opponent turn schedules that opponent following turn, not the current one',()=>{
 const duel=activateSeat(base(),1,1),source=addMonster(duel,0,0,placeholders.fenrir),target=addMonster(duel,1,1,filler[0]);
 const moved=destroyTarget(duel,source,target,{eventId:'fenrir-opponent-turn',sequence:1});
 const recorded=recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups);
 const resolved=resolveInvasionChaosBattleTrigger(moved.state,recorded.ledger,windowFor(moved.state,'fenrir-opponent-turn'));
 assert.equal(resolved.ledger.drawSkips[0].dueTurn,3);
 assert.equal(consumeInvasionChaosDrawSkip(resolved.ledger,1,2).skip,false);
 assert.equal(consumeInvasionChaosDrawSkip(resolved.ledger,1,3).skip,true);
});

test('Fenrir queues simultaneous skips one Draw Phase at a time',()=>{
 const ledger={version:1,lastSequence:0,pending:[],processed:[],drawSkips:[
  {eventId:'skip-a',sourceUid:'m0:a',team:1,dueTurn:2},
  {eventId:'skip-b',sourceUid:'m0:b',team:1,dueTurn:2}
 ]};
 const first=consumeInvasionChaosDrawSkip(ledger,1,2);
 assert.equal(first.skip,true);assert.equal(first.ledger.drawSkips.length,1);
 assert.equal(first.ledger.drawSkips[0].dueTurn,4);
 assert.equal(consumeInvasionChaosDrawSkip(first.ledger,1,4).skip,true);
});

test('Fenrir does not trigger when its source is face-down or in Defense Position',()=>{
 for(const patch of [{faceUp:false},{position:'def'}]){
  const duel=base(),source=addMonster(duel,0,0,placeholders.fenrir),target=addMonster(duel,1,1,filler[0]);
  Object.assign(source,patch);
  const moved=destroyTarget(duel,source,target,{eventId:'fenrir-illegal-'+Object.keys(patch)[0],sequence:1});
  assert.equal(recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups).status,'no-trigger');
 }
});

test('a source binding that leaves and re-enters the Monster Zone cannot be replayed',()=>{
 const duel=base(),source=addMonster(duel,0,0,placeholders.inferno),target=addMonster(duel,1,1,filler[0]);
 const moved=destroyTarget(duel,source,target,{eventId:'inferno-stale',sequence:1});
 const field=duel.core.players[0].monsters.find(card=>card.uid===source.uid);
 duel.core.players[0].monsters=duel.core.players[0].monsters.filter(card=>card.uid!==source.uid);
 duel.core.players[0].grave.push({uid:field.uid,id:field.id});synchronizeCardLifetimes(duel.core);
 duel.core.players[0].grave=duel.core.players[0].grave.filter(card=>card.uid!==source.uid);
 duel.core.players[0].monsters.push(field);synchronizeCardLifetimes(duel.core);
 assert.equal(recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups).status,'no-trigger');
});

test('duplicate event delivery is idempotent and conflicting replay is rejected',()=>{
 const duel=base(),source=addMonster(duel,0,0,placeholders.gigantes);
 const moved=destroySource(duel,source,{eventId:'duplicate-ioc',sequence:1});
 const ledger=createInvasionChaosLedger(),first=recordInvasionChaosBattleEvent(moved.state,ledger,moved.event,lookups);
 assert.equal(recordInvasionChaosBattleEvent(moved.state,first.ledger,moved.event,lookups).status,'duplicate');
 const changed={...moved.event,destination:'banished'};
 assert.throws(()=>recordInvasionChaosBattleEvent(moved.state,first.ledger,changed,lookups),/Replay divergente/i);
});

test('out-of-order event sequences are rejected',()=>{
 const duel=base(),source=addMonster(duel,0,0,placeholders.gigantes);
 const moved=destroySource(duel,source,{eventId:'sequence-ioc',sequence:2});
 const ledger={...createInvasionChaosLedger(),lastSequence:2};
 assert.throws(()=>recordInvasionChaosBattleEvent(moved.state,ledger,moved.event,lookups),/fora de ordem/i);
});

test('an invalid resolution window cannot apply a pending trigger',()=>{
 const duel=base(),source=addMonster(duel,0,0,placeholders.gigantes);
 const moved=destroySource(duel,source,{eventId:'window-ioc',sequence:1});
 const recorded=recordInvasionChaosBattleEvent(moved.state,createInvasionChaosLedger(),moved.event,lookups);
 assert.throws(()=>resolveInvasionChaosBattleTrigger(moved.state,recorded.ledger,{
  ...windowFor(moved.state,'window-ioc'),activeSeat:2
 }),/janela/i);
});

test('all four adapters conserve every physical UID and never grant inventory',()=>{
 const duel=base(),before=inventory(duel);
 for(const key of ['gigantes','fenrir','inferno','silpheed']){
  const {candidate,costCards}=summonCandidate(duel,key);
  const result=specialSummonInvasionChaosFromHand(duel,duel.cursor,candidate.uid,costCards.map(card=>card.uid),lookups);
  assert.equal(result.status,'summoned');
  Object.assign(duel,result.state);
 }
 assert.deepEqual(inventory(duel),before);
 assert.equal(tagInventory(duel).filter(card=>card.entityKind!=='token').length,before.length);
});
