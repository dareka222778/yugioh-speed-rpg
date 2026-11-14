'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const batch=require('../dist/conditionalBatch30');

const DARK_MAGICIAN='46986414';
const THOUSAND_KNIVES='63391643';
const DARK_MAGIC_ATTACK='02314238';
const MIRROR_FORCE='44095762';
const TORRENTIAL_TRIBUTE='53582587';

test('M200 card registry and conditional model contract',()=>{
  for(const [id,name] of [
    [DARK_MAGICIAN,'Dark Magician'],
    [THOUSAND_KNIVES,'Thousand Knives'],
    [DARK_MAGIC_ATTACK,'Dark Magic Attack'],
    [MIRROR_FORCE,'Mirror Force'],
    [TORRENTIAL_TRIBUTE,'Torrential Tribute']
  ]){
    assert.equal(getPlayableCard(id)?.englishName,name);
  }
  assert.equal(batch.conditionalEffects30[THOUSAND_KNIVES]?.kind,'conditionalDestruction');
  assert.equal(batch.conditionalEffects30[THOUSAND_KNIVES]?.zone,'monsters');
  assert.equal(batch.conditionalEffects30[THOUSAND_KNIVES]?.scope,'selected');
  assert.equal(batch.conditionalEffects30[THOUSAND_KNIVES]?.controller,'opponent');
  assert.equal(batch.conditionalEffects30[THOUSAND_KNIVES]?.requiredName,'Dark Magician');
  assert.equal(batch.conditionalEffects30[DARK_MAGIC_ATTACK]?.kind,'conditionalDestruction');
  assert.equal(batch.conditionalEffects30[DARK_MAGIC_ATTACK]?.zone,'backrow');
  assert.equal(batch.conditionalEffects30[DARK_MAGIC_ATTACK]?.scope,'opponent');
  assert.equal(batch.conditionalEffects30[DARK_MAGIC_ATTACK]?.requiredName,'Dark Magician');
  
});

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the conditional Spell fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm200-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(required,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M200 Seat '+seat,cards:deck(required)
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  return state;
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takeCard(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M200 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const card=takeCard(state,seat,id);
  physical.hand.push(card);
  return card;
}
function deploy(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function setBackrow(state,seat,id){
  const card=takeCard(state,seat,id);
  const setCard={...card,faceUp:false,setTurn:0};
  state.core.players[seat%2].backrow.push(setCard);
  return setCard;
}
function act(state,seat,kind,filter=()=>true){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind===kind&&filter(candidate));
  assert.ok(action,'seat '+seat+' needs '+kind+' in '+state.core.phase);
  return tag.stepTagDuel(state,member(seat),action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the conditional Spell response chain must terminate');
    const seat=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,seat).find(candidate=>candidate.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,seat,pass);
  }
  return state;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all physical UIDs must be unique');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'conditional Spells must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'conditional Spells must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Thousand Knives can target a monster owned by either opposing physical seat when a partner controls Dark Magician',()=>{
  let state=game([DARK_MAGICIAN,THOUSAND_KNIVES],'m200-thousand-knives-team-target');
  const before=inventorySnapshot(state);
  const source=ensureInHand(state,0,THOUSAND_KNIVES);
  const magician=deploy(state,2,DARK_MAGICIAN);
  const ownMonster=deploy(state,0,normalIds[0]);
  const firstOpponent=deploy(state,1,normalIds[1]);
  const secondOpponent=deploy(state,3,normalIds[2]);
  const actions=tag.tagActions(state,member(0)).filter(action=>
    action.kind==='spell'&&action.card===source.uid
  );
  assert.ok(actions.some(action=>action.target===firstOpponent.uid),
    'the active player can target a monster physically owned by opposing seat 1');
  assert.ok(actions.some(action=>action.target===secondOpponent.uid),
    'the active player can target a monster physically owned by opposing seat 3');
  assert.ok(!actions.some(action=>action.target===ownMonster.uid),
    'Thousand Knives cannot target a monster on its own shared team field');
  const action=actions.find(candidate=>candidate.target===secondOpponent.uid);
  state=settle(tag.stepTagDuel(state,member(0),action));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===secondOpponent.uid),
    'the selected seat 3 monster enters the opposing team shared Graveyard');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===firstOpponent.uid),
    'the unselected seat 1 monster survives');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===ownMonster.uid&&card.uid!==magician.uid),
    'the activating team monsters survive');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===magician.uid&&card.id===DARK_MAGICIAN),
    'partner-owned Dark Magician remains on the shared field');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid&&card.id===THOUSAND_KNIVES));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('Dark Magic Attack destroys Set Spells and Traps from both opposing physical seats only',()=>{
  let state=game([DARK_MAGICIAN,DARK_MAGIC_ATTACK,MIRROR_FORCE,TORRENTIAL_TRIBUTE],'m200-dark-magic-attack');
  const before=inventorySnapshot(state);
  const source=ensureInHand(state,0,DARK_MAGIC_ATTACK);
  const magician=deploy(state,2,DARK_MAGICIAN);
  const ownSet= setBackrow(state,0,MIRROR_FORCE);
  const seat1Set=setBackrow(state,1,MIRROR_FORCE);
  const seat3Set=setBackrow(state,3,TORRENTIAL_TRIBUTE);
  const hiddenBefore=JSON.stringify(tag.publicTagDuel(state));
  for(const hidden of [ownSet,seat1Set,seat3Set]){
    assert.ok(!hiddenBefore.includes(hidden.id),'Set backrow identities must remain private before activation');
    assert.ok(!hiddenBefore.includes(hidden.uid),'Set backrow UIDs must remain private before activation');
  }
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===source.uid
  );
  assert.ok(action,'Dark Magic Attack is available while the activating team controls Dark Magician');
  state=settle(tag.stepTagDuel(state,member(0),action));
  assert.deepEqual(state.core.players[1].backrow,[],
    'both opposing physical seats lose their Set backrow to the shared-field effect');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===seat1Set.uid&&card.id===MIRROR_FORCE),
    'seat 1 Set Trap enters the opposing shared Graveyard');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===seat3Set.uid&&card.id===TORRENTIAL_TRIBUTE),
    'seat 3 Set Trap enters the same opposing shared Graveyard');
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===ownSet.uid),
    'the activating team's own Set backrow is preserved');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===magician.uid&&card.id===DARK_MAGICIAN),
    'partner-owned Dark Magician remains on the shared field');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid&&card.id===DARK_MAGIC_ATTACK));
  assertConserved(state,before);
  tag.assertTagDuel(state);
});

test('neither Dark Magician conditional Spell is available when only the opposing team controls Dark Magician',()=>{
  let state=game([DARK_MAGICIAN,THOUSAND_KNIVES,DARK_MAGIC_ATTACK],'m200-no-friendly-magician');
  const knives=ensureInHand(state,0,THOUSAND_KNIVES);
  const darkMagicAttack=ensureInHand(state,0,DARK_MAGIC_ATTACK);
  deploy(state,1,DARK_MAGICIAN);
  const actions=tag.tagActions(state,member(0));
  assert.ok(!actions.some(action=>action.card===knives.uid&&(action.kind==='spell'||action.kind==='trap')),
    'opposing Dark Magician cannot satisfy Thousand Knives own-team condition');
  assert.ok(!actions.some(action=>action.card===darkMagicAttack.uid&&(action.kind==='spell'||action.kind==='trap')),
    'opposing Dark Magician cannot satisfy Dark Magic Attack own-team condition');
  tag.assertTagDuel(state);
});
