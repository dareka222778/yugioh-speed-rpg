'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createTagDuel,tagInventory,tagDecisionMember}=require('../dist/tagDuel');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
 RAGING_FLAME_SPRITE_ID,RAGING_FLAME_SPRITE_KONAMI_CID,
 createExactRagingFlameSpriteLookups,createRagingFlameSpriteLedger,
 assertRagingFlameSpriteRules,canRagingFlameSpriteAttackDirectly,
 bindRagingFlameSpriteDirectAttack,applyRagingFlameSpriteDirectDamage
}=require('../dist/ragingFlameSpriteTagAdapter');

const enabled=getEnabledCardIds();
const normalMonsters=enabled.filter(id=>{
 const card=getDuelCard(id);
 return card?.kind==='monster'&&card.monsterType==='normal'&&!card.fusion;
});
const effectMonsters=enabled.filter(id=>{
 const card=getDuelCard(id);
 return card?.kind==='monster'&&card.monsterType!=='normal'&&!card.fusion;
});
const traps=enabled.filter(id=>getDuelCard(id)?.kind==='trap');
const spells=enabled.filter(id=>getDuelCard(id)?.kind==='spell'&&!getDuelCard(id)?.field);
const fieldSpells=enabled.filter(id=>getDuelCard(id)?.kind==='spell'&&getDuelCard(id)?.field);
assert.ok(normalMonsters.length>=12,'A suíte exige doze Monstros Normais habilitados.');
assert.ok(effectMonsters.length>=2,'A suíte exige dois monstros de efeito habilitados.');
assert.ok(traps.length>=4&&spells.length>=3,'A suíte exige cartas de Magia e Armadilha habilitadas.');
const spritePlaceholder=effectMonsters[0];
const opponentPlaceholder=effectMonsters[1];
const deck=[...normalMonsters.slice(0,12),...traps.slice(0,4),...spells.slice(0,3),spritePlaceholder];
assert.equal(deck.length,20);
const lookups={ragingFlameSprite:id=>id===spritePlaceholder};

function base(first=0){
 const players=[
  {id:'p0',name:'Azul A',cards:[...deck],extra:[]},
  {id:'p1',name:'Vermelho A',cards:[...deck],extra:[]},
  {id:'p2',name:'Azul B',cards:[...deck],extra:[]},
  {id:'p3',name:'Vermelho B',cards:[...deck],extra:[]}
 ];
 return createTagDuel(players,{seed:'m696-raging-flame-sprite',first,classic:true});
}
function holder(duel,seat){
 const team=seat%2,held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[seat];
 if(!held)throw new Error('Assento físico indisponível: '+seat);
 return held;
}
function take(duel,seat,id){
 const held=holder(duel,seat);
 for(const pool of [held.hand,held.deck,held.extra??[]]){
  const index=pool.findIndex(card=>card.id===id);
  if(index>=0)return pool.splice(index,1)[0];
 }
 throw new Error('Carta física indisponível: '+seat+'/'+id);
}
function addSprite(duel,ownerSeat=0,controllerTeam=ownerSeat%2,{faceUp=true,position='atk'}={}){
 const card=take(duel,ownerSeat,spritePlaceholder);
 const monster={...card,position,faceUp,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:ownerSeat%2};
 duel.core.players[controllerTeam].monsters.push(monster);
 synchronizeCardLifetimes(duel.core);
 return monster;
}
function addOpponentMonster(duel,ownerSeat=1,controllerTeam=1){
 const card=take(duel,ownerSeat,opponentPlaceholder);
 const monster={...card,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:ownerSeat%2};
 duel.core.players[controllerTeam].monsters.push(monster);
 synchronizeCardLifetimes(duel.core);
 return monster;
}
function eventFor(duel,source,{eventId='damage-1',sequence=1,directAttack=true,targetUid=null,battleDamage=500,negatedSourceUids,sourceBinding}={}){
 const binding=sourceBinding??bindRagingFlameSpriteDirectAttack(duel,source.uid,lookups);
 assert.ok(binding,'A instância face-up deve ter binding físico de Monster Zone.');
 const team=duel.cursor%2,opponent=1-team;
 const before=duel.core.players[opponent].lp,after=before-battleDamage;
 if(directAttack&&targetUid===null)duel.core.players[opponent].lp=after;
 return {
  kind:'raging-flame-sprite-direct-damage',eventId,sequence,turn:duel.core.turn,actorSeat:duel.cursor,
  sourceUid:source.uid,sourceBinding:binding,directAttack,targetUid,battleDamage,
  opponentLpBefore:before,opponentLpAfter:directAttack&&targetUid===null?after:before,
  ...(negatedSourceUids?{negatedSourceUids}:{})
 };
}
function inventory(duel){
 return tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]).sort();
}
function assertInventoryConserved(before,after){
 assert.deepEqual(inventory(after),before,'O efeito não cria, remove, duplica nem transforma cartas físicas.');
}
function removeSpriteToGrave(duel,source){
 const team=duel.core.players.findIndex(player=>player.monsters.some(card=>card.uid===source.uid));
 assert.ok(team>=0);
 duel.core.players[team].monsters=duel.core.players[team].monsters.filter(card=>card.uid!==source.uid);
 duel.core.players[team].grave.push({uid:source.uid,id:source.id});
 synchronizeCardLifetimes(duel.core);
}
function returnSpriteToField(duel,team,uid){
 const grave=duel.core.players[team].grave;
 const index=grave.findIndex(card=>card.uid===uid);
 assert.ok(index>=0);
 const card=grave.splice(index,1)[0];
 const monster={...card,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:team};
 duel.core.players[team].monsters.push(monster);
 synchronizeCardLifetimes(duel.core);
 return monster;
}

test('candidate identity is exact, officially sourced, and not admitted by the current engine',()=>{
 assert.equal(RAGING_FLAME_SPRITE_ID,'90810762');
 assert.equal(RAGING_FLAME_SPRITE_KONAMI_CID,6189);
 assert.equal(getDuelCard(RAGING_FLAME_SPRITE_ID),undefined);
 assert.equal(enabled.includes(RAGING_FLAME_SPRITE_ID),false);
 assert.equal(lookups.ragingFlameSprite(RAGING_FLAME_SPRITE_ID),false);
 assert.equal(lookups.ragingFlameSprite(spritePlaceholder),true);
});

test('owner rules remain Deck 20–30, hand 6 at End Phase, zones 3+3 and Extra 5',()=>{
 const duel=base();
 assert.equal(assertRagingFlameSpriteRules(duel),undefined);
 const held=holder(duel,0);
 for(let i=0;i<7;i++)held.hand.push(held.deck.pop());
 assert.equal(held.hand.length,11,'A mão pode exceder seis antes da End Phase; o descarte não ocorre durante o turno.');
 assert.equal(assertRagingFlameSpriteRules(duel),undefined);
});

test('direct attack remains available even while the opponent controls monsters',()=>{
 const duel=base(),sprite=addSprite(duel,0,0);
 addOpponentMonster(duel,1,1);
 assert.equal(canRagingFlameSpriteAttackDirectly(duel,sprite.uid,lookups),true);
});

test('face-down or Defense Position Raging Flame Sprite cannot use its direct-attack effect',()=>{
 const faceDown=base(),hidden=addSprite(faceDown,0,0,{faceUp:false});
 assert.equal(canRagingFlameSpriteAttackDirectly(faceDown,hidden.uid,lookups),false);
 const defense=base(),defender=addSprite(defense,0,0,{position:'def'});
 assert.equal(canRagingFlameSpriteAttackDirectly(defense,defender.uid,lookups),false);
});

test('successful direct battle damage adds exactly 1000 ATK without applying LP damage twice',()=>{
 const duel=base(),sprite=addSprite(duel,0,0),before=inventory(duel);
 const event=eventFor(duel,sprite,{battleDamage:500});
 const lpAfterDamage=duel.core.players[1].lp;
 const result=applyRagingFlameSpriteDirectDamage(duel,createRagingFlameSpriteLedger(),event,lookups);
 const boosted=result.state.core.players[0].monsters.find(card=>card.uid===sprite.uid);
 assert.equal(result.status,'applied');
 assert.equal(result.atkBoostBefore,0);assert.equal(result.atkBoostAfter,1000);
 assert.equal(boosted.atkBoost,1000);
 assert.equal(result.state.core.players[1].lp,lpAfterDamage,'O adapter não reaplica dano de batalha.');
 assertInventoryConserved(before,result.state);
});

test('the continuous ATK gain stacks on every successful direct attack, including the same turn',()=>{
 let duel=base(),sprite=addSprite(duel,0,0),ledger=createRagingFlameSpriteLedger();
 const first=applyRagingFlameSpriteDirectDamage(duel,ledger,eventFor(duel,sprite,{eventId:'damage-1',sequence:1,battleDamage:100}),lookups);
 duel=first.state;ledger=first.ledger;sprite=duel.core.players[0].monsters.find(card=>card.uid===sprite.uid);
 const second=applyRagingFlameSpriteDirectDamage(duel,ledger,eventFor(duel,sprite,{eventId:'damage-2',sequence:2,battleDamage:200}),lookups);
 assert.equal(second.status,'applied');
 assert.equal(second.atkBoostBefore,1000);assert.equal(second.atkBoostAfter,2000);
 assert.equal(second.state.core.players[0].monsters.find(card=>card.uid===sprite.uid).atkBoost,2000);
});

test('zero battle damage does not grant ATK',()=>{
 const duel=base(),sprite=addSprite(duel,0,0);
 const result=applyRagingFlameSpriteDirectDamage(duel,createRagingFlameSpriteLedger(),eventFor(duel,sprite,{battleDamage:0}),lookups);
 assert.equal(result.status,'no-trigger');
 assert.equal(result.state.core.players[0].monsters.find(card=>card.uid===sprite.uid).atkBoost,0);
});

test('damage against a monster is not treated as direct battle damage',()=>{
 const duel=base(),sprite=addSprite(duel,0,0);
 const event=eventFor(duel,sprite,{directAttack:false,targetUid:'m1:opponent-monster',battleDamage:0});
 const result=applyRagingFlameSpriteDirectDamage(duel,createRagingFlameSpriteLedger(),event,lookups);
 assert.equal(result.status,'no-trigger');
 assert.equal(result.state.core.players[0].monsters.find(card=>card.uid===sprite.uid).atkBoost,0);
});

test('an event claiming a direct attack while naming a monster target is rejected',()=>{
 const duel=base(),sprite=addSprite(duel,0,0);
 const event=eventFor(duel,sprite,{targetUid:'m1:opponent-monster'});
 assert.throws(()=>applyRagingFlameSpriteDirectDamage(duel,createRagingFlameSpriteLedger(),event,lookups),/evento Raging Flame Sprite inválido/i);
});

test('a source that left the field before the damage hook cannot gain ATK',()=>{
 const duel=base(),sprite=addSprite(duel,0,0),binding=bindRagingFlameSpriteDirectAttack(duel,sprite.uid,lookups);
 removeSpriteToGrave(duel,sprite);
 const event={...eventFor(duel,sprite,{sourceBinding:binding}),sourceUid:sprite.uid};
 const result=applyRagingFlameSpriteDirectDamage(duel,createRagingFlameSpriteLedger(),event,lookups);
 assert.equal(result.status,'no-trigger');
 assert.equal(result.state.core.players[0].monsters.length,0);
});

test('a stale physical binding cannot affect a same-UID monster after it leaves and re-enters',()=>{
 const duel=base(),sprite=addSprite(duel,0,0),oldBinding=bindRagingFlameSpriteDirectAttack(duel,sprite.uid,lookups);
 removeSpriteToGrave(duel,sprite);
 const returned=returnSpriteToField(duel,0,sprite.uid);
 const event=eventFor(duel,returned,{sourceBinding:oldBinding});
 const result=applyRagingFlameSpriteDirectDamage(duel,createRagingFlameSpriteLedger(),event,lookups);
 assert.equal(result.status,'no-trigger');
 assert.equal(result.state.core.players[0].monsters.find(card=>card.uid===sprite.uid).atkBoost,0);
});

test('a negated source does not receive the continuous ATK gain',()=>{
 const duel=base(),sprite=addSprite(duel,0,0);
 const event=eventFor(duel,sprite,{negatedSourceUids:[sprite.uid]});
 const result=applyRagingFlameSpriteDirectDamage(duel,createRagingFlameSpriteLedger(),event,lookups);
 assert.equal(result.status,'effect-negated');
 assert.equal(result.state.core.players[0].monsters.find(card=>card.uid===sprite.uid).atkBoost,0);
});

test('the physical owner and current controller are independent in shared Tag Duel zones',()=>{
 const duel=base(),sprite=addSprite(duel,1,0);
 const event=eventFor(duel,sprite,{battleDamage:300});
 const result=applyRagingFlameSpriteDirectDamage(duel,createRagingFlameSpriteLedger(),event,lookups);
 assert.equal(result.status,'applied');
 assert.equal(result.state.core.players[0].monsters.find(card=>card.uid===sprite.uid).atkBoost,1000);
 assert.ok(sprite.uid.startsWith('m1:'),'O UID continua pertencendo ao assento físico original.');
});

test('a monster controlled by the opposing team cannot receive this team’s direct-attack event',()=>{
 const duel=base(),sprite=addSprite(duel,1,1);
 const event=eventFor(duel,sprite,{battleDamage:200});
 const result=applyRagingFlameSpriteDirectDamage(duel,createRagingFlameSpriteLedger(),event,lookups);
 assert.equal(result.status,'no-trigger');
 assert.equal(result.state.core.players[1].monsters.find(card=>card.uid===sprite.uid).atkBoost,0);
});

test('LP delta must match the already-applied direct battle damage',()=>{
 const duel=base(),sprite=addSprite(duel,0,0),event=eventFor(duel,sprite,{battleDamage:500});
 const invalid={...event,opponentLpAfter:event.opponentLpAfter+1};
 assert.throws(()=>applyRagingFlameSpriteDirectDamage(duel,createRagingFlameSpriteLedger(),invalid,lookups),/Delta de LP/i);
});

test('event seat and turn must match the active physical participant',()=>{
 const duel=base(),sprite=addSprite(duel,0,0),event=eventFor(duel,sprite);
 assert.throws(()=>applyRagingFlameSpriteDirectDamage(duel,createRagingFlameSpriteLedger(),{...event,actorSeat:2},lookups),/Assento, turno/i);
 assert.throws(()=>applyRagingFlameSpriteDirectDamage(duel,createRagingFlameSpriteLedger(),{...event,turn:event.turn+1},lookups),/Assento, turno/i);
});

test('replaying the same damage event is idempotent',()=>{
 const duel=base(),sprite=addSprite(duel,0,0),ledger=createRagingFlameSpriteLedger();
 const event=eventFor(duel,sprite);
 const first=applyRagingFlameSpriteDirectDamage(duel,ledger,event,lookups);
 const replay=applyRagingFlameSpriteDirectDamage(first.state,first.ledger,event,lookups);
 assert.equal(first.status,'applied');assert.equal(replay.status,'duplicate');
 assert.equal(replay.state.core.players[0].monsters.find(card=>card.uid===sprite.uid).atkBoost,1000);
});

test('reusing an event ID with changed damage evidence is rejected',()=>{
 const duel=base(),sprite=addSprite(duel,0,0),ledger=createRagingFlameSpriteLedger();
 const event=eventFor(duel,sprite);
 const first=applyRagingFlameSpriteDirectDamage(duel,ledger,event,lookups);
 const divergent={...event,battleDamage:event.battleDamage+1};
 assert.throws(()=>applyRagingFlameSpriteDirectDamage(first.state,first.ledger,divergent,lookups),/Replay divergente/i);
});

test('event sequences are strictly increasing',()=>{
 const duel=base(),sprite=addSprite(duel,0,0),ledger=createRagingFlameSpriteLedger();
 const event=eventFor(duel,sprite,{sequence:2});
 const first=applyRagingFlameSpriteDirectDamage(duel,ledger,event,lookups);
 const older={...eventFor(first.state,sprite,{eventId:'damage-old',sequence:1,battleDamage:0}),sourceBinding:event.sourceBinding};
 assert.throws(()=>applyRagingFlameSpriteDirectDamage(first.state,first.ledger,older,lookups),/fora de ordem/i);
});

test('a fourth Monster Zone or Spell/Trap Zone is rejected; Field Zone stays separate',()=>{
 const duel=base();
 const field=fieldSpells[0];
 if(field){
  const card=take(duel,0,field);
  duel.core.players[0].field={...card,setTurn:duel.core.turn-1,faceUp:true,resolved:true};
  synchronizeCardLifetimes(duel.core);
  assert.equal(assertRagingFlameSpriteRules(duel),undefined);
 }
 const tooManyBackrow=base(),team=0;
 for(let i=0;i<4;i++){
  const card=take(tooManyBackrow,0,traps[i]);
  tooManyBackrow.core.players[team].backrow.push({...card,setTurn:0,faceUp:true,resolved:true});
 }
 synchronizeCardLifetimes(tooManyBackrow.core);
 assert.throws(()=>assertRagingFlameSpriteRules(tooManyBackrow),/limite de zonas|Spell\\/Trap Zones/i);
});

test('a physical Main Deck below twenty cards is rejected',()=>{
 const duel=base(),held=holder(duel,0);
 held.deck.pop();
 assert.throws(()=>assertRagingFlameSpriteRules(duel),/Deck Principal físico/i);
});

test('the sixth Extra Deck card for one physical seat is rejected',()=>{
 const fusions=enabled.filter(id=>getDuelCard(id)?.fusion);
 assert.ok(fusions.length>=6,'A suíte exige seis Fusions habilitadas para validar o limite.');
 const duel=base();
 duel.core.players[0].extra??=[];
 duel.core.players[0].extra.push({uid:'m0:m696-extra-six',id:fusions[5]});
 assert.throws(()=>assertRagingFlameSpriteRules(duel),/Deck Adicional físico excedeu cinco/i);
});

test('the effect conserves every physical UID and card identity',()=>{
 const duel=base(),sprite=addSprite(duel,0,0),before=inventory(duel);
 const result=applyRagingFlameSpriteDirectDamage(duel,createRagingFlameSpriteLedger(),eventFor(duel,sprite),lookups);
 assertInventoryConserved(before,result.state);
});
