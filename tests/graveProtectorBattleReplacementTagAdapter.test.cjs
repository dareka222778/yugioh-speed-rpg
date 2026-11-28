const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,tagInventory}=require('../dist/tagDuel');
const {enabledCardIds,engineCard,getDuelCard}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {createTokenGroup}=require('../dist/tokens');
const {rulesFor}=require('../dist/rulesProfile');
const adapter=require('../dist/graveProtectorBattleReplacementTagAdapter');

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
const fixture={protector:monsterIds[0],target:monsterIds[1],target2:monsterIds[2],target3:monsterIds[3]};
const definitions={[fixture.protector]:{id:adapter.GRAVE_PROTECTOR_ID,name:'Grave Protector',kind:'monster',effect:'grave-protector',level:4}};
function lookup(id){return definitions[id];}
function setup(first=2,isNegated=()=>false){
 const players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...deck],extra:[...fusionIds]}));
 return adapter.createGraveProtectorSession(createTagDuel(players,{classic:true,first,seed:'m691-grave-protector'}),lookup,isNegated);
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
function event(session,eventId,target,fieldTeam,overrides={}){
 session.duel.core.phase='battle';
 return {eventId,turn:session.duel.core.turn,phase:'battle',activeSeat:session.duel.cursor,currentTeam:session.duel.core.current,fieldTeam,destroyedUid:target.uid,destroyedByBattle:overrides.destroyedByBattle??true};
}
function inventory(duel){return new Map(tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]));}
function assertInventorySame(before,duel){const after=inventory(duel);assert.equal(after.size,before.size);for(const [uid,id]of before)assert.equal(after.get(uid),id);}
function moveToGrave(duel,team,monster){duel.core.players[team].monsters=duel.core.players[team].monsters.filter(card=>card.uid!==monster.uid);duel.core.players[team].grave.push({uid:monster.uid,id:monster.id});synchronizeCardLifetimes(duel.core);}

test('M691 identity and official historical source remain outside engine certification',()=>{
 assert.equal(adapter.GRAVE_PROTECTOR_ID,'11448373');assert.equal(adapter.GRAVE_PROTECTOR_KONAMI_CID,6039);
 assert.equal(enabledCardIds.includes(adapter.GRAVE_PROTECTOR_ID),false);assert.equal(getDuelCard(adapter.GRAVE_PROTECTOR_ID),undefined);
 const source='https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=6039&request_locale=en';
 assert.match(source,/cid=6039/);
});

test('A face-up Grave Protector shuffles a battle-destroyed face-down monster into its physical owner Deck',()=>{
 const session=setup(),source=deploy(session,0,fixture.protector,2),target=deploy(session,1,fixture.target,1,{position:'def',faceUp:false});
 const ownerDeck=session.duel.reserves['1'].deck,activeTeammateDeck=session.duel.core.players[1].deck;
 const randomBefore=session.duel.core.random.counter,before=inventory(session.duel);
 const result=adapter.applyGraveProtectorReplacement(session,event(session,'main-shuffle',target,1));
 assert.equal(result.status,'shuffled-to-owner-main-deck');assert.equal(result.destination,'owner-main-deck');assert.equal(result.ownerSeat,1);assert.equal(result.sourceUid,source.uid);
 assert.equal(ownerDeck.filter(card=>card.uid===target.uid).length,1);assert.equal(activeTeammateDeck.some(card=>card.uid===target.uid),false);
 assert.equal(session.duel.core.players[1].grave.some(card=>card.uid===target.uid),false);
 assert.ok(session.duel.core.random.counter>randomBefore);assert.equal('cardId' in result,false);assert.equal('deckOrder' in result,false);
 assertInventorySame(before,session.duel);
});

test('The global replacement also returns a stolen monster to its original physical owner',()=>{
 const session=setup(),source=deploy(session,1,fixture.protector,3),target=deploy(session,0,fixture.target2,0);
 const ownerDeck=session.duel.reserves['0'].deck,activeTeammateDeck=session.duel.core.players[0].deck;
 const result=adapter.applyGraveProtectorReplacement(session,event(session,'opponent-field',target,0));
 assert.equal(result.status,'shuffled-to-owner-main-deck');assert.equal(result.ownerSeat,0);
 assert.equal(ownerDeck.some(card=>card.uid===target.uid),true);assert.equal(activeTeammateDeck.some(card=>card.uid===target.uid),false);
});

test('A Fusion monster returns to its physical owner Extra Deck without consuming random state',()=>{
 const session=setup(),source=deploy(session,0,fixture.protector,2),fusion=deploy(session,1,fusionIds[0],1);
 const ownerExtra=session.duel.reserves['1'].extra,ownerDeck=session.duel.reserves['1'].deck,randomBefore=session.duel.core.random.counter;
 const result=adapter.applyGraveProtectorReplacement(session,event(session,'fusion-extra',fusion,1));
 assert.equal(result.status,'returned-to-owner-extra-deck');assert.equal(result.destination,'owner-extra-deck');
 assert.equal(ownerExtra.filter(card=>card.uid===fusion.uid).length,1);assert.equal(ownerDeck.some(card=>card.uid===fusion.uid),false);
 assert.equal(session.duel.core.random.counter,randomBefore);assert.equal(result.sourceUid,source.uid);
});

test('No active face-up Grave Protector leaves the normal battle destination untouched',()=>{
 const session=setup(),target=deploy(session,1,fixture.target,1);
 const before=inventory(session.duel),result=adapter.applyGraveProtectorReplacement(session,event(session,'no-source',target,1));
 assert.equal(result.status,'no-active-protector');assert.equal(session.duel.core.players[1].monsters.some(card=>card.uid===target.uid),true);
 assertInventorySame(before,session.duel);
});

test('Face-down Grave Protector is not a continuous replacement source',()=>{
 const session=setup(),source=deploy(session,0,fixture.protector,2,{position:'def',faceUp:false}),target=deploy(session,1,fixture.target,1);
 const result=adapter.applyGraveProtectorReplacement(session,event(session,'face-down-source',target,1));
 assert.equal(result.status,'no-active-protector');assert.equal(session.duel.core.players[0].monsters.some(card=>card.uid===source.uid),true);
 assert.equal(session.duel.core.players[1].monsters.some(card=>card.uid===target.uid),true);
});

test('A negated source does not replace the battle destination',()=>{
 let sourceUid='';const session=setup(2,(duel,uid)=>uid===sourceUid),source=deploy(session,0,fixture.protector,2),target=deploy(session,1,fixture.target,1);
 sourceUid=source.uid;
 const result=adapter.applyGraveProtectorReplacement(session,event(session,'negated-source',target,1));
 assert.equal(result.status,'source-negated');assert.equal(session.duel.core.players[1].monsters.some(card=>card.uid===target.uid),true);
});

test('Multiple active copies still apply one replacement and one shuffle',()=>{
 const session=setup(),first=deploy(session,0,fixture.protector,2),second=deploy(session,1,fixture.protector,3),target=deploy(session,1,fixture.target,1);
 const result=adapter.applyGraveProtectorReplacement(session,event(session,'multiple-sources',target,1));
 assert.equal(result.status,'shuffled-to-owner-main-deck');assert.equal(result.sourceUid,first.uid);
 assert.equal(session.duel.reserves['1'].deck.filter(card=>card.uid===target.uid).length,1);
 assert.equal(session.duel.core.players[1].monsters.some(card=>card.uid===second.uid),true);
});

test('Grave Protector can replace its own battle-destruction destination while face-up at the event',()=>{
 const session=setup(),target=deploy(session,1,fixture.protector,1);
 const result=adapter.applyGraveProtectorReplacement(session,event(session,'self-replacement',target,1));
 assert.equal(result.status,'shuffled-to-owner-main-deck');assert.equal(result.sourceUid,target.uid);
 assert.equal(session.duel.reserves['1'].deck.some(card=>card.uid===target.uid),true);
});

test('Token destroyed by battle vanishes through the token ledger, never into inventory or a Deck',()=>{
 const session=setup(),source=deploy(session,0,fixture.protector,2);
 const token=createTokenGroup(session.duel.core,1,1,'def')[0],before=inventory(session.duel);
 const result=adapter.applyGraveProtectorReplacement(session,event(session,'token-vanish',token,1));
 assert.equal(result.status,'token-vanishes');assert.equal(result.destination,'vanished-token');
 assert.equal(session.duel.core.players[1].monsters.some(card=>card.uid===token.uid),false);
 assert.equal(session.duel.core.tokenLedger.entries.find(entry=>entry.uid===token.uid).status,'removed');
 assert.equal(session.duel.core.tokenLedger.entries.find(entry=>entry.uid===token.uid).cause,'battle');
 assert.equal(session.duel.core.players[1].deck.some(card=>card.uid===token.uid),false);
 assert.equal(result.sourceUid,source.uid);assertInventorySame(before,session.duel);
});

test('Effect destruction does not invoke the battle replacement',()=>{
 const session=setup(),source=deploy(session,0,fixture.protector,2),target=deploy(session,1,fixture.target,1);
 const result=adapter.applyGraveProtectorReplacement(session,event(session,'effect-destruction',target,1,{destroyedByBattle:false}));
 assert.equal(result.status,'not-battle-destruction');assert.equal(session.duel.core.players[1].monsters.some(card=>card.uid===target.uid),true);
 assert.equal(result.sourceUid,undefined);assert.equal(session.duel.core.players[0].monsters.some(card=>card.uid===source.uid),true);
});

test('An event arriving after the target left the field cannot move it again',()=>{
 const session=setup(),source=deploy(session,0,fixture.protector,2),target=deploy(session,1,fixture.target,1);
 moveToGrave(session.duel,1,target);
 const result=adapter.applyGraveProtectorReplacement(session,event(session,'late-event',target,1));
 assert.equal(result.status,'target-not-on-field');assert.equal(session.duel.core.players[1].grave.some(card=>card.uid===target.uid),true);
 assert.equal(session.duel.core.players[0].monsters.some(card=>card.uid===source.uid),true);
});

test('Replacement is idempotent and an event ID cannot be reused for another target',()=>{
 const session=setup(),source=deploy(session,0,fixture.protector,2),target=deploy(session,1,fixture.target,1),other=deploy(session,1,fixture.target2,3);
 const before=inventory(session.duel),firstEvent=event(session,'replay',target,1);
 const first=adapter.applyGraveProtectorReplacement(session,firstEvent),counter=session.duel.core.random.counter;
 assert.equal(first.status,'shuffled-to-owner-main-deck');
 assert.equal(adapter.applyGraveProtectorReplacement(session,firstEvent).status,'duplicate');
 assert.equal(session.duel.core.random.counter,counter);
 assert.throws(()=>adapter.applyGraveProtectorReplacement(session,event(session,'replay',other,1)),/ID de evento reutilizado/);
 assert.equal(session.duel.reserves['1'].deck.filter(card=>card.uid===target.uid).length,1);
 assert.equal(session.duel.core.players[1].monsters.some(card=>card.uid===other.uid),true);
 assert.equal(first.sourceUid,source.uid);assertInventorySame(before,session.duel);
});

test('A destroyed monster is shuffled even when Grave Protector is controlled by the other team',()=>{
 const session=setup(),source=deploy(session,1,fixture.protector,3),target=deploy(session,0,fixture.target,0);
 const result=adapter.applyGraveProtectorReplacement(session,event(session,'global-other-team',target,0));
 assert.equal(result.status,'shuffled-to-owner-main-deck');assert.equal(result.sourceUid,source.uid);
 assert.equal(session.duel.reserves['0'].deck.some(card=>card.uid===target.uid),true);
});

test('A deterministic private DuelRandom stream produces the same shuffle for the same seed',()=>{
 const make=()=>{const session=setup(),source=deploy(session,0,fixture.protector,2),target=deploy(session,1,fixture.target,1);adapter.applyGraveProtectorReplacement(session,event(session,'deterministic',target,1));return session.duel.reserves['1'].deck.map(card=>card.uid);};
 assert.deepEqual(make(),make());
});

test('Owner rules and inventory remain intact after a complete replacement',()=>{
 const session=setup(),source=deploy(session,0,fixture.protector,2),target=deploy(session,1,fixture.target,1);
 const before=inventory(session.duel),result=adapter.applyGraveProtectorReplacement(session,event(session,'owner-rules',target,1));
 const rules=rulesFor(session.duel.core);
 assert.equal(rules.mainDeckMin,20);assert.equal(rules.mainDeckMax,30);assert.equal(rules.extraDeckMax,5);
 assert.equal(rules.monsterZones,3);assert.equal(rules.spellTrapZones,3);assert.equal(rules.handLimit,6);assert.equal(rules.handCheck,'end');
 assert.equal(result.status,'shuffled-to-owner-main-deck');assert.equal(source.faceUp,true);assertInventorySame(before,session.duel);
});
