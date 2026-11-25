'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTagDuel, tagInventory, tagNormalCardIds } = require('../dist/tagDuel.js');
const { enabledCardIds, getDuelCard } = require('../dist/effectRegistry.js');
const { rulesCardName } = require('../dist/cardIdentity.js');
const { synchronizeCardLifetimes } = require('../dist/cardLifetime.js');
const {
  DARK_SCORPION_BURGLARS_ID,
  DARK_SCORPION_CLIFF_ID,
  createDarkScorpionBattleDamageTagAdapter,
} = require('../dist/darkScorpionBattleDamageTagAdapter.js');

const EFFECT_IDS = enabledCardIds.filter(id => {
  const card = getDuelCard(id);
  return card?.kind === 'monster' && card.monsterType === 'effect' && !card.fusion;
});
const SPELL_IDS = enabledCardIds.filter(id => getDuelCard(id)?.kind === 'spell').slice(0, 2);
const TRAP_IDS = enabledCardIds.filter(id => getDuelCard(id)?.kind === 'trap').slice(0, 2);
const FUSION_NAMES = new Set();
const FUSION_IDS = enabledCardIds.filter(id => {
  const card = getDuelCard(id);
  if (!card?.fusion) return false;
  const name = rulesCardName(card);
  if (FUSION_NAMES.has(name)) return false;
  FUSION_NAMES.add(name);
  return true;
});
const NORMAL_NAMES = new Set();
const NORMAL_IDS = tagNormalCardIds.filter(id => {
  const name = rulesCardName(getDuelCard(id));
  if (NORMAL_NAMES.has(name)) return false;
  NORMAL_NAMES.add(name);
  return true;
});
const BASE_DECK = [...NORMAL_IDS.slice(0, 14), EFFECT_IDS[0], EFFECT_IDS[1], ...SPELL_IDS, TRAP_IDS[0], TRAP_IDS[0]];
assert.equal(BASE_DECK.length, 20);
assert.ok(EFFECT_IDS.length >= 2);
assert.ok(SPELL_IDS.length >= 2);
assert.ok(TRAP_IDS.length >= 1);
assert.ok(FUSION_IDS.length >= 6);

const BURGLARS_FIXTURE_ID = EFFECT_IDS[0];
const CLIFF_FIXTURE_ID = EFFECT_IDS[1];
const adapter = createDarkScorpionBattleDamageTagAdapter(
  { burglarsId: BURGLARS_FIXTURE_ID, cliffId: CLIFF_FIXTURE_ID },
  id => {
    const card = getDuelCard(id);
    return card ? { kind: card.kind, monsterType: card.monsterType } : undefined;
  }
);

function makeDuel(first = 2, deck = BASE_DECK, extraBySeat = {}) {
  return createTagDuel([0,1,2,3].map(i => ({
    id: 'm633-seat-' + i, name: 'Member ' + i, cards: [...deck], extra: [...(extraBySeat[i] || [])]
  })), { seed:'m633-dark-scorpion', first, classic:true });
}
function privateZone(duel, seat, zone) {
  const team = seat % 2;
  return duel.active[team] === seat ? duel.core.players[team][zone] : duel.reserves[seat][zone];
}
function takeFromSeat(duel, seat, predicate, zones=['hand','deck']) {
  for (const zoneName of zones) {
    const zone = privateZone(duel, seat, zoneName);
    const index = zone.findIndex(predicate);
    if (index >= 0) return zone.splice(index,1)[0];
  }
  throw new Error('physical fixture card not found');
}
function addMonster(duel, id, ownerSeat, controllerTeam) {
  const card=takeFromSeat(duel,ownerSeat,ref=>ref.id===id);
  duel.core.players[controllerTeam].monsters.push({
    ...card,owner:ownerSeat%2,position:'atk',faceUp:true,entered:duel.core.turn,
    changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0
  });
  return card.uid;
}
function addAnyMonster(duel, ownerSeat, controllerTeam) {
  const card=takeFromSeat(duel,ownerSeat,ref=>getDuelCard(ref.id)?.kind==='monster'&&!getDuelCard(ref.id)?.fusion);
  duel.core.players[controllerTeam].monsters.push({
    ...card,owner:ownerSeat%2,position:'atk',faceUp:true,entered:duel.core.turn,
    changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0
  });
  return card.uid;
}
function addBackrow(duel, ownerSeat, controllerTeam, id) {
  const card=takeFromSeat(duel,ownerSeat,ref=>id?ref.id===id:['spell','trap'].includes(getDuelCard(ref.id)?.kind));
  duel.core.players[controllerTeam].backrow.push({...card,setTurn:0,faceUp:false});
  return card.uid;
}
function eventAndSource(cardId=BURGLARS_FIXTURE_ID, ownerSeat=0, attackerTeam=0, damage=300, first=2) {
  const duel=makeDuel(first);
  const attackerUid=addMonster(duel,cardId,ownerSeat,attackerTeam);
  const opponentTeam=1-attackerTeam;
  const before=duel.core.players[opponentTeam].lp;
  duel.core.players[opponentTeam].lp-=damage;
  const event={
    kind:'battle-damage-to-opponent',
    eventId:'m633:event:'+attackerUid,
    battleId:'m633:battle:'+attackerUid,
    turn:duel.core.turn,
    attackerUid,attackerId:cardId,attackerTeam,opponentTeam,
    damage,opponentLpBefore:before,opponentLpAfter:before-damage,
    damageApplied:true,sourceWasFaceUp:true
  };
  return {duel,attackerUid,event};
}
function inventory(duel) {
  return tagInventory(duel).map(card=>[card.uid,card.id]).sort((a,b)=>a[0].localeCompare(b[0]));
}
function moveMonsterToGrave(duel,uid,team) {
  const index=duel.core.players[team].monsters.findIndex(m=>m.uid===uid);
  assert.ok(index>=0);
  const [monster]=duel.core.players[team].monsters.splice(index,1);
  const ownerTeam=Number(uid.match(/^m([0-3]):/)[1])%2;
  duel.core.players[ownerTeam].grave.push({uid:monster.uid,id:monster.id});
  synchronizeCardLifetimes(duel.core);
}
function returnMonster(duel,uid,ownerTeam,controllerTeam) {
  const index=duel.core.players[ownerTeam].grave.findIndex(c=>c.uid===uid);
  const [card]=duel.core.players[ownerTeam].grave.splice(index,1);
  duel.core.players[controllerTeam].monsters.push({
    ...card,owner:ownerTeam,position:'atk',faceUp:true,entered:duel.core.turn,
    changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0
  });
  synchronizeCardLifetimes(duel.core);
}
function ensureSpellInDeck(duel,seat=3) {
  const deck=privateZone(duel,seat,'deck');
  let found=deck.find(card=>getDuelCard(card.id)?.kind==='spell');
  if(found)return found;
  const card=takeFromSeat(duel,seat,ref=>getDuelCard(ref.id)?.kind==='spell',['hand']);
  deck.push(card);
  return card;
}
function planFor(duel,event,choice) {
  return adapter.prepare(duel,event,choice);
}

test('IDs oficiais e passcodes do par Dark Scorpion',()=>{
  assert.equal(DARK_SCORPION_BURGLARS_ID,'40933924');
  assert.equal(DARK_SCORPION_CLIFF_ID,'06967870');
  assert.equal(adapter.prepare instanceof Function,true);
  assert.equal(adapter.resolve instanceof Function,true);
});

test('gatilho rejeita zero de dano de batalha',()=>{
  const {duel,event}=eventAndSource();
  assert.throws(()=>adapter.prepare(duel,{...event,damage:0,opponentLpAfter:event.opponentLpBefore}, {kind:'burglars-send-spell'}));
});

test('gatilho rejeita dano não aplicado',()=>{
  const {duel,event}=eventAndSource();
  assert.throws(()=>adapter.prepare(duel,{...event,damageApplied:false},{kind:'burglars-send-spell'}));
});

test('gatilho rejeita divergência entre dano e LP final',()=>{
  const {duel,event}=eventAndSource();
  assert.throws(()=>adapter.prepare(duel,{...event,opponentLpAfter:event.opponentLpAfter+1},{kind:'burglars-send-spell'}));
});

test('gatilho rejeita evento de outro turno',()=>{
  const {duel,event}=eventAndSource();
  assert.throws(()=>adapter.prepare(duel,{...event,turn:duel.core.turn+1},{kind:'burglars-send-spell'}));
});

test('gatilho exige o atacante correto, face-up e no lado informado',()=>{
  const {duel,event}=eventAndSource();
  assert.throws(()=>adapter.prepare(duel,{...event,attackerTeam:1,opponentTeam:0},{kind:'burglars-send-spell'}));
  const source=duel.core.players[0].monsters.find(m=>m.uid===event.attackerUid);
  source.faceUp=false;
  assert.throws(()=>adapter.prepare(duel,event,{kind:'burglars-send-spell'}));
});

test('Burglars prepara o envio de uma Magia do Deck do representante adversário',()=>{
  const {duel,event}=eventAndSource();
  const result=planFor(duel,event,{kind:'burglars-send-spell'});
  assert.equal(result.status,'ready');
  assert.equal(result.plan.kind,'burglars-send-spell');
  assert.equal(result.plan.opponentTeam,1);
});

test('Burglars aguarda a seleção privada do oponente sem consumir o plano',()=>{
  const {duel,event}=eventAndSource();
  const prepared=planFor(duel,event,{kind:'burglars-send-spell'});
  const waiting=adapter.resolve(prepared.state,prepared.plan);
  assert.equal(waiting.status,'awaiting-opponent-selection');
  assert.equal(waiting.state.darkScorpionBattle.pendingPlans.length,1);
});

test('Burglars envia somente Magia escolhida do Deck ativo adversário e embaralha',()=>{
  const {duel,event}=eventAndSource();
  const selected=ensureSpellInDeck(duel,3);
  const before=inventory(duel);
  const prepared=planFor(duel,event,{kind:'burglars-send-spell'});
  const resolved=adapter.resolve(prepared.state,prepared.plan,selected.uid);
  assert.equal(resolved.status,'resolved');
  assert.ok(resolved.state.core.players[1].grave.some(card=>card.uid===selected.uid));
  assert.ok(!resolved.state.core.players[1].deck.some(card=>card.uid===selected.uid));
  assert.deepEqual(inventory(resolved.state),before);
});

test('Burglars recusa seleção de Armadilha',()=>{
  const {duel,event}=eventAndSource();
  const trap=takeFromSeat(duel,3,card=>getDuelCard(card.id)?.kind==='trap',['deck','hand']);
  privateZone(duel,3,'deck').push(trap);
  const prepared=planFor(duel,event,{kind:'burglars-send-spell'});
  const invalid=adapter.resolve(prepared.state,prepared.plan,trap.uid);
  assert.equal(invalid.status,'invalid-selection');
  assert.equal(invalid.state.darkScorpionBattle.pendingPlans.length,1);
});

test('Burglars não aceita carta da mão ou Deck do próprio atacante',()=>{
  const {duel,event}=eventAndSource();
  const ownSpell=takeFromSeat(duel,0,card=>getDuelCard(card.id)?.kind==='spell',['deck','hand']);
  privateZone(duel,0,'deck').push(ownSpell);
  const prepared=planFor(duel,event,{kind:'burglars-send-spell'});
  const invalid=adapter.resolve(prepared.state,prepared.plan,ownSpell.uid);
  assert.equal(invalid.status,'invalid-selection');
});

test('Burglars sem Magias no Deck adversário resolve sem inventar carta',()=>{
  const {duel,event}=eventAndSource();
  const deck=privateZone(duel,3,'deck');
  const spells=deck.filter(card=>getDuelCard(card.id)?.kind==='spell');
  for(const spell of spells){
    const index=deck.findIndex(card=>card.uid===spell.uid);
    const [removed]=deck.splice(index,1);
    duel.core.players[1].grave.push(removed);
  }
  const prepared=planFor(duel,event,{kind:'burglars-send-spell'});
  const resolved=adapter.resolve(prepared.state,prepared.plan);
  assert.equal(resolved.status,'no-eligible-card');
  assert.equal(resolved.sentUids.length,0);
});

test('Cliff destrói Magia/Armadilha face-down no campo',()=>{
  const {duel,event}=eventAndSource(CLIFF_FIXTURE_ID);
  const targetUid=addBackrow(duel,1,1,TRAP_IDS[0]);
  const prepared=planFor(duel,event,{kind:'cliff-destroy',targetUid});
  assert.equal(prepared.status,'ready');
  const resolved=adapter.resolve(prepared.state,prepared.plan);
  assert.equal(resolved.status,'resolved');
  assert.ok(resolved.state.core.players[1].grave.some(card=>card.uid===targetUid));
});

test('Cliff pode destruir uma carta na Field Zone',()=>{
  const {duel,event}=eventAndSource(CLIFF_FIXTURE_ID);
  const card=takeFromSeat(duel,1,ref=>getDuelCard(ref.id)?.kind==='spell');
  duel.core.players[1].field={...card,setTurn:0,faceUp:true};
  const prepared=planFor(duel,event,{kind:'cliff-destroy',targetUid:card.uid});
  assert.equal(prepared.status,'ready');
  const resolved=adapter.resolve(prepared.state,prepared.plan);
  assert.equal(resolved.status,'resolved');
  assert.equal(resolved.state.core.players[1].field,null);
  assert.ok(resolved.state.core.players[1].grave.some(item=>item.uid===card.uid));
});

test('Cliff recusa um monstro como alvo de destruição',()=>{
  const {duel,event}=eventAndSource(CLIFF_FIXTURE_ID);
  const targetUid=addAnyMonster(duel,1,1);
  const invalid=planFor(duel,event,{kind:'cliff-destroy',targetUid});
  assert.equal(invalid.status,'invalid-target');
  const validMill=planFor(duel,event,{kind:'cliff-mill'});
  assert.equal(validMill.status,'ready');
});

test('Cliff não retargeta se a Magia/Armadilha sair da zona',()=>{
  const {duel,event}=eventAndSource(CLIFF_FIXTURE_ID);
  const targetUid=addBackrow(duel,1,1,TRAP_IDS[0]);
  const prepared=planFor(duel,event,{kind:'cliff-destroy',targetUid});
  const index=prepared.state.core.players[1].backrow.findIndex(card=>card.uid===targetUid);
  const [card]=prepared.state.core.players[1].backrow.splice(index,1);
  prepared.state.core.players[1].grave.push(card);
  synchronizeCardLifetimes(prepared.state.core);
  const resolved=adapter.resolve(prepared.state,prepared.plan);
  assert.equal(resolved.status,'stale-target');
});

test('Cliff envia as duas cartas do topo do Deck ativo adversário ao Cemitério',()=>{
  const {duel,event}=eventAndSource(CLIFF_FIXTURE_ID);
  const before=inventory(duel);
  const expected=privateZone(duel,3,'deck').slice(0,2).map(card=>card.uid);
  const prepared=planFor(duel,event,{kind:'cliff-mill'});
  const resolved=adapter.resolve(prepared.state,prepared.plan);
  assert.equal(resolved.status,'resolved');
  assert.deepEqual(resolved.sentUids,expected);
  for(const uid of expected) assert.ok(resolved.state.core.players[1].grave.some(card=>card.uid===uid));
  assert.deepEqual(inventory(resolved.state),before);
});

test('Cliff envia somente a carta restante quando o Deck tem uma carta',()=>{
  const {duel,event}=eventAndSource(CLIFF_FIXTURE_ID);
  const deck=privateZone(duel,3,'deck');
  const keep=deck.splice(0,1)[0];
  const moved=deck.splice(0,deck.length);
  duel.core.players[1].grave.push(...moved);
  deck.push(keep);
  const prepared=planFor(duel,event,{kind:'cliff-mill'});
  const resolved=adapter.resolve(prepared.state,prepared.plan);
  assert.equal(resolved.status,'resolved');
  assert.equal(resolved.sentUids.length,1);
  assert.ok(resolved.state.core.players[1].grave.some(card=>card.uid===keep.uid));
});

test('Cliff sem cartas no Deck resolve sem envio',()=>{
  const {duel,event}=eventAndSource(CLIFF_FIXTURE_ID);
  const deck=privateZone(duel,3,'deck');
  const moved=deck.splice(0,deck.length);
  duel.core.players[1].grave.push(...moved);
  const prepared=planFor(duel,event,{kind:'cliff-mill'});
  const resolved=adapter.resolve(prepared.state,prepared.plan);
  assert.equal(resolved.status,'no-eligible-card');
  assert.deepEqual(resolved.sentUids,[]);
});

test('Cliff exige uma escolha explícita de um dos dois efeitos',()=>{
  const {duel,event}=eventAndSource(CLIFF_FIXTURE_ID);
  const invalid=planFor(duel,event,{kind:'burglars-send-spell'});
  assert.equal(invalid.status,'invalid-choice');
  const valid=planFor(invalid.state,event,{kind:'cliff-mill'});
  assert.equal(valid.status,'ready');
});

test('efeito preparado resolve mesmo se a fonte sair do campo',()=>{
  const {duel,event,attackerUid}=eventAndSource(CLIFF_FIXTURE_ID);
  const prepared=planFor(duel,event,{kind:'cliff-mill'});
  moveMonsterToGrave(prepared.state,attackerUid,0);
  const resolved=adapter.resolve(prepared.state,prepared.plan);
  assert.equal(resolved.status,'resolved');
});

test('negação da fonte na resolução impede o efeito',()=>{
  const {duel,event}=eventAndSource(CLIFF_FIXTURE_ID);
  const prepared=planFor(duel,event,{kind:'cliff-mill'});
  const source=prepared.state.core.players[0].monsters.find(m=>m.uid===event.attackerUid);
  source.faceUp=false;
  const resolved=adapter.resolve(prepared.state,prepared.plan);
  assert.equal(resolved.status,'source-negated');
});

test('evento duplicado e resolução duplicada são idempotentes',()=>{
  const {duel,event}=eventAndSource(CLIFF_FIXTURE_ID);
  const prepared=planFor(duel,event,{kind:'cliff-mill'});
  assert.equal(planFor(prepared.state,event,{kind:'cliff-mill'}).status,'duplicate');
  const first=adapter.resolve(prepared.state,prepared.plan);
  assert.equal(first.status,'resolved');
  const second=adapter.resolve(first.state,prepared.plan);
  assert.equal(second.status,'duplicate');
});

test('Deck 20–30, Extra 5 e zonas 3+3 continuam protegidos',()=>{
  const {duel,event}=eventAndSource();
  assert.equal(planFor(duel,event,{kind:'burglars-send-spell'}).status,'ready');
  const invalidDeck=makeDuel(2,BASE_DECK.slice(0,19));
  assert.throws(()=>adapter.prepare(invalidDeck,event,{kind:'burglars-send-spell'}));
  const extra5=makeDuel(2,BASE_DECK,{0:FUSION_IDS.slice(0,5)});
  assert.doesNotThrow(()=>adapter.prepare(extra5,event,{kind:'burglars-send-spell'}));
  const extra6=makeDuel(2,BASE_DECK,{0:FUSION_IDS.slice(0,6)});
  assert.throws(()=>adapter.prepare(extra6,event,{kind:'burglars-send-spell'}));
});

test('evento de dano sem fonte no campo não pode ser fabricado',()=>{
  const {duel,event,attackerUid}=eventAndSource();
  moveMonsterToGrave(duel,attackerUid,0);
  assert.throws(()=>adapter.prepare(duel,event,{kind:'burglars-send-spell'}));
});

test('inventário não é concedido ao resolver os efeitos',()=>{
  const {duel,event}=eventAndSource();
  const before=inventory(duel);
  const selected=ensureSpellInDeck(duel,3);
  const prepared=planFor(duel,event,{kind:'burglars-send-spell'});
  const resolved=adapter.resolve(prepared.state,prepared.plan,selected.uid);
  assert.deepEqual(inventory(resolved.state),before);
});
