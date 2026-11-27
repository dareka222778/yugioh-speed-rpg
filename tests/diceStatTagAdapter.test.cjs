const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel}=require('../dist/tagDuel');
const {enabledCardIds,engineCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');
const {continuousModifier}=require('../dist/continuousEffects');
const {createDiceStatAdapter,assertDiceStatRules}=require('../dist/diceStatTagAdapter');

function unique(kind,count){
 const seen=new Set();
 return enabledCardIds.filter(id=>{
  const card=engineCard(id);if(!card||card.kind!==kind||card.fusion)return false;
  const name=card.englishName||card.name;if(seen.has(name))return false;seen.add(name);return true;
 }).slice(0,count);
}
const monsterIds=unique('monster',8),spellIds=unique('spell',6),trapPool=unique('trap',12),counterTrapId='03819470';
assert.ok(enabledCardIds.includes(counterTrapId),'Seven Tools of the Bandit must be certified for the timing fixture');
const trapIds=[counterTrapId,...trapPool.filter(id=>id!==counterTrapId).slice(0,5)];
assert.equal(monsterIds.length,8);assert.equal(spellIds.length,6);assert.equal(trapIds.length,6);
const fixture={maximumSix:monsterIds[0],gracefulDice:spellIds[0],skullDice:trapIds[1]};
const deck=[...monsterIds,...spellIds,...trapIds];assert.equal(deck.length,20);
function lookup(id){
 if(id===fixture.maximumSix)return {kind:'monster',effect:'maximum-six'};
 if(id===fixture.gracefulDice)return {kind:'spell',effect:'graceful-dice'};
 if(id===fixture.skullDice)return {kind:'trap',effect:'skull-dice'};
 return undefined;
}
function setup(seed='m653-dice',first=0){
 const players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...deck]}));
 const duel=createTagDuel(players,{classic:true,first,seed});
 const adapter=createDiceStatAdapter(lookup);
 return {adapter,session:adapter.createSession(duel)};
}
function take(holder,id){
 for(const zone of ['hand','deck','extra']){
  const list=holder[zone]||[],index=list.findIndex(card=>card.id===id);
  if(index>=0)return list.splice(index,1)[0];
 }
 throw new Error('Fixture card not found: '+id);
}
function putInHand(session,team,id,seat=team){
 const holder=seat===session.duel.active[team]?session.duel.core.players[team]:session.duel.reserves[seat];
 const card=take(holder,id);holder.hand.push(card);return card;
}
function setCard(session,team,id,seat=team,setTurn=session.duel.core.turn-1,faceUp=false){
 const holder=seat===session.duel.active[team]?session.duel.core.players[team]:session.duel.reserves[seat];
 const card=take(holder,id),placed={...card,setTurn,faceUp};
 session.duel.core.players[team].backrow.push(placed);return placed;
}
function deploy(session,team,id,seat=team,faceUp=true){
 const holder=seat===session.duel.active[team]?session.duel.core.players[team]:session.duel.reserves[seat];
 const card=take(holder,id),monster={...card,position:'atk',faceUp,entered:session.duel.core.turn,changed:session.duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:team};
 session.duel.core.players[team].monsters.push(monster);return monster;
}
function makeResponse(session,attackerTeam=1,stage='damage'){
 const attacker=deploy(session,attackerTeam,monsterIds[1],session.duel.active[attackerTeam],true);
 session.duel.core.phase='response';session.duel.core.resume='battle';session.duel.core.damageStep=true;
 session.duel.core.pending={kind:'attack',actor:attackerTeam,card:attacker.uid,stage};
 session.duel.core.priority=1-attackerTeam;return attacker;
}
function maximumSixEvent(session,monster){
 session.duel.core.phase='response';session.duel.core.resume='main';session.duel.core.priority=0;
 session.duel.core.pending={kind:'summon',actor:0,card:monster.uid,id:monster.id};
 return {eventId:'tribute-event-1',sourceUid:monster.uid,sourceId:monster.id,controllerSeat:0,turn:session.duel.core.turn,summonType:'tribute',summonedSuccessfully:true};
}

test('baseline 2v2 preserves 20-card decks and the owner rules profile',()=>{
 const {session}=setup();assertDiceStatRules(session.duel);
 assert.equal(session.duel.mode,'tag-classic');assert.equal(session.duel.core.players[0].hand.length,4);assert.equal(session.duel.core.players[1].hand.length,4);
});

test('Graceful Dice rolls once and buffs every face-up monster of its team, including its inactive partner',()=>{
 const {adapter,session}=setup('graceful-all');
 const source=putInHand(session,0,fixture.gracefulDice,0),own=deploy(session,0,monsterIds[1],0,true);
 const partner=deploy(session,0,monsterIds[2],2,true),hidden=deploy(session,0,monsterIds[3],0,false),opponent=deploy(session,1,monsterIds[4],1,true);
 const plan=adapter.prepareActivation(session,0,source.uid,'graceful-1');assert.equal(plan.effect,'graceful-dice');
 const result=adapter.resolveActivation(session,'graceful-1');assert.ok(result.roll>=1&&result.roll<=6);
 const delta=result.roll*100;
 assert.deepEqual(new Set(result.affectedUids),new Set([own.uid,partner.uid]));
 assert.equal(continuousModifier(session.duel.core,own,'atk'),delta);assert.equal(continuousModifier(session.duel.core,own,'def'),delta);
 assert.equal(continuousModifier(session.duel.core,partner,'atk'),delta);assert.equal(continuousModifier(session.duel.core,hidden,'atk'),0);
 assert.equal(continuousModifier(session.duel.core,opponent,'atk'),0);assert.ok(session.duel.core.players[0].grave.some(card=>card.uid===source.uid));
});

test('Skull Dice affects only face-up monsters on the opposing team',()=>{
 const {adapter,session}=setup('skull-faceup'),source=setCard(session,0,fixture.skullDice,0);
 const own=deploy(session,0,monsterIds[1],0,true),opposing=deploy(session,1,monsterIds[2],1,true),hidden=deploy(session,1,monsterIds[3],1,false);
 adapter.prepareActivation(session,0,source.uid,'skull-faceup-1');
 const result=adapter.resolveActivation(session,'skull-faceup-1'),delta=result.roll*100;
 assert.equal(continuousModifier(session.duel.core,own,'atk'),0);assert.equal(continuousModifier(session.duel.core,opposing,'atk'),-delta);
 assert.equal(continuousModifier(session.duel.core,opposing,'def'),-delta);assert.equal(continuousModifier(session.duel.core,hidden,'atk'),0);
});

test('Skull Dice set by the inactive partner is usable by the active seat and preserves physical UID',()=>{
 const {adapter,session}=setup('skull-owner'),source=setCard(session,0,fixture.skullDice,2);
 const own=deploy(session,0,monsterIds[1],0,true),opposing=deploy(session,1,monsterIds[2],1,true),partner=deploy(session,1,monsterIds[3],3,true);
 adapter.prepareActivation(session,0,source.uid,'skull-1');
 const result=adapter.resolveActivation(session,'skull-1');assert.ok(result.roll>=1&&result.roll<=6);
 const delta=result.roll*100;assert.equal(continuousModifier(session.duel.core,own,'atk'),0);
 assert.equal(continuousModifier(session.duel.core,opposing,'atk'),-delta);assert.equal(continuousModifier(session.duel.core,opposing,'def'),-delta);
 assert.equal(continuousModifier(session.duel.core,partner,'atk'),-delta);assert.ok(session.duel.core.players[0].grave.some(card=>card.uid===source.uid));
});

test('Graceful Dice from hand cannot use the inactive partner private hand',()=>{
 const {adapter,session}=setup('private-hand'),source=putInHand(session,0,fixture.gracefulDice,2);
 assert.throws(()=>adapter.prepareActivation(session,0,source.uid,'private-hand-1'),/mão privada/);
});

test('Graceful Dice from hand cannot activate during the opposing turn',()=>{
 const {adapter,session}=setup('opponent-hand',1),source=putInHand(session,0,fixture.gracefulDice,0);
 makeResponse(session,1,'damage');
 assert.throws(()=>adapter.prepareActivation(session,session.duel.active[0],source.uid,'opponent-hand-1'),/mão privada/);
});

test('a Quick-Play Spell Set this turn cannot activate',()=>{
 const {adapter,session}=setup('same-turn-set'),source=setCard(session,0,fixture.gracefulDice,0,session.duel.core.turn,false);
 assert.throws(()=>adapter.prepareActivation(session,0,source.uid,'same-turn-1'),/turno anterior/);
});

test('a Normal Trap cannot activate from the hand',()=>{
 const {adapter,session}=setup('trap-hand'),source=putInHand(session,0,fixture.skullDice,0);
 assert.throws(()=>adapter.prepareActivation(session,0,source.uid,'trap-hand-1'),/mão privada/);
});

test('a Normal Trap Set this turn cannot activate',()=>{
 const {adapter,session}=setup('trap-same-turn'),source=setCard(session,0,fixture.skullDice,0,session.duel.core.turn,false);
 assert.throws(()=>adapter.prepareActivation(session,0,source.uid,'trap-same-turn-1'),/turno anterior/);
});

test('negated dice activation sends its source to the Graveyard without rolling',()=>{
 const {adapter,session}=setup('negated-dice'),source=setCard(session,0,fixture.skullDice,0),counterBefore=session.duel.core.random.counter;
 adapter.prepareActivation(session,0,source.uid,'negated-1');
 const result=adapter.resolveActivation(session,'negated-1',true);
 assert.equal(result.negated,true);assert.equal(result.roll,null);assert.equal(result.statDelta,0);assert.equal(session.duel.core.random.counter,counterBefore);
 assert.ok(session.duel.core.players[0].grave.some(card=>card.uid===source.uid));
});

test('a resolved activation is idempotent and does not consume another HMAC roll',()=>{
 const {adapter,session}=setup('idempotent-dice'),source=putInHand(session,0,fixture.gracefulDice,0);
 adapter.prepareActivation(session,0,source.uid,'idempotent-1');
 const first=adapter.resolveActivation(session,'idempotent-1'),counter=session.duel.core.random.counter;
 const second=adapter.resolveActivation(session,'idempotent-1');
 assert.deepEqual(second,first);assert.equal(session.duel.core.random.counter,counter);
});

test('same seed and same duel actions produce the same die result',()=>{
 const a=setup('same-seed'),b=setup('same-seed'),sourceA=putInHand(a.session,0,fixture.gracefulDice,0),sourceB=putInHand(b.session,0,fixture.gracefulDice,0);
 a.adapter.prepareActivation(a.session,0,sourceA.uid,'same-seed-1');b.adapter.prepareActivation(b.session,0,sourceB.uid,'same-seed-1');
 assert.equal(a.adapter.resolveActivation(a.session,'same-seed-1').roll,b.adapter.resolveActivation(b.session,'same-seed-1').roll);
});

test('Graceful Dice applies to monsters present at resolution, not only activation',()=>{
 const {adapter,session}=setup('resolution-snapshot'),source=putInHand(session,0,fixture.gracefulDice,0);
 adapter.prepareActivation(session,0,source.uid,'resolution-1');
 const late=deploy(session,0,monsterIds[1],2,true),result=adapter.resolveActivation(session,'resolution-1');
 assert.ok(result.affectedUids.includes(late.uid));assert.equal(continuousModifier(session.duel.core,late,'atk'),result.roll*100);
});

test('temporary dice modifiers expire at the end of the current turn',()=>{
 const {adapter,session}=setup('end-turn'),source=putInHand(session,0,fixture.gracefulDice,0),monster=deploy(session,0,monsterIds[1],0,true);
 adapter.prepareActivation(session,0,source.uid,'end-turn-1');
 const result=adapter.resolveActivation(session,'end-turn-1');assert.equal(continuousModifier(session.duel.core,monster,'atk'),result.roll*100);
 session.duel.core.turn++;adapter.reconcile(session);assert.equal(continuousModifier(session.duel.core,monster,'atk'),0);
});

test('Skull Dice may respond in the Damage Step before Damage Calculation',()=>{
 const {adapter,session}=setup('damage-before',1),source=setCard(session,0,fixture.skullDice,0);
 makeResponse(session,1,'damage');adapter.prepareActivation(session,session.duel.active[0],source.uid,'damage-before-1');
 assert.equal(adapter.resolveActivation(session,'damage-before-1').effect,'skull-dice');
});

test('dice stat effects cannot activate during Damage Calculation',()=>{
 const {adapter,session}=setup('damage-calculation',1),source=setCard(session,0,fixture.skullDice,0);
 makeResponse(session,1,'calculation');
 assert.throws(()=>adapter.prepareActivation(session,session.duel.active[0],source.uid,'damage-calc-1'),/Etapa de Dano/);
});

test('a Spell Speed 2 effect cannot respond to a Counter Trap',()=>{
 const {adapter,session}=setup('counter-trap',1),source=setCard(session,0,fixture.skullDice,0);
 const opponentSpell=setCard(session,1,spellIds[1],1,session.duel.core.turn-1,true),counter=setCard(session,1,counterTrapId,1,session.duel.core.turn-1,true);
 session.duel.core.phase='response';session.duel.core.priority=0;session.duel.core.damageStep=false;
 session.duel.core.pending={kind:'spell',actor:1,card:opponentSpell.uid,id:opponentSpell.id};
 session.duel.core.chain=[{actor:1,card:counter.uid,id:counter.id,target:opponentSpell.uid}];
 assert.equal(getActivationModel(getEffect(counterTrapId)).speed,3);
 assert.throws(()=>adapter.prepareActivation(session,session.duel.active[0],source.uid,'counter-trap-1'),/Velocidade 3/);
});

test('a set card destroyed before resolution still resolves its non-continuous dice effect',()=>{
 const {adapter,session}=setup('destroyed-source'),source=setCard(session,0,fixture.skullDice,0),target=deploy(session,1,monsterIds[1],1,true);
 adapter.prepareActivation(session,0,source.uid,'destroyed-source-1');
 session.duel.core.players[0].backrow=session.duel.core.players[0].backrow.filter(card=>card.uid!==source.uid);
 session.duel.core.players[0].grave.push({uid:source.uid,id:source.id});
 const result=adapter.resolveActivation(session,'destroyed-source-1');
 assert.ok(result.roll>=1&&result.roll<=6);assert.equal(continuousModifier(session.duel.core,target,'atk'),-result.roll*100);
});

test('Maximum Six requires a successful Tribute Summon event from the active physical seat',()=>{
 const {adapter,session}=setup('maximum-six'),monster=deploy(session,0,fixture.maximumSix,0,true),event=maximumSixEvent(session,monster);
 const plan=adapter.prepareMaximumSixTrigger(session,event,'maximum-six-1');assert.equal(plan.kind,'maximum-six');
 const result=adapter.resolveMaximumSixTrigger(session,'maximum-six-1');
 assert.ok(result.roll>=1&&result.roll<=6);assert.equal(result.bonus,result.roll*200);
 assert.equal(continuousModifier(session.duel.core,monster,'atk'),result.bonus);assert.equal(continuousModifier(session.duel.core,monster,'def'),0);
});

test('Maximum Six does not trigger after a Special Summon or an unsuccessful Tribute Summon',()=>{
 const {adapter,session}=setup('maximum-six-kind'),monster=deploy(session,0,fixture.maximumSix,0,true),event=maximumSixEvent(session,monster);
 assert.throws(()=>adapter.prepareMaximumSixTrigger(session,{...event,summonType:'special'},'maximum-six-special'),/Invocação-Tributo/);
 assert.throws(()=>adapter.prepareMaximumSixTrigger(session,{...event,summonedSuccessfully:false},'maximum-six-failed'),/Invocação-Tributo/);
});

test('Maximum Six is not triggered while face-down',()=>{
 const {adapter,session}=setup('maximum-six-facedown'),monster=deploy(session,0,fixture.maximumSix,0,false),event=maximumSixEvent(session,monster);
 assert.throws(()=>adapter.prepareMaximumSixTrigger(session,event,'maximum-six-down'),/face-up/);
});

test('negating Maximum Six prevents the roll and the ATK increase',()=>{
 const {adapter,session}=setup('maximum-six-negated'),monster=deploy(session,0,fixture.maximumSix,0,true),event=maximumSixEvent(session,monster);
 adapter.prepareMaximumSixTrigger(session,event,'maximum-six-negated-1');
 const counterBefore=session.duel.core.random.counter,result=adapter.resolveMaximumSixTrigger(session,'maximum-six-negated-1',true);
 assert.equal(result.negated,true);assert.equal(result.roll,null);assert.equal(result.bonus,0);assert.equal(session.duel.core.random.counter,counterBefore);
 assert.equal(continuousModifier(session.duel.core,monster,'atk'),0);
});

test('Maximum Six modifier is removed when it turns face-down and does not return on a later flip',()=>{
 const {adapter,session}=setup('maximum-six-faceup'),monster=deploy(session,0,fixture.maximumSix,0,true),event=maximumSixEvent(session,monster);
 adapter.prepareMaximumSixTrigger(session,event,'maximum-six-faceup-1');
 const result=adapter.resolveMaximumSixTrigger(session,'maximum-six-faceup-1');
 let live=session.duel.core.players[0].monsters.find(card=>card.uid===monster.uid);
 assert.equal(continuousModifier(session.duel.core,live,'atk'),result.bonus);
 live.faceUp=false;adapter.reconcile(session);live=session.duel.core.players[0].monsters.find(card=>card.uid===monster.uid);
 assert.equal(continuousModifier(session.duel.core,live,'atk'),0);
 live.faceUp=true;adapter.reconcile(session);live=session.duel.core.players[0].monsters.find(card=>card.uid===monster.uid);
 assert.equal(continuousModifier(session.duel.core,live,'atk'),0);
});

test('Maximum Six effect does not follow the card after it leaves and re-enters the field',()=>{
 const {adapter,session}=setup('maximum-six-epoch'),monster=deploy(session,0,fixture.maximumSix,0,true),event=maximumSixEvent(session,monster);
 adapter.prepareMaximumSixTrigger(session,event,'maximum-six-epoch-1');
 session.duel.core.players[0].monsters=session.duel.core.players[0].monsters.filter(card=>card.uid!==monster.uid);
 session.duel.core.players[0].grave.push({uid:monster.uid,id:monster.id});adapter.reconcile(session);
 session.duel.core.players[0].grave=session.duel.core.players[0].grave.filter(card=>card.uid!==monster.uid);
 session.duel.core.players[0].monsters.push({...monster,entered:session.duel.core.turn+1});adapter.reconcile(session);
 const result=adapter.resolveMaximumSixTrigger(session,'maximum-six-epoch-1');
 assert.ok(result.roll>=1&&result.roll<=6);assert.equal(result.sourceStillFaceUp,false);
 assert.equal(continuousModifier(session.duel.core,session.duel.core.players[0].monsters[0],'atk'),0);
});

test('duplicate Maximum Six resolution returns the same result without another roll',()=>{
 const {adapter,session}=setup('maximum-six-idempotent'),monster=deploy(session,0,fixture.maximumSix,0,true),event=maximumSixEvent(session,monster);
 adapter.prepareMaximumSixTrigger(session,event,'maximum-six-idempotent-1');
 const first=adapter.resolveMaximumSixTrigger(session,'maximum-six-idempotent-1'),counter=session.duel.core.random.counter;
 const second=adapter.resolveMaximumSixTrigger(session,'maximum-six-idempotent-1');
 assert.deepEqual(second,first);assert.equal(session.duel.core.random.counter,counter);
});

test('a seven-card hand remains intact until End Phase; the adapter never auto-discards',()=>{
 const {adapter,session}=setup('hand-limit-end'),source=setCard(session,0,fixture.skullDice,0);
 while(session.duel.core.players[0].hand.length<7)session.duel.core.players[0].hand.push(session.duel.core.players[0].deck.shift());
 const before=session.duel.core.players[0].hand.map(card=>card.uid).sort();
 adapter.prepareActivation(session,0,source.uid,'hand-limit-end-1');adapter.resolveActivation(session,'hand-limit-end-1');
 assert.deepEqual(session.duel.core.players[0].hand.map(card=>card.uid).sort(),before);assert.equal(session.duel.core.players[0].hand.length,7);
});

test('three Spell/Trap Zones plus the independent Field Zone remain legal',()=>{
 const {session}=setup('field-zone'),team=session.duel.core.players[0];
 for(const id of [spellIds[0],spellIds[1],trapIds[1]])setCard(session,0,id,0,0,false);
 const field=take(team,spellIds[2]);team.field={...field,setTurn:0,faceUp:true};
 assertDiceStatRules(session.duel);assert.equal(team.backrow.length,3);assert.ok(team.field);
});

test('a fourth Monster Zone is rejected without changing inventory',()=>{
 const {session}=setup('four-monsters');
 for(let i=0;i<4;i++)deploy(session,0,monsterIds[i],0,true);
 assert.throws(()=>assertDiceStatRules(session.duel),/limite de zonas/);
});

test('a fourth Spell/Trap Zone is rejected',()=>{
 const {session}=setup('four-backrow');
 for(let i=0;i<4;i++)setCard(session,0,i<2?spellIds[i]:trapIds[i-1],0,0,false);
 assert.throws(()=>assertDiceStatRules(session.duel),/limite de zonas/);
});

test('deck construction still enforces 20–30 Main Deck and Extra Deck 5',()=>{
 const base=deck.slice(0,20),players=[0,1,2,3].map(i=>({id:'deck'+i,name:'Deck'+i,cards:[...base]}));
 assert.throws(()=>createTagDuel(players.map(p=>({...p,cards:p.cards.slice(1)})),{classic:true,seed:'deck-19'}),/20 a 30/);
 const fusionIds=enabledCardIds.filter(id=>!!engineCard(id)?.fusion).slice(0,6);assert.ok(fusionIds.length>=6);
 const withSix=players.map((p,i)=>({...p,extra:i===0?fusionIds:[]}));
 assert.throws(()=>createTagDuel(withSix,{classic:true,seed:'extra-6'}),/máximo de 5/);
});

test('the three real passcodes remain absent from the frozen certification and release sets',()=>{
 const cert=require('../dist/cardCertifications').cardCertifications,released=require('../dist/releasedCardIds').releasedCardIds;
 for(const id of ['30707994','74137509','00126218']){assert.equal(Object.hasOwn(cert,id),false);assert.equal(released.has(id),false);}
});
