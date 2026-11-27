const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel}=require('../dist/tagDuel');
const {enabledCardIds,engineCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {createPositionPolicyAdapter,assertPositionPolicyRules}=require('../dist/positionPolicyTagAdapter');
function unique(kind,count){
 const seen=new Set();
 return enabledCardIds.filter(id=>{const card=engineCard(id);if(!card||card.kind!==kind||card.fusion)return false;const name=card.englishName||card.name;if(seen.has(name))return false;seen.add(name);return true;}).slice(0,count);
}
const flipMonsterId=enabledCardIds.find(id=>getMonsterEffect(id)?.trigger==='flip');assert.ok(flipMonsterId);
const nonFlipMonsterId=enabledCardIds.find(id=>engineCard(id)?.kind==='monster'&&getMonsterEffect(id)?.trigger!=='flip');assert.ok(nonFlipMonsterId);
const monsterIds=[flipMonsterId,...unique('monster',16).filter(id=>id!==flipMonsterId).slice(0,15)],fieldId='22702055',spellIds=[fieldId,...unique('spell',4).filter(id=>id!==fieldId).slice(0,1)],trapIds=unique('trap',3);
assert.equal(monsterIds.length,16);assert.equal(spellIds.length,2);assert.equal(trapIds.length,3);assert.ok(enabledCardIds.includes(fieldId));
const deck=[...monsterIds,...spellIds,...trapIds];assert.equal(deck.length,20);
const fixture={final:trapIds[0],light:trapIds[1],royal:trapIds[2]};
function lookup(id){if(id===fixture.final)return {kind:'trap',effect:'final-attack-orders'};if(id===fixture.light)return {kind:'trap',effect:'light-of-intervention'};if(id===fixture.royal)return {kind:'trap',effect:'royal-command'};return undefined;}
function setup(seed='m655-position',first=0){const players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...deck]}));const adapter=createPositionPolicyAdapter(lookup);return {adapter,session:adapter.createSession(createTagDuel(players,{classic:true,first,seed}))};}
function holder(session,seat){const team=seat%2;return session.duel.active[team]===seat?session.duel.core.players[team]:session.duel.reserves[seat];}
function take(session,seat,id){const source=holder(session,seat);for(const zone of ['hand','deck','extra']){const list=source[zone]||[],index=list.findIndex(card=>card.id===id);if(index>=0)return list.splice(index,1)[0];}throw new Error('Fixture card not found: '+id);}
function putInHand(session,seat,id){const card=take(session,seat,id);holder(session,seat).hand.push(card);return card;}
function setTrap(session,effect,ownerSeat=0,setTurn=session.duel.core.turn-1){const id=effect==='final'?fixture.final:effect==='light'?fixture.light:fixture.royal,card=take(session,ownerSeat,id),placed={...card,setTurn,faceUp:false,resolved:false};session.duel.core.players[ownerSeat%2].backrow.push(placed);return placed;}
function deploy(session,team,id,seat=team,faceUp=true,position='atk'){const card=take(session,seat,id),monster={...card,position,faceUp,entered:session.duel.core.turn-1,changed:session.duel.core.turn-1,attacked:0,atkBoost:0,defBoost:0,owner:team};session.duel.core.players[team].monsters.push(monster);return monster;}
function activate(session,effect,actorSeat=0,ownerSeat=0,id=effect+'-activation'){const source=setTrap(session,effect,ownerSeat);session.adapter.prepareActivation(session,actorSeat,source.uid,id);return {source,result:session.adapter.resolveActivation(session,id)};}

test('baseline 2v2 preserves Deck 20–30, hand 6 at End Phase, 3+3 zones and Extra Deck 5',()=>{const {session}=setup();assertPositionPolicyRules(session.duel,lookup);assert.equal(session.duel.mode,'tag-classic');assert.equal(session.duel.core.players[0].hand.length,4);});
test('Final Attack Orders moves all face-up monsters to Attack and leaves face-down monsters untouched',()=>{
 const {adapter,session}=setup(),own=deploy(session,0,monsterIds[0],0,true,'def'),opponent=deploy(session,1,monsterIds[1],1,true,'def'),hidden=deploy(session,1,monsterIds[2],3,false,'def');
 const {source,result}=activate(session,'final',0,2,'fao-1');assert.equal(result.effect,'final-attack-orders');assert.equal(result.effectApplied,true);assert.equal(result.sourceActive,true);
 assert.deepEqual(new Set(result.changedPositions),new Set([own.uid,opponent.uid]));assert.equal(session.duel.core.players[0].monsters.find(m=>m.uid===own.uid).position,'atk');
 assert.equal(session.duel.core.players[1].monsters.find(m=>m.uid===opponent.uid).position,'atk');assert.equal(session.duel.core.players[1].monsters.find(m=>m.uid===hidden.uid).faceUp,false);
 assert.equal(adapter.canChangeBattlePosition(session,own.uid,'defense'),false);assert.equal(adapter.canChangeBattlePosition(session,hidden.uid,'flip'),true);assert.equal(source.uid.startsWith('m2:'),true);
});
test('Final Attack Orders blocks manual position changes but permits a face-down monster to Flip Summon',()=>{
 const {adapter,session}=setup(),own=deploy(session,0,monsterIds[0],0,true,'def'),hidden=deploy(session,0,monsterIds[1],0,false,'def');activate(session,'final');
 assert.throws(()=>adapter.changeMonsterPosition(session,0,own.uid,'defense'),/política contínua/);const flipped=adapter.changeMonsterPosition(session,0,hidden.uid,'flip');assert.equal(flipped.faceUp,true);assert.equal(flipped.position,'atk');
});
test('removing the last Final Attack Orders source releases the continuous position lock',()=>{
 const {adapter,session}=setup(),own=deploy(session,0,monsterIds[0],0,true,'atk'),{source}=activate(session,'final');
 assert.equal(adapter.canChangeBattlePosition(session,own.uid,'defense'),false);assert.equal(adapter.removeContinuousTrap(session,source.uid),true);
 assert.equal(adapter.canChangeBattlePosition(session,own.uid,'defense'),true);assert.equal(adapter.changeMonsterPosition(session,0,own.uid,'defense').position,'def');
});
test('Light of Intervention converts a Set into a face-up Defense Normal Summon',()=>{
 const {adapter,session}=setup();activate(session,'light');const card=putInHand(session,0,monsterIds[0]),result=adapter.resolveSetMonster(session,0,card.uid);
 assert.equal(result.mode,'normal-summon');assert.equal(result.faceUp,true);assert.equal(result.position,'def');assert.equal(session.duel.core.players[0].summoned,true);
 assert.equal(adapter.canSetMonsterFaceDown(session,result.uid),false);assert.throws(()=>adapter.changeMonsterPosition(session,0,result.uid,'set'),/política contínua/);
});
test('Light of Intervention leaves existing face-down monsters hidden but prevents future face-down changes',()=>{
 const {adapter,session}=setup(),hidden=deploy(session,0,monsterIds[0],0,false,'def');activate(session,'light');
 assert.equal(session.duel.core.players[0].monsters.find(m=>m.uid===hidden.uid).faceUp,false);assert.equal(adapter.canSetMonsterFaceDown(session,hidden.uid),false);
 assert.equal(adapter.changeMonsterPosition(session,0,hidden.uid,'flip').faceUp,true);
});
test('Final Attack Orders overrides the face-up Defense position required by Light of Intervention',()=>{
 const {adapter,session}=setup();activate(session,'light');const source=setTrap(session,'final',2);adapter.prepareActivation(session,0,source.uid,'both-1');adapter.resolveActivation(session,'both-1');
 const card=putInHand(session,0,monsterIds[0]),result=adapter.resolveSetMonster(session,0,card.uid);assert.equal(result.mode,'normal-summon');assert.equal(result.faceUp,true);assert.equal(result.position,'atk');
});
test('without Light of Intervention, Final Attack Orders does not prevent a face-down Set',()=>{
 const {adapter,session}=setup();activate(session,'final');const card=putInHand(session,0,monsterIds[0]),result=adapter.resolveSetMonster(session,0,card.uid);
 assert.equal(result.mode,'set');assert.equal(result.faceUp,false);assert.equal(result.position,'def');
});
test('activation negation sends the Continuous Trap to the shared Graveyard and applies no policy',()=>{
 const {adapter,session}=setup(),own=deploy(session,0,monsterIds[0],0,true,'def'),source=setTrap(session,'final');adapter.prepareActivation(session,0,source.uid,'negated-activation');
 const result=adapter.resolveActivation(session,'negated-activation','activation');assert.equal(result.activated,false);assert.equal(result.effectApplied,false);assert.equal(result.sourceActive,false);
 assert.ok(session.duel.core.players[0].grave.some(card=>card.uid===source.uid));assert.equal(session.duel.core.players[0].monsters.find(m=>m.uid===own.uid).position,'def');
});
test('effect negation leaves the Trap face-up but inactive and does not change monster positions',()=>{
 const {adapter,session}=setup(),own=deploy(session,0,monsterIds[0],0,true,'def'),source=setTrap(session,'final');adapter.prepareActivation(session,0,source.uid,'negated-effect');
 const result=adapter.resolveActivation(session,'negated-effect','effect');assert.equal(result.activated,true);assert.equal(result.effectApplied,false);assert.equal(result.sourceActive,false);
 assert.equal(session.duel.core.players[0].backrow.find(card=>card.uid===source.uid).faceUp,true);assert.equal(session.duel.core.players[0].monsters.find(m=>m.uid===own.uid).position,'def');
});
test('a Continuous Trap Set this turn cannot be activated',()=>{const {adapter,session}=setup(),source=setTrap(session,'final',0,session.duel.core.turn);assert.throws(()=>adapter.prepareActivation(session,0,source.uid,'same-turn'),/mesmo turno/);});
test('an activation whose source left the field before resolution does not apply',()=>{
 const {adapter,session}=setup(),own=deploy(session,0,monsterIds[0],0,true,'def'),source=setTrap(session,'final');adapter.prepareActivation(session,0,source.uid,'stale-source');
 adapter.removeContinuousTrap(session,source.uid);const result=adapter.resolveActivation(session,'stale-source');assert.equal(result.effectApplied,false);assert.equal(result.sourceActive,false);
 assert.equal(session.duel.core.players[0].monsters.find(m=>m.uid===own.uid).position,'def');
});
test('a face-up monster entering after activation is normalized by the continuous policy hook',()=>{
 const {adapter,session}=setup();activate(session,'final');const later=deploy(session,1,monsterIds[0],3,true,'def');const changed=adapter.applyContinuousPolicies(session);
 assert.ok(changed.includes(later.uid));assert.equal(session.duel.core.players[1].monsters.find(m=>m.uid===later.uid).position,'atk');
});
test('position policies never discard a hand above six before the End Phase',()=>{
 const {adapter,session}=setup();activate(session,'final');const player=session.duel.core.players[0];while(player.hand.length<7)player.hand.push(player.deck.pop());
 const before=player.hand.length;adapter.applyContinuousPolicies(session);assert.equal(session.duel.core.players[0].hand.length,before);
});
test('an active teammate can activate a partner-set Trap without changing physical ownership',()=>{
 const {adapter,session}=setup(),source=setTrap(session,'light',2),plan=adapter.prepareActivation(session,0,source.uid,'partner-trap');
 assert.equal(plan.sourceOwnerSeat,2);assert.equal(plan.actorSeat,0);assert.equal(adapter.resolveActivation(session,'partner-trap').sourceActive,true);
 assert.equal(session.duel.core.players[0].backrow.find(card=>card.uid===source.uid).faceUp,true);
});
test('activation IDs are idempotent and cannot be reused',()=>{
 const {adapter,session}=setup(),source=setTrap(session,'final');adapter.prepareActivation(session,0,source.uid,'idempotent-1');
 const first=adapter.resolveActivation(session,'idempotent-1'),second=adapter.resolveActivation(session,'idempotent-1');assert.deepEqual(second,first);
 assert.throws(()=>adapter.prepareActivation(session,0,source.uid,'idempotent-1'),/duplicada/);
});
test('Royal Command blocks Flip Effect activations on both teams but not non-Flip monsters',()=>{
 const {adapter,session}=setup(),flip=deploy(session,0,flipMonsterId,0,true,'atk'),normal=deploy(session,1,nonFlipMonsterId,1,true,'atk');
 activate(session,'royal');assert.equal(adapter.flipEffectAllowed(session,flip.uid),false);assert.equal(adapter.flipEffectNegated(session,flip.uid),true);assert.equal(adapter.flipEffectAllowed(session,normal.uid),true);assert.equal(adapter.flipEffectNegated(session,normal.uid),false);
});
test('removing Royal Command restores Flip Effect activation eligibility',()=>{
 const {adapter,session}=setup(),flip=deploy(session,0,flipMonsterId,0,true,'atk'),{source}=activate(session,'royal');
 assert.equal(adapter.flipEffectAllowed(session,flip.uid),false);assert.equal(adapter.removeContinuousTrap(session,source.uid),true);
 assert.equal(adapter.flipEffectAllowed(session,flip.uid),true);
});
test('Field Zone is independent from three Spell/Trap Zones',()=>{
 const {session}=setup(),fieldCard=take(session,0,fieldId);session.duel.core.players[0].field={...fieldCard,setTurn:0,faceUp:true};
 for(const id of [spellIds[1],trapIds[0],trapIds[1]]){const card=take(session,0,id);session.duel.core.players[0].backrow.push({...card,setTurn:0,faceUp:false});}
 assertPositionPolicyRules(session.duel,lookup);assert.equal(session.duel.core.players[0].backrow.length,3);assert.ok(session.duel.core.players[0].field);
});
