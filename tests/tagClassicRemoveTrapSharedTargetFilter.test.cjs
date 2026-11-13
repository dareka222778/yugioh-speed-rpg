'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const REMOVE_TRAP='51482758';
const TRAP_HOLE='04206964';
const BOTTOMLESS='29401950';
const DE_SPELL='19159413';
assert.ok(getPlayableCard(REMOVE_TRAP)?.kind==='spell','Remove Trap must be an enabled Spell');
assert.equal(getEffect(REMOVE_TRAP)?.kind,'removeTrap');
assert.equal(getEffect(TRAP_HOLE)?.kind,'trapHole');
assert.equal(getEffect(BOTTOMLESS)?.kind,'bottomlessTrapHole');
assert.equal(getEffect(DE_SPELL)?.kind,'deSpell');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm125-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
  assert.ok(ids.length>=7);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain Remove Trap');
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function takeCard(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M125 fixture card missing from physical seat '+seat+': '+id);
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Remove Trap must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Remove Trap offers only face-up Trap targets across the two shared 2v2 backrows',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M125 Seat '+seat,
    cards:deck(seat===0?[REMOVE_TRAP]:seat===1?[BOTTOMLESS]:seat===2?[DE_SPELL]:seat===3?[TRAP_HOLE]:[])
  }));
  const initial=tag.createTagDuel(players,{classic:true,first:0,seed:'m125-remove-trap-target-filter'});
  const spell=ensureInHand(initial,0,REMOVE_TRAP);
  const hiddenTrapCard=takeCard(initial,1,BOTTOMLESS);
  const faceUpSpellCard=takeCard(initial,2,DE_SPELL);
  const faceUpTrapCard=takeCard(initial,3,TRAP_HOLE);
  const hiddenTrap={...hiddenTrapCard,setTurn:0,faceUp:false};
  const faceUpSpell={...faceUpSpellCard,setTurn:0,faceUp:true};
  const faceUpTrap={...faceUpTrapCard,setTurn:0,faceUp:true};
  initial.core.players[1].backrow.push(hiddenTrap,faceUpTrap);
  initial.core.players[0].backrow.push(faceUpSpell);
  initial.core.turn=3;
  const before=inventorySnapshot(initial);
  assert.match(spell.uid,/^m0:/);
  assert.match(hiddenTrap.uid,/^m1:/);
  assert.match(faceUpSpell.uid,/^m2:/);
  assert.match(faceUpTrap.uid,/^m3:/);
  assert.doesNotThrow(()=>tag.assertTagDuel(initial));

  const publicBefore=tag.publicTagDuel(initial);
  assert.ok(!JSON.stringify(publicBefore).includes(hiddenTrap.id),
    'a Set Trap identity must remain private before Remove Trap');
  assert.ok(!JSON.stringify(publicBefore).includes(hiddenTrap.uid),
    'a Set Trap physical UID must remain private before Remove Trap');

  const actions=tag.tagActions(initial,member(0)).filter(action=>
    action.kind==='spell'&&action.card===spell.uid
  );
  assert.ok(actions.some(action=>action.target===faceUpTrap.uid),
    'a face-up Trap controlled by the opposing teammate is a legal target');
  assert.ok(!actions.some(action=>action.target===hiddenTrap.uid),
    'a Set Trap must not appear as a legal Remove Trap target');
  assert.ok(!actions.some(action=>action.target===faceUpSpell.uid),
    'a face-up Spell must not appear as a legal Remove Trap target');
  const action=actions.find(candidate=>candidate.target===faceUpTrap.uid);
  assert.ok(action);

  const state=tag.stepTagDuel(initial,member(0),action);
  assert.equal(state.core.phase,'main','Remove Trap resolves immediately without a legal response');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===faceUpTrap.uid),
    'the selected Trap enters its controlling team Graveyard');
  assert.ok(state.core.players[1].backrow.some(card=>card.uid===hiddenTrap.uid&&!card.faceUp),
    'the Set Trap remains untouched and hidden');
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===faceUpSpell.uid&&card.faceUp),
    'the face-up Spell remains untouched');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid),
    'Remove Trap enters the activating team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});
