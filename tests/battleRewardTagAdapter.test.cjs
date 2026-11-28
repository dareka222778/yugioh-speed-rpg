const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,tagInventory}=require('../dist/tagDuel');
const {enabledCardIds,engineCard,getDuelCard}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const adapter=require('../dist/battleRewardTagAdapter');

function unique(kind,count){
 const seen=new Set();
 return enabledCardIds.filter(id=>{
  const card=engineCard(id);if(!card||card.kind!==kind||card.fusion)return false;
  if(kind==='monster'&&(!Number.isSafeInteger(card.level)||card.level<1))return false;
  const name=card.englishName||card.name;if(seen.has(name))return false;seen.add(name);return true;
 }).slice(0,count);
}
const monsterIds=unique('monster',8),spellIds=unique('spell',6),trapIds=unique('trap',6),fusionIds=enabledCardIds.filter(id=>!!engineCard(id)?.fusion).slice(0,5);
assert.equal(monsterIds.length,8);assert.equal(spellIds.length,6);assert.equal(trapIds.length,6);assert.equal(fusionIds.length,5);
const deck=[...monsterIds,...spellIds,...trapIds],fixture={airknight:monsterIds[0],aswan:monsterIds[1],absorbing:monsterIds[2],enemy:monsterIds[3],enemy2:monsterIds[4]};
const definitions={
 [fixture.airknight]:{id:adapter.AIRKNIGHT_PARSHATH_ID,name:'Airknight Parshath',kind:'monster',effect:'airknight-parshath',level:5},
 [fixture.aswan]:{id:adapter.ASWAN_APPARITION_ID,name:'Aswan Apparition',kind:'monster',effect:'aswan-apparition',level:3},
 [fixture.absorbing]:{id:adapter.ABSORBING_KID_FROM_THE_SKY_ID,name:'Absorbing Kid from the Sky',kind:'monster',effect:'absorbing-kid-from-the-sky',level:4}
};
function lookup(id){return definitions[id];}
function setup(first=2,isNegated=()=>false){
 const players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...deck],extra:[...fusionIds]}));
 const duel=createTagDuel(players,{classic:true,first,seed:'m688-battle-rewards'});
 return adapter.createBattleRewardSession(duel,lookup,isNegated);
}
function holder(duel,seat){const team=seat%2;return duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];}
function take(duel,seat,id){
 const held=holder(duel,seat);
 for(const zone of ['hand','deck','extra']){const list=held[zone]||[],index=list.findIndex(card=>card.id===id);if(index>=0)return list.splice(index,1)[0];}
 throw new Error('Fixture card not found: '+id);
}
function deploy(session,team,id,seat=session.duel.active[team],options={}){
 const card=take(session.duel,seat,id),turn=session.duel.core.turn;
 const monster={...card,position:options.position??'atk',faceUp:options.faceUp??true,entered:turn,lastSummonedTurn:turn,changed:turn,attacked:0,atkBoost:0,defBoost:0,owner:team};
 session.duel.core.players[team].monsters.push(monster);synchronizeCardLifetimes(session.duel.core);return monster;
}
function moveToGrave(duel,team,monster){
 duel.core.players[team].monsters=duel.core.players[team].monsters.filter(card=>card.uid!==monster.uid);
 duel.core.players[team].grave.push({uid:monster.uid,id:monster.id});synchronizeCardLifetimes(duel.core);
}
function putTrapInGrave(session,ownerSeat,trapId){
 const card=take(session.duel,ownerSeat,trapId),team=ownerSeat%2;
 session.duel.core.players[team].grave.push(card);synchronizeCardLifetimes(session.duel.core);return card;
}
function battle(session,eventId,attacker,defender,damageToTeam=1){
 session.duel.core.phase='battle';
 return {eventId,turn:session.duel.core.turn,activeSeat:session.duel.cursor,attackerUid:attacker.uid,defenderUid:defender.uid,damageToTeam,damageKind:'battle',amount:350};
}
function inventory(duel){return new Map(tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]));}
function assertInventorySame(before,duel){const after=inventory(duel);assert.equal(after.size,before.size);for(const [uid,id]of before)assert.equal(after.get(uid),id);}
function hands(duel){const result={};for(let seat=0;seat<4;seat++)result[seat]=holder(duel,seat).hand.map(card=>card.uid).sort();return result;}

test('M688 candidate identities and Konami CIDs are explicit and not silently admitted',()=>{
 assert.equal(adapter.AIRKNIGHT_PARSHATH_ID,'18036057');assert.equal(adapter.AIRKNIGHT_PARSHATH_KONAMI_CID,5023);
 assert.equal(adapter.ASWAN_APPARITION_ID,'88236094');assert.equal(adapter.ASWAN_APPARITION_KONAMI_CID,6026);
 assert.equal(adapter.ABSORBING_KID_FROM_THE_SKY_ID,'49771608');assert.equal(adapter.ABSORBING_KID_FROM_THE_SKY_KONAMI_CID,6034);
 for(const id of [adapter.AIRKNIGHT_PARSHATH_ID,adapter.ASWAN_APPARITION_ID,adapter.ABSORBING_KID_FROM_THE_SKY_ID]){assert.equal(enabledCardIds.includes(id),false);assert.equal(getDuelCard(id),undefined);}
});

test('Airknight Parshath pierces only while face-up in attack position against Defense Position',()=>{
 const session=setup(),source=deploy(session,0,fixture.airknight,0),defender=deploy(session,1,fixture.enemy,3,{position:'def',faceUp:false});
 assert.equal(adapter.airknightParshathInflictsPiercing(session.duel,source.uid,defender.uid,lookup),true);
 defender.position='atk';assert.equal(adapter.airknightParshathInflictsPiercing(session.duel,source.uid,defender.uid,lookup),false);
 defender.position='def';session.duel.core.players[0].monsters.find(card=>card.uid===source.uid).faceUp=false;
 assert.equal(adapter.airknightParshathInflictsPiercing(session.duel,source.uid,defender.uid,lookup),false);
});

test('Airknight draw goes to the active physical seat hand, not the teammate owner hand',()=>{
 const session=setup(2),source=deploy(session,0,fixture.airknight,0),defender=deploy(session,1,fixture.enemy,3);
 const activeSeat=2,activeDeckBefore=session.duel.core.players[0].deck.length,activeHandBefore=session.duel.core.players[0].hand.length;
 const ownerDeckBefore=session.duel.reserves['0'].deck.length,ownerHandBefore=session.duel.reserves['0'].hand.length;
 const event=battle(session,'air-draw-1',source,defender,1);
 adapter.prepareAirknightParshathDraw(session,event,source.uid);
 const result=adapter.resolveAirknightParshathDraw(session,'air-draw-1');
 assert.equal(result.status,'drawn');assert.equal(result.activeSeat,activeSeat);assert.match(result.drawnUid,/^m2:/);
 assert.equal(session.duel.core.players[0].deck.length,activeDeckBefore-1);assert.equal(session.duel.core.players[0].hand.length,activeHandBefore+1);
 assert.equal(session.duel.reserves['0'].deck.length,ownerDeckBefore);assert.equal(session.duel.reserves['0'].hand.length,ownerHandBefore);
});

test('Airknight draw waits for a positive battle-damage event and rejects unrelated/effect damage',()=>{
 const session=setup(),source=deploy(session,0,fixture.airknight,0),defender=deploy(session,1,fixture.enemy,3);
 session.duel.core.phase='battle';
 assert.throws(()=>adapter.prepareAirknightParshathDraw(session,{...battle(session,'air-zero',source,defender),amount:0},source.uid),/dano de batalha positivo/);
 assert.throws(()=>adapter.prepareAirknightParshathDraw(session,{...battle(session,'air-effect',source,defender),damageKind:'effect'},source.uid),/dano de batalha positivo/);
 assert.throws(()=>adapter.prepareAirknightParshathDraw(session,{...battle(session,'air-other',source,defender),attackerUid:defender.uid},source.uid),/não representa dano/);
});

test('Airknight draw is idempotent and never grants a card when the active Deck is empty',()=>{
 const session=setup(),source=deploy(session,0,fixture.airknight,0),defender=deploy(session,1,fixture.enemy,3);
 const before=inventory(session.duel),event=battle(session,'air-once',source,defender,1),deck=session.duel.core.players[0].deck;
 adapter.prepareAirknightParshathDraw(session,event,source.uid);
 const first=adapter.resolveAirknightParshathDraw(session,'air-once'),handAfter=session.duel.core.players[0].hand.length;
 const replay=adapter.resolveAirknightParshathDraw(session,'air-once');
 assert.equal(first.status,'drawn');assert.equal(replay.status,'duplicate');assert.equal(session.duel.core.players[0].hand.length,handAfter);assertInventorySame(before,session.duel);
 const empty=setup(),source2=deploy(empty,0,fixture.airknight,0),defender2=deploy(empty,1,fixture.enemy,3);
 const remaining=empty.duel.core.players[0].deck.splice(0);empty.duel.core.players[0].grave.push(...remaining);synchronizeCardLifetimes(empty.duel.core);
 const event2=battle(empty,'air-empty',source2,defender2,1);
 adapter.prepareAirknightParshathDraw(empty,event2,source2.uid);
 assert.equal(adapter.resolveAirknightParshathDraw(empty,'air-empty').status,'deck-empty');
});

test('Aswan Apparition returns a Trap to the top of its original physical owner Deck',()=>{
 const session=setup(2),source=deploy(session,0,fixture.aswan,2),defender=deploy(session,1,fixture.enemy,3),trap=putTrapInGrave(session,0,trapIds[0]);
 const ownerDeck=session.duel.reserves['0'].deck,activeDeck=session.duel.core.players[0].deck,activeTop=activeDeck[0]?.uid,ownerTop=ownerDeck[0]?.uid;
 const event=battle(session,'aswan-top',source,defender,1);
 adapter.prepareAswanApparitionRecovery(session,event,source.uid,trap.uid);
 const result=adapter.resolveAswanApparitionRecovery(session,'aswan-top');
 assert.equal(result.status,'returned-to-deck-top');assert.equal(result.ownerSeat,0);
 assert.equal(session.duel.reserves['0'].deck[0].uid,trap.uid);assert.equal(session.duel.core.players[0].deck[0]?.uid,activeTop);
 assert.notEqual(session.duel.reserves['0'].deck[0]?.uid,ownerTop);
});

test('Aswan rejects a non-Trap or an opponent-team Graveyard target',()=>{
 const session=setup(),source=deploy(session,0,fixture.aswan,0),defender=deploy(session,1,fixture.enemy,3);
 const other=take(session.duel,0,monsterIds[6]);session.duel.core.players[0].grave.push(other);synchronizeCardLifetimes(session.duel.core);
 const event=battle(session,'aswan-invalid',source,defender,1);
 assert.throws(()=>adapter.prepareAswanApparitionRecovery(session,event,source.uid,other.uid),/Armadilha/);
});

test('Aswan never retargets a Trap that leaves the Graveyard before resolution',()=>{
 const session=setup(),source=deploy(session,0,fixture.aswan,0),defender=deploy(session,1,fixture.enemy,3),trap=putTrapInGrave(session,0,trapIds[0]);
 const before=inventory(session.duel),event=battle(session,'aswan-stale',source,defender,1);
 adapter.prepareAswanApparitionRecovery(session,event,source.uid,trap.uid);
 const grave=session.duel.core.players[0].grave,removed=grave.splice(grave.findIndex(card=>card.uid===trap.uid),1)[0];
 session.duel.core.players[0].banished.push(removed);synchronizeCardLifetimes(session.duel.core);
 assert.equal(adapter.resolveAswanApparitionRecovery(session,'aswan-stale').status,'target-lost');assertInventorySame(before,session.duel);
});

test('Aswan replay does not move the same Trap twice and private hands remain unchanged',()=>{
 const session=setup(2),source=deploy(session,0,fixture.aswan,2),defender=deploy(session,1,fixture.enemy,3),trap=putTrapInGrave(session,0,trapIds[0]);
 const before=inventory(session.duel),handsBefore=hands(session.duel),event=battle(session,'aswan-replay',source,defender,1);
 adapter.prepareAswanApparitionRecovery(session,event,source.uid,trap.uid);
 assert.equal(adapter.resolveAswanApparitionRecovery(session,'aswan-replay').status,'returned-to-deck-top');
 assert.equal(adapter.resolveAswanApparitionRecovery(session,'aswan-replay').status,'duplicate');
 assert.deepEqual(hands(session.duel),handsBefore);assertInventorySame(before,session.duel);
});

test('Absorbing Kid gains destroyed monster Level × 300 LP for its shared team',()=>{
 const session=setup(),source=deploy(session,0,fixture.absorbing,0),destroyed=deploy(session,1,fixture.enemy,3);
 const level=getDuelCard(destroyed.id).level,lpBefore=session.duel.core.players[0].lp;
 moveToGrave(session.duel,1,destroyed);
 session.duel.core.phase='battle';
 const event={eventId:'kid-gain',turn:session.duel.core.turn,activeSeat:session.duel.cursor,attackerUid:source.uid,defenderUid:destroyed.uid,destroyedUid:destroyed.uid,destroyedByBattle:true,destroyedToGrave:true};
 adapter.prepareAbsorbingKidGain(session,event,source.uid);
 const result=adapter.resolveAbsorbingKidGain(session,'kid-gain');
 assert.equal(result.status,'gained-life-points');assert.equal(result.lpGain,level*300);assert.equal(session.duel.core.players[0].lp,lpBefore+level*300);
});

test('Absorbing Kid requires a battle destruction sent to the opposing Graveyard',()=>{
 const session=setup(),source=deploy(session,0,fixture.absorbing,0),destroyed=deploy(session,1,fixture.enemy,3);
 session.duel.core.phase='battle';
 const event={eventId:'kid-not-grave',turn:session.duel.core.turn,activeSeat:session.duel.cursor,attackerUid:source.uid,defenderUid:destroyed.uid,destroyedUid:destroyed.uid,destroyedByBattle:true,destroyedToGrave:false};
 assert.throws(()=>adapter.prepareAbsorbingKidGain(session,event,source.uid),/Evento de destruição/);
});

test('Absorbing Kid does not gain LP twice on replay and respects source negation',()=>{
 let negated=false;
 const session=setup(2,(duel,uid)=>negated&&uid.startsWith('m0:')),source=deploy(session,0,fixture.absorbing,0),destroyed=deploy(session,1,fixture.enemy,3);
 const level=getDuelCard(destroyed.id).level,lpBefore=session.duel.core.players[0].lp;
 moveToGrave(session.duel,1,destroyed);session.duel.core.phase='battle';
 const event={eventId:'kid-once',turn:session.duel.core.turn,activeSeat:session.duel.cursor,attackerUid:source.uid,defenderUid:destroyed.uid,destroyedUid:destroyed.uid,destroyedByBattle:true,destroyedToGrave:true};
 adapter.prepareAbsorbingKidGain(session,event,source.uid);negated=true;
 assert.equal(adapter.resolveAbsorbingKidGain(session,'kid-once').status,'source-negated');
 assert.equal(session.duel.core.players[0].lp,lpBefore);
 const live=setup(),source2=deploy(live,0,fixture.absorbing,0),destroyed2=deploy(live,1,fixture.enemy,3),level2=getDuelCard(destroyed2.id).level,lp2=live.duel.core.players[0].lp;
 moveToGrave(live.duel,1,destroyed2);live.duel.core.phase='battle';
 const event2={eventId:'kid-replay',turn:live.duel.core.turn,activeSeat:live.duel.cursor,attackerUid:source2.uid,defenderUid:destroyed2.uid,destroyedUid:destroyed2.uid,destroyedByBattle:true,destroyedToGrave:true};
 adapter.prepareAbsorbingKidGain(live,event2,source2.uid);
 assert.equal(adapter.resolveAbsorbingKidGain(live,'kid-replay').status,'gained-life-points');
 assert.equal(adapter.resolveAbsorbingKidGain(live,'kid-replay').status,'duplicate');
 assert.equal(live.duel.core.players[0].lp,lp2+level2*300);
});

test('All battle rewards preserve the 2v2 inventory and private hand boundaries',()=>{
 const session=setup(2),air=deploy(session,0,fixture.airknight,0),defender=deploy(session,1,fixture.enemy,3);
 const before=inventory(session.duel),handsBefore=hands(session.duel),event=battle(session,'air-private',air,defender,1);
 adapter.prepareAirknightParshathDraw(session,event,air.uid);adapter.resolveAirknightParshathDraw(session,'air-private');
 assertInventorySame(before,session.duel);
 assert.notDeepEqual(hands(session.duel),handsBefore);
 assert.equal(session.duel.core.players[0].hand.length,handsBefore[2].length+1);
 assert.deepEqual(session.duel.reserves['0'].hand.map(card=>card.uid).sort(),handsBefore[0]);
});
