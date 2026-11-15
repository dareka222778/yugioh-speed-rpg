'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {engineCatalog,getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const DISAPPEAR='24623598';
const GRAVEDIGGER_GHOUL='82542267';
const SOUL_RELEASE='05758500';
const MIRACLE_DIG='06343408';
const SOUL_REVERSAL='78864369';
const BACKUP_SOLDIER='36280194';
const NEEDLE_WORM='81843628';

const expected=[
  [DISAPPEAR,'Disappear','trap',{from:'grave',scope:'opponent',destination:'banished',minimum:1,maximum:1,filter:{}}],
  [GRAVEDIGGER_GHOUL,'Gravedigger Ghoul','spell',{from:'grave',scope:'opponent',destination:'banished',minimum:1,maximum:2,filter:{monster:true}}],
  [SOUL_RELEASE,'Soul Release','spell',{from:'grave',scope:'both',destination:'banished',minimum:1,maximum:5,filter:{}}],
  [MIRACLE_DIG,'Miracle Dig','spell',{from:'banished',scope:'self',destination:'grave',minimum:3,maximum:3,minimumMonsters:5,filter:{monster:true}}],
  [SOUL_REVERSAL,'Soul Reversal','spell',{from:'grave',scope:'self',destination:'deckTop',minimum:1,maximum:1,filter:{flip:true}}],
  [BACKUP_SOLDIER,'Backup Soldier','trap',{from:'grave',scope:'self',destination:'hand',minimum:1,maximum:3,minimumMonsters:5,filter:{nonEffect:true,maxAtk:1500}}]
];
for(const [id,name,kind,rule] of expected){
  assert.equal(getPlayableCard(id)?.englishName,name,name+' must be playable');
  assert.equal(getPlayableCard(id)?.kind,kind,name+' must retain its card kind');
  assert.equal(getEffect(id)?.kind,'moveSelected',name+' must use the reviewed movement resolver');
  assert.deepEqual(getEffect(id)?.rule,rule,name+' must retain its exact source filter and destination');
}

const normalLow=[...new Set(tag.tagNormalCardIds)]
  .map(id=>getPlayableCard(id))
  .filter(card=>card?.kind==='monster'&&card.monsterType==='normal'&&Number.isInteger(card.atk)&&card.atk<=1500)
  .slice(0,3);
const normalHigh=[...new Set(tag.tagNormalCardIds)]
  .map(id=>getPlayableCard(id))
  .find(card=>card?.kind==='monster'&&card.monsterType==='normal'&&Number.isInteger(card.atk)&&card.atk>1500);
const effectMonster=engineCatalog.find(card=>card.kind==='monster'&&card.monsterType==='effect'&&card.id!==NEEDLE_WORM&&getPlayableCard(card.id));
const flipMonster=getPlayableCard(NEEDLE_WORM);
assert.equal(normalLow.length,3,'Backup Soldier needs three distinct Normal Monsters at or below 1500 ATK');
assert.ok(normalHigh,'Backup Soldier needs a Normal Monster above 1500 ATK as a negative control');
assert.ok(effectMonster,'Backup Soldier needs an Effect Monster as a negative control');
assert.equal(flipMonster?.englishName,'Needle Worm');
assert.equal(getMonsterEffect(NEEDLE_WORM)?.trigger,'flip','Soul Reversal must identify a real Flip Effect Monster');

const fixtureIds=[...new Set([
  ...normalLow.map(card=>card.id),normalHigh.id,effectMonster.id,NEEDLE_WORM,
  ...expected.map(row=>row[0])
])];
assert.ok(fixtureIds.length<=20,'the four physical Decks must fit the 20-card minimum');

function member(seat){return 'm225-seat-'+seat;}
function deck(){return Array.from({length:20},(_,index)=>fixtureIds[index%fixtureIds.length]);}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takePhysical(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M225 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const existing=physical.hand.find(card=>card.id===id);
  if(existing)return existing;
  const card=takePhysical(state,seat,id);
  physical.hand.push(card);
  return card;
}
function moveToGrave(state,seat,id){
  const card=takePhysical(state,seat,id);
  state.core.players[seat%2].grave.push(card);
  return card;
}
function moveToBanished(state,seat,id){
  const card=takePhysical(state,seat,id);
  const team=state.core.players[seat%2];
  team.banished??=[];
  team.banished.push(card);
  return card;
}
function setTrap(state,seat,id){
  const card=takePhysical(state,seat,id);
  state.core.players[seat%2].backrow.push({...card,faceUp:false,setTurn:0});
  return card;
}
function createGame(seed,first=0){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M225 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first,seed});
  state.core.turn=3;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return state;
}
function endTurn(state){
  const actor=tag.tagDecisionMember(state).id;
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active physical participant must be able to end the turn');
  state=tag.stepTagDuel(state,actor,action);
  for(let guard=0;state.core.phase==='discard';guard++){
    assert.ok(guard<8,'End Phase hand-limit discard must terminate');
    const owner=tag.tagDecisionMember(state).id;
    const discard=tag.tagActions(state,owner).find(candidate=>candidate.kind==='discard');
    assert.ok(discard,'the physical owner above six cards must receive a legal End Phase discard');
    state=tag.stepTagDuel(state,owner,discard);
  }
  return state;
}
function rotateToSeat2(state){
  for(let guard=0;tag.tagDecisionMember(state).id!==member(2);guard++){
    assert.ok(guard<4,'turn rotation must reach allied partner seat 2');
    state=endTurn(state);
  }
  assert.equal(state.active[0],2);
  assert.equal(state.active[1],1);
  return state;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function activate(state,seat,ref,kind){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind===kind&&candidate.card===ref.uid);
  assert.ok(action,'the active physical participant must be allowed to activate '+ref.id);
  return tag.stepTagDuel(state,member(seat),action);
}
function chooseMovement(state,seat,uids){
  assert.equal(state.core.phase,'choice','movement effects must expose an explicit selection');
  assert.equal(state.core.choice?.source,'selectedMovement');
  for(const uid of uids){
    const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='choose'&&candidate.target===uid);
    assert.ok(action,'the exact eligible physical UID must be selectable: '+uid);
    state=tag.stepTagDuel(state,member(seat),action);
    assert.ok(!tag.tagActions(state,member(seat)).some(candidate=>candidate.kind==='choose'&&candidate.target===uid),
      'a selected physical UID cannot be selected twice: '+uid);
  }
  if(state.core.phase==='choice'){
    const done=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='choose'&&candidate.target==='__done__');
    assert.ok(done,'an up-to selection may stop after its minimum target count');
    state=tag.stepTagDuel(state,member(seat),done);
  }
  return state;
}
function resolveMovement(state,seat,ref,kind,targets){
  state=activate(state,seat,ref,kind);
  state=chooseMovement(state,seat,targets);
  return settle(state);
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'movement must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical card identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3]){
    for(const card of tag.tagMemberHand(state,member(seat))){
      assert.ok(!publicState.includes(card.uid),'private hand UID leaked for seat '+seat+': '+card.uid);
    }
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}

test('Disappear set by seat 0 can be activated by partner seat 2 against the opposing shared Graveyard',()=>{
  let state=createGame('m225-disappear-partner-trap-opponent-grave',2);
  const trap=setTrap(state,0,DISAPPEAR);
  const enemySpell=moveToGrave(state,3,SOUL_RELEASE);
  const alliedCard=moveToGrave(state,0,normalLow[0].id);
  state=rotateToSeat2(state);
  const before=inventorySnapshot(state);
  assertPrivateHands(state);
  assert.equal(tag.tagActions(state,member(0)).length,0,'inactive partner seat 0 cannot submit the activation');
  state=resolveMovement(state,2,trap,'trap',[enemySpell.uid]);
  assert.ok(state.core.players[1].banished.some(card=>card.uid===enemySpell.uid),
    'Disappear banishes the selected card from the opposing shared Graveyard');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===alliedCard.uid),
    'Disappear cannot select or move a card from the allied Graveyard');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===trap.uid),
    'the physical Trap resolves from the shared backrow into the allied Graveyard');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Gravedigger Ghoul banishes up to two monsters from both opposing physical owners, not Spells or allied cards',()=>{
  let state=createGame('m225-gravedigger-ghoul-opponent-team-grave');
  const spell=ensureInHand(state,2,GRAVEDIGGER_GHOUL);
  const enemySeat1=moveToGrave(state,1,normalLow[0].id);
  const enemySeat3=moveToGrave(state,3,normalLow[1].id);
  const enemySpell=moveToGrave(state,3,SOUL_RELEASE);
  const alliedMonster=moveToGrave(state,0,normalLow[2].id);
  state=rotateToSeat2(state);
  const before=inventorySnapshot(state);
  assertPrivateHands(state);
  state=resolveMovement(state,2,spell,'spell',[enemySeat1.uid,enemySeat3.uid]);
  assert.ok(state.core.players[1].banished.some(card=>card.uid===enemySeat1.uid));
  assert.ok(state.core.players[1].banished.some(card=>card.uid===enemySeat3.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===enemySpell.uid),'non-monsters remain in the opposing Graveyard');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===alliedMonster.uid),'the allied shared Graveyard is excluded');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Soul Release can select mixed card types from both teams shared Graveyards',()=>{
  let state=createGame('m225-soul-release-both-team-graves');
  const spell=ensureInHand(state,2,SOUL_RELEASE);
  const alliedMonster=moveToGrave(state,0,normalLow[0].id);
  const alliedSpell=moveToGrave(state,2,BACKUP_SOLDIER);
  const enemyMonster=moveToGrave(state,3,effectMonster.id);
  const enemySpell=moveToGrave(state,1,GRAVEDIGGER_GHOUL);
  const alliedRemain=moveToGrave(state,0,normalLow[1].id);
  const enemyRemain=moveToGrave(state,1,normalLow[2].id);
  state=rotateToSeat2(state);
  const before=inventorySnapshot(state);
  assertPrivateHands(state);
  state=resolveMovement(state,2,spell,'spell',[alliedMonster.uid,alliedSpell.uid,enemyMonster.uid,enemySpell.uid]);
  for(const uid of [alliedMonster.uid,alliedSpell.uid])assert.ok(state.core.players[0].banished.some(card=>card.uid===uid));
  for(const uid of [enemyMonster.uid,enemySpell.uid])assert.ok(state.core.players[1].banished.some(card=>card.uid===uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===alliedRemain.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===enemyRemain.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Miracle Dig requires five banished monsters and returns exactly three selected UIDs to the shared Graveyard',()=>{
  let short=createGame('m225-miracle-dig-four-monster-threshold');
  const shortSpell=ensureInHand(short,2,MIRACLE_DIG);
  for(const [seat,id] of [[0,normalLow[0].id],[2,normalLow[1].id],[0,normalLow[2].id],[2,normalHigh.id]]){
    moveToBanished(short,seat,id);
  }
  short=rotateToSeat2(short);
  assert.equal(tag.tagActions(short,member(2)).some(action=>action.kind==='spell'&&action.card===shortSpell.uid),false,
    'four banished monsters do not satisfy the five-monster activation threshold');

  let state=createGame('m225-miracle-dig-five-monster-resolution');
  const spell=ensureInHand(state,2,MIRACLE_DIG);
  const targets=[
    moveToBanished(state,0,normalLow[0].id),
    moveToBanished(state,2,normalLow[1].id),
    moveToBanished(state,0,normalLow[2].id)
  ];
  const remaining=[
    moveToBanished(state,2,normalHigh.id),
    moveToBanished(state,0,effectMonster.id)
  ];
  state=rotateToSeat2(state);
  const before=inventorySnapshot(state);
  assertPrivateHands(state);
  state=resolveMovement(state,2,spell,'spell',targets.map(card=>card.uid));
  for(const card of targets)assert.ok(state.core.players[0].grave.some(ref=>ref.uid===card.uid),
    'each selected physical card returns to the shared allied Graveyard');
  for(const card of remaining)assert.ok(state.core.players[0].banished.some(ref=>ref.uid===card.uid),
    'unselected banished monsters remain banished');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Soul Reversal returns a shared-Graveyard Flip Monster to its original physical owners Deck top',()=>{
  let state=createGame('m225-soul-reversal-physical-deck-owner');
  const spell=ensureInHand(state,2,SOUL_REVERSAL);
  const partnerFlip=moveToGrave(state,0,NEEDLE_WORM);
  const alliedNormal=moveToGrave(state,2,normalLow[0].id);
  const enemyFlip=moveToGrave(state,3,NEEDLE_WORM);
  state=rotateToSeat2(state);
  const before=inventorySnapshot(state);
  assertPrivateHands(state);
  state=resolveMovement(state,2,spell,'spell',[partnerFlip.uid]);
  assert.equal(holder(state,0).deck[0].uid,partnerFlip.uid,
    'the inactive physical owner seat 0 receives the selected Flip Monster on top of their Deck');
  assert.ok(!holder(state,2).deck.some(card=>card.uid===partnerFlip.uid),
    'the active partner cannot appropriate the original physical Deck card');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===alliedNormal.uid),
    'non-Flip Monsters are not eligible');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===enemyFlip.uid),
    'the opposing shared Graveyard is not eligible');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Backup Soldier set by seat 0 returns eligible non-Effect Monsters to their original physical hands',()=>{
  let state=createGame('m225-backup-soldier-physical-hand-owners',2);
  const trap=setTrap(state,0,BACKUP_SOLDIER);
  const first=moveToGrave(state,0,normalLow[0].id);
  const second=moveToGrave(state,2,normalLow[1].id);
  const third=moveToGrave(state,0,normalLow[2].id);
  const tooStrong=moveToGrave(state,2,normalHigh.id);
  const effect=moveToGrave(state,0,effectMonster.id);
  const opponentLow=moveToGrave(state,1,normalLow[0].id);
  state=rotateToSeat2(state);
  const before=inventorySnapshot(state);
  assertPrivateHands(state);
  state=resolveMovement(state,2,trap,'trap',[first.uid,second.uid,third.uid]);
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===first.uid));
  assert.ok(tag.tagMemberHand(state,member(2)).some(card=>card.uid===second.uid));
  assert.ok(tag.tagMemberHand(state,member(0)).some(card=>card.uid===third.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===tooStrong.uid),'monsters above 1500 ATK are excluded');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===effect.uid),'Effect Monsters are excluded');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opponentLow.uid),'the opposing shared Graveyard is excluded');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===trap.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});
