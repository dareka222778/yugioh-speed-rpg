const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,tagInventory}=require('../dist/tagDuel');
const {enabledCardIds,engineCard,getDuelCard}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const adapter=require('../dist/battleTopdeckTagAdapter');

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
const deck=[...monsterIds,...spellIds,...trapIds];
const fixture={falcos:monsterIds[0],jackal:monsterIds[1],robo:monsterIds[2],enemy:monsterIds[3],enemy2:monsterIds[4]};
const definitions={
 [fixture.falcos]:{id:adapter.WINGED_SAGE_FALCOS_ID,name:'Winged Sage Falcos',kind:'monster',effect:'winged-sage-falcos',level:4},
 [fixture.jackal]:{id:adapter.MYSTICAL_KNIGHT_OF_JACKAL_ID,name:'Mystical Knight of Jackal',kind:'monster',effect:'mystical-knight-of-jackal',level:7},
 [fixture.robo]:{id:adapter.HELPING_ROBO_FOR_COMBAT_ID,name:'Helping Robo for Combat',kind:'monster',effect:'helping-robo-for-combat',level:4}
};
function lookup(id){return definitions[id];}
function setup(first=2,isNegated=()=>false){
 const players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...deck],extra:[...fusionIds]}));
 return adapter.createBattleTopdeckSession(createTagDuel(players,{classic:true,first,seed:'m690-battle-topdeck'}),lookup,isNegated);
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
function moveToBanished(duel,team,monster){
 duel.core.players[team].monsters=duel.core.players[team].monsters.filter(card=>card.uid!==monster.uid);
 duel.core.players[team].banished.push({uid:monster.uid,id:monster.id});synchronizeCardLifetimes(duel.core);
}
function battle(session,eventId,attacker,defender,options={}){
 session.duel.core.phase='battle';
 return {eventId,turn:session.duel.core.turn,activeSeat:session.duel.cursor,attackerUid:attacker.uid,defenderUid:defender.uid,destroyedUid:defender.uid,
  destroyedByBattle:options.destroyedByBattle??true,destroyedToGrave:options.destroyedToGrave??true,
  destroyedFaceUpAtBattleStart:options.destroyedFaceUpAtBattleStart??defender.faceUp,
  destroyedPositionAtBattleStart:options.destroyedPositionAtBattleStart??defender.position};
}
function inventory(duel){return new Map(tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]));}
function assertInventorySame(before,duel){const after=inventory(duel);assert.equal(after.size,before.size);for(const [uid,id]of before)assert.equal(after.get(uid),id);}
function hands(duel){const result={};for(let seat=0;seat<4;seat++)result[seat]=holder(duel,seat).hand.map(card=>card.uid).sort();return result;}

test('M690 identities, CIDs and historical sources remain unadmitted until engine review',()=>{
 assert.equal(adapter.WINGED_SAGE_FALCOS_ID,'87523462');assert.equal(adapter.WINGED_SAGE_FALCOS_KONAMI_CID,5522);
 assert.equal(adapter.MYSTICAL_KNIGHT_OF_JACKAL_ID,'98745000');assert.equal(adapter.MYSTICAL_KNIGHT_OF_JACKAL_KONAMI_CID,5519);
 assert.equal(adapter.HELPING_ROBO_FOR_COMBAT_ID,'47025270');assert.equal(adapter.HELPING_ROBO_FOR_COMBAT_KONAMI_CID,5596);
 for(const id of [adapter.WINGED_SAGE_FALCOS_ID,adapter.MYSTICAL_KNIGHT_OF_JACKAL_ID,adapter.HELPING_ROBO_FOR_COMBAT_ID]){assert.equal(enabledCardIds.includes(id),false);assert.equal(getDuelCard(id),undefined);}
});

test('Falcos requires a face-up Attack Position monster destroyed by battle',()=>{
 const hidden=setup(),source=deploy(hidden,0,fixture.falcos,2),target=deploy(hidden,1,fixture.enemy,3,{position:'def',faceUp:false});
 moveToGrave(hidden.duel,1,target);
 assert.throws(()=>adapter.prepareBattleTopdeck(hidden,battle(hidden,'falcos-hidden',source,target),source.uid),/Falcos exige/);
 const live=setup(),source2=deploy(live,0,fixture.falcos,2),target2=deploy(live,1,fixture.enemy,3,{position:'atk',faceUp:true});
 moveToGrave(live.duel,1,target2);
 adapter.prepareBattleTopdeck(live,battle(live,'falcos-valid',source2,target2),source2.uid);
 assert.equal(adapter.resolveBattleTopdeck(live,'falcos-valid').status,'returned-to-owner-deck-top');
});

test('Mystical Knight of Jackal accepts a face-down Defense Position target and returns it to owner Deck top',()=>{
 const session=setup(),source=deploy(session,0,fixture.jackal,2),target=deploy(session,1,fixture.enemy,1,{position:'def',faceUp:false});
 moveToGrave(session.duel,1,target);
 const ownerDeck=session.duel.reserves['1'].deck,activeTeammateDeck=session.duel.core.players[1].deck,activeTop=activeTeammateDeck[0]?.uid;
 adapter.prepareBattleTopdeck(session,battle(session,'jackal-face-down',source,target),source.uid);
 const result=adapter.resolveBattleTopdeck(session,'jackal-face-down');
 assert.equal(result.ownerSeat,3);assert.equal(ownerDeck[0].uid,target.uid);assert.equal(activeTeammateDeck[0]?.uid,activeTop);
});

test('Topdeck effect rejects non-battle destruction, non-Graveyard destination and friendly targets',()=>{
 const session=setup(),source=deploy(session,0,fixture.jackal,2),target=deploy(session,1,fixture.enemy,3);
 assert.throws(()=>adapter.prepareBattleTopdeck(session,battle(session,'not-battle',source,target,{destroyedByBattle:false}),source.uid),/destruição do defensor/);
 assert.throws(()=>adapter.prepareBattleTopdeck(session,battle(session,'not-grave',source,target,{destroyedToGrave:false}),source.uid),/enviado ao Cemitério/);
 const friendly=deploy(session,0,fixture.enemy2,0);moveToGrave(session.duel,0,friendly);
 assert.throws(()=>adapter.prepareBattleTopdeck(session,battle(session,'friendly-grave',source,friendly),source.uid),/Cemitério da equipe adversária/);
});

test('Topdeck target cannot be retargeted after leaving the Graveyard; replay is idempotent',()=>{
 const session=setup(),source=deploy(session,0,fixture.jackal,2),target=deploy(session,1,fixture.enemy,3);
 moveToGrave(session.duel,1,target);const before=inventory(session.duel);
 adapter.prepareBattleTopdeck(session,battle(session,'stale-target',source,target),source.uid);
 const grave=session.duel.core.players[1].grave,removed=grave.splice(grave.findIndex(card=>card.uid===target.uid),1)[0];
 session.duel.core.players[1].banished.push(removed);synchronizeCardLifetimes(session.duel.core);
 assert.equal(adapter.resolveBattleTopdeck(session,'stale-target').status,'target-lost');
 assertInventorySame(before,session.duel);
 const fresh=setup(),source2=deploy(fresh,0,fixture.jackal,2),target2=deploy(fresh,1,fixture.enemy,1);
 moveToGrave(fresh.duel,1,target2);adapter.prepareBattleTopdeck(fresh,battle(fresh,'top-replay',source2,target2),source2.uid);
 assert.equal(adapter.resolveBattleTopdeck(fresh,'top-replay').status,'returned-to-owner-deck-top');
 assert.equal(adapter.resolveBattleTopdeck(fresh,'top-replay').status,'duplicate');
 assert.equal(fresh.duel.reserves['1'].deck.filter(card=>card.uid===target2.uid).length,1);
});

test('A topdeck trigger resolves if its source leaves the field after activation',()=>{
 const session=setup(),source=deploy(session,0,fixture.jackal,2),target=deploy(session,1,fixture.enemy,3);
 moveToGrave(session.duel,1,target);adapter.prepareBattleTopdeck(session,battle(session,'source-left',source,target),source.uid);
 moveToGrave(session.duel,0,source);
 assert.equal(adapter.resolveBattleTopdeck(session,'source-left').status,'returned-to-owner-deck-top');
});

test('Topdeck resolution observes negation and rejects a stale battle window',()=>{
 let negated=false,sourceUid='';
 const session=setup(2,(duel,uid)=>negated&&uid===sourceUid),source=deploy(session,0,fixture.jackal,2),target=deploy(session,1,fixture.enemy,3);
 sourceUid=source.uid;moveToGrave(session.duel,1,target);
 adapter.prepareBattleTopdeck(session,battle(session,'top-negated',source,target),source.uid);negated=true;
 assert.equal(adapter.resolveBattleTopdeck(session,'top-negated').status,'source-negated');
 const other=setup(),source2=deploy(other,0,fixture.jackal,2),target2=deploy(other,1,fixture.enemy,3);
 moveToGrave(other.duel,1,target2);adapter.prepareBattleTopdeck(other,battle(other,'top-window',source2,target2),source2.uid);
 other.duel.core.phase='main';assert.equal(adapter.resolveBattleTopdeck(other,'top-window').status,'active-seat-changed');
});

test('Helping Robo draws to active physical hand, allows 7 until End Phase, then returns the chosen card to Deck bottom',()=>{
 const session=setup(),source=deploy(session,0,fixture.robo,2),target=deploy(session,1,fixture.enemy,3);
 moveToBanished(session.duel,1,target);
 const active=session.duel.core.players[0];
 while(active.hand.length<6){const extra=active.deck.shift();assert.ok(extra);active.hand.push(extra);}
 synchronizeCardLifetimes(session.duel.core);assert.equal(active.hand.length,6);
 const before=inventory(session.duel),handsBefore=hands(session.duel),deckBefore=active.deck.length;
 adapter.prepareHelpingRoboForCombat(session,battle(session,'robo-cycle',source,target,{destroyedToGrave:false}),source.uid);
 const draw=adapter.resolveHelpingRoboDraw(session,'robo-cycle');
 assert.equal(draw.status,'awaiting-hand-selection');assert.match(draw.drawnUid,/^m2:/);
 assert.equal(active.deck.length,deckBefore-1);assert.equal(active.hand.length,7);
 assert.equal(session.duel.reserves['0'].hand.length,handsBefore[0].length);
 const returned=adapter.completeHelpingRoboForCombat(session,'robo-cycle',draw.drawnUid);
 assert.equal(returned.status,'returned-to-deck-bottom');assert.equal(active.hand.length,6);assert.equal(active.deck.at(-1).uid,draw.drawnUid);
 assert.equal(session.duel.reserves['0'].hand.length,handsBefore[0].length);assertInventorySame(before,session.duel);
});

test('Helping Robo can return an existing hand card instead of the newly drawn card',()=>{
 const session=setup(),source=deploy(session,0,fixture.robo,2),target=deploy(session,1,fixture.enemy,3);
 moveToBanished(session.duel,1,target);const active=session.duel.core.players[0],chosen=active.hand[0].uid;
 adapter.prepareHelpingRoboForCombat(session,battle(session,'robo-existing',source,target,{destroyedToGrave:false}),source.uid);
 const draw=adapter.resolveHelpingRoboDraw(session,'robo-existing');
 assert.equal(adapter.completeHelpingRoboForCombat(session,'robo-existing',chosen).status,'returned-to-deck-bottom');
 assert.equal(active.deck.at(-1).uid,chosen);assert.equal(active.hand.some(card=>card.uid===draw.drawnUid),true);
});

test('Helping Robo rejects a card from a teammate private hand',()=>{
 const session=setup(),source=deploy(session,0,fixture.robo,2),target=deploy(session,1,fixture.enemy,3);
 moveToBanished(session.duel,1,target);
 adapter.prepareHelpingRoboForCombat(session,battle(session,'robo-private',source,target,{destroyedToGrave:false}),source.uid);
 adapter.resolveHelpingRoboDraw(session,'robo-private');
 assert.throws(()=>adapter.completeHelpingRoboForCombat(session,'robo-private',session.duel.reserves['0'].hand[0].uid),/mão privada do assento ativo/);
});

test('Helping Robo empty Deck reports deck-empty without granting or drawing from another seat',()=>{
 const session=setup(),source=deploy(session,0,fixture.robo,2),target=deploy(session,1,fixture.enemy,3);
 moveToBanished(session.duel,1,target);
 const active=session.duel.core.players[0],remaining=active.deck.splice(0);active.grave.push(...remaining);synchronizeCardLifetimes(session.duel.core);
 const before=inventory(session.duel),handsBefore=hands(session.duel);
 adapter.prepareHelpingRoboForCombat(session,battle(session,'robo-empty',source,target,{destroyedToGrave:false}),source.uid);
 const result=adapter.resolveHelpingRoboDraw(session,'robo-empty');
 assert.equal(result.status,'deck-empty');assert.equal(result.drawnUid,undefined);
 assert.deepEqual(hands(session.duel),handsBefore);assertInventorySame(before,session.duel);
});

test('Helping Robo draw and return are separately idempotent',()=>{
 const session=setup(),source=deploy(session,0,fixture.robo,2),target=deploy(session,1,fixture.enemy,3);
 moveToBanished(session.duel,1,target);const before=inventory(session.duel);
 adapter.prepareHelpingRoboForCombat(session,battle(session,'robo-replay',source,target,{destroyedToGrave:false}),source.uid);
 const draw=adapter.resolveHelpingRoboDraw(session,'robo-replay');
 assert.equal(adapter.resolveHelpingRoboDraw(session,'robo-replay').status,'duplicate');
 assert.equal(adapter.completeHelpingRoboForCombat(session,'robo-replay',draw.drawnUid).status,'returned-to-deck-bottom');
 assert.equal(adapter.completeHelpingRoboForCombat(session,'robo-replay',draw.drawnUid).status,'duplicate');assertInventorySame(before,session.duel);
});

test('Helping Robo observes negation after trigger capture and rejects invalid source/event',()=>{
 let negated=false,sourceUid='';
 const session=setup(2,(duel,uid)=>negated&&uid===sourceUid),source=deploy(session,0,fixture.robo,2),target=deploy(session,1,fixture.enemy,3);
 sourceUid=source.uid;moveToBanished(session.duel,1,target);
 const before=inventory(session.duel),deckBefore=session.duel.core.players[0].deck.length;
 adapter.prepareHelpingRoboForCombat(session,battle(session,'robo-negated',source,target,{destroyedToGrave:false}),source.uid);negated=true;
 assert.equal(adapter.resolveHelpingRoboDraw(session,'robo-negated').status,'source-negated');
 assert.equal(session.duel.core.players[0].deck.length,deckBefore);assertInventorySame(before,session.duel);
 const invalid=setup(),attacker=deploy(invalid,0,fixture.robo,2),defender=deploy(invalid,1,fixture.enemy,3);
 assert.throws(()=>adapter.prepareHelpingRoboForCombat(invalid,battle(invalid,'robo-wrong-source',attacker,defender),defender.uid),/atacante que destruiu/);
 assert.throws(()=>adapter.prepareHelpingRoboForCombat(invalid,battle(invalid,'robo-effect',attacker,defender,{destroyedByBattle:false}),attacker.uid),/destruição do defensor/);
});

test('All M690 effects preserve the 2v2 inventory and private hand boundaries',()=>{
 const session=setup(2),source=deploy(session,0,fixture.robo,2),target=deploy(session,1,fixture.enemy,3);
 moveToBanished(session.duel,1,target);
 const before=inventory(session.duel),handsBefore=hands(session.duel);
 adapter.prepareHelpingRoboForCombat(session,battle(session,'robo-boundaries',source,target,{destroyedToGrave:false}),source.uid);
 const draw=adapter.resolveHelpingRoboDraw(session,'robo-boundaries');
 adapter.completeHelpingRoboForCombat(session,'robo-boundaries',draw.drawnUid);
 assertInventorySame(before,session.duel);
 assert.deepEqual(session.duel.reserves['0'].hand.map(card=>card.uid).sort(),handsBefore[0]);
 assert.deepEqual(session.duel.core.players[1].hand.map(card=>card.uid).sort(),handsBefore[3]);
});
