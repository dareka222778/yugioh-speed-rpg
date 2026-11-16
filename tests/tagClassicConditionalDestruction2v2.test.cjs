'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const DARK_MAGICIAN='46986414';
const BLUE_EYES='89631139';
const CELTIC_GUARDIAN='91152256';
const MYSTICAL_ELF='15025844';
const EQUIP_A='01435851';
const EQUIP_B='91595718';
const BOOK_OF_MOON='14087893';
const MAGIC_JAMMER='77414722';
const DESTRUCTION_CARDS=[
  {id:'63391643',name:'Thousand Knives',kind:'spell',effect:{kind:'conditionalDestruction',activation:{speed:1,window:'main',damage:'never'},zone:'monsters',scope:'selected',controller:'opponent',requiredName:'Dark Magician'}},
  {id:'02314238',name:'Dark Magic Attack',kind:'spell',effect:{kind:'conditionalDestruction',activation:{speed:1,window:'main',damage:'never'},zone:'backrow',scope:'opponent',requiredName:'Dark Magician'}},
  {id:'38411870',name:'Needle Ceiling',kind:'trap',effect:{kind:'conditionalDestruction',activation:{speed:2,window:'free',damage:'never'},zone:'monsters',scope:'all',faceUp:true,minFieldMonsters:4}},
  {id:'28121403',name:'Really Eternal Rest',kind:'trap',effect:{kind:'conditionalDestruction',activation:{speed:2,window:'free',damage:'never'},zone:'monsters',scope:'all',equipped:true}},
  {id:'20727787',name:'Disarmament',kind:'trap',effect:{kind:'conditionalDestruction',activation:{speed:2,window:'free',damage:'never'},zone:'equipSpells',scope:'all'}},
  {id:'81510157',name:'Soul Taker',kind:'spell',effect:{kind:'conditionalDestruction',activation:{speed:1,window:'main',damage:'never'},zone:'monsters',scope:'selected',controller:'opponent',faceUp:true,opponentGainOnDestroy:1000}}
];
for(const entry of DESTRUCTION_CARDS){
  assert.equal(getPlayableCard(entry.id)?.englishName,entry.name);
  assert.deepEqual(getEffect(entry.id),entry.effect,entry.name+' must retain its exact conditional-destruction rule');
}
for(const id of [DARK_MAGICIAN,BLUE_EYES,CELTIC_GUARDIAN,MYSTICAL_ELF,EQUIP_A,EQUIP_B,BOOK_OF_MOON,MAGIC_JAMMER]){
  assert.ok(getPlayableCard(id),'fixture card must be enabled: '+id);
}
const EXCLUDED=new Set([...DESTRUCTION_CARDS.map(card=>card.id),DARK_MAGICIAN,BLUE_EYES,CELTIC_GUARDIAN,MYSTICAL_ELF,EQUIP_A,EQUIP_B,BOOK_OF_MOON,MAGIC_JAMMER]);
const FILLERS=[...new Set(tag.tagNormalCardIds)].filter(id=>!EXCLUDED.has(id)).slice(0,6);
assert.equal(FILLERS.length,6,'the fixture needs six distinct Normal Monster fillers');
const POOL=[...DESTRUCTION_CARDS.map(card=>card.id),DARK_MAGICIAN,BLUE_EYES,CELTIC_GUARDIAN,MYSTICAL_ELF,EQUIP_A,EQUIP_B,BOOK_OF_MOON,MAGIC_JAMMER,...FILLERS];
assert.equal(POOL.length,20,'each physical participant must use a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'the fixture must not duplicate card identities');

function member(seat){return 'm249-seat-'+seat;}
function deck(){return [...POOL];}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M249 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  state.core.players[0].lp=2700;
  state.core.players[1].lp=3300;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.deepEqual(state.active,[0,1]);
  return state;
}
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
  throw new Error('M249 fixture card missing from physical seat '+seat+': '+id);
}
function placeMonster(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,owner:seat%2,faceUp,position,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function placeBackrow(state,seat,id,{faceUp=false,setTurn=1,resolved=false,equippedTo}={}){
  const card=takePhysical(state,seat,id);
  const entry={...card,faceUp,setTurn,...resolved?{resolved:true}:{},...equippedTo?{equippedTo}:{}};
  state.core.players[seat%2].backrow.push(entry);
  return entry;
}
function putSpellInHand(state,seat,id){
  const card=takePhysical(state,seat,id);
  holder(state,seat).hand.push(card);
  return card;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'conditional-destruction response windows must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function activate(state,seat,id,kind,target){
  const source=kind==='spell'
    ?putSpellInHand(state,seat,id)
    :placeBackrow(state,seat,id,{faceUp:false,setTurn:1});
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>
    candidate.kind===kind&&candidate.card===source.uid&&
    (target===undefined||candidate.target===target)
  );
  assert.ok(action,id+' must expose a legal action to the active physical seat');
  state=settle(tag.stepTagDuel(state,actor,action));
  assert.ok(state.core.players[seat%2].grave.some(card=>card.uid===source.uid),
    id+' must send its resolved source to the activating team Graveyard');
  return {state,source};
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
  assert.equal(cards.length,before.size,'destruction must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'destruction must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical card identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(let seat=0;seat<4;seat++)for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}

test('M249 metadata and legal format: all six conditional-destruction effects match their audited rules',()=>{
  for(const entry of DESTRUCTION_CARDS){
    assert.equal(getPlayableCard(entry.id)?.kind,entry.kind);
    assert.deepEqual(getEffect(entry.id),entry.effect);
  }
  const state=game('m249-format');
  assert.equal(tag.tagInventory(state).length,80);
  assertRestorable(state);
});

test('Thousand Knives sees Dark Magician controlled by the inactive partner and targets only the opposing shared field',()=>{
  let state=game('m249-thousand-knives');
  const before=inventorySnapshot(state);
  const magician=placeMonster(state,2,DARK_MAGICIAN);
  const ally=placeMonster(state,0,BLUE_EYES);
  const enemyActive=placeMonster(state,1,CELTIC_GUARDIAN);
  const enemyPartner=placeMonster(state,3,MYSTICAL_ELF);
  assert.match(magician.uid,/^m2:/);
  assert.match(enemyPartner.uid,/^m3:/);
  const source=putSpellInHand(state,0,'63391643');
  const offered=tag.tagActions(state,member(0)).filter(action=>
    action.kind==='spell'&&action.card===source.uid
  );
  assert.deepEqual(new Set(offered.map(action=>action.target)),new Set([enemyActive.uid,enemyPartner.uid]),
    'the target selector must include both opposing physical seats and exclude both allies');
  const selected=offered.find(action=>action.target===enemyPartner.uid);
  assert.ok(selected);
  state=settle(tag.stepTagDuel(state,member(0),selected));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===enemyPartner.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===enemyActive.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===magician.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===ally.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Dark Magic Attack destroys both opposing physical backrows but preserves allied backrow',()=>{
  let state=game('m249-dark-magic-attack');
  const before=inventorySnapshot(state);
  const magician=placeMonster(state,2,DARK_MAGICIAN);
  const alliedSet=placeBackrow(state,2,MAGIC_JAMMER);
  const enemyActiveSet=placeBackrow(state,1,'81510157');
  const enemyPartnerSet=placeBackrow(state,3,'38411870');
  assert.match(alliedSet.uid,/^m2:/);
  assert.match(enemyPartnerSet.uid,/^m3:/);
  const {state:next,source}=activate(state,0,'02314238','spell');
  state=next;
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===magician.uid));
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===alliedSet.uid),
    'Dark Magic Attack must not destroy the activating team backrow');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===enemyActiveSet.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===enemyPartnerSet.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Needle Ceiling counts four monsters across both shared fields and destroys only face-up monsters',()=>{
  let state=game('m249-needle-ceiling');
  const before=inventorySnapshot(state);
  const alliedActive=placeMonster(state,0,BLUE_EYES);
  const alliedPartner=placeMonster(state,2,CELTIC_GUARDIAN);
  const opposingActive=placeMonster(state,1,MYSTICAL_ELF);
  const opposingPartner=placeMonster(state,3,FILLERS[0]);
  const opposingPartnerHidden=placeMonster(state,3,FILLERS[1],{faceUp:false,position:'def'});
  assert.match(alliedPartner.uid,/^m2:/);
  assert.match(opposingPartnerHidden.uid,/^m3:/);
  const {state:next,source}=activate(state,0,'38411870','trap');
  state=next;
  assert.ok(state.core.players[0].grave.some(card=>card.uid===alliedActive.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===alliedPartner.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opposingActive.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opposingPartner.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===opposingPartnerHidden.uid&&card.faceUp===false));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Really Eternal Rest destroys equipped monsters on both teams and preserves unequipped monsters',()=>{
  let state=game('m249-really-eternal-rest');
  const before=inventorySnapshot(state);
  const alliedEquipped=placeMonster(state,0,BLUE_EYES);
  const alliedControl=placeMonster(state,2,MYSTICAL_ELF);
  const opposingEquipped=placeMonster(state,3,CELTIC_GUARDIAN);
  const alliedEquip=placeBackrow(state,2,EQUIP_A,{faceUp:true,resolved:true,equippedTo:alliedEquipped.uid});
  const opposingEquip=placeBackrow(state,1,EQUIP_B,{faceUp:true,resolved:true,equippedTo:opposingEquipped.uid});
  const {state:next,source}=activate(state,0,'28121403','trap');
  state=next;
  assert.ok(state.core.players[0].grave.some(card=>card.uid===alliedEquipped.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opposingEquipped.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===alliedControl.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===alliedEquip.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opposingEquip.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Disarmament destroys Equip Spells from both teams without destroying equipped monsters or ordinary Traps',()=>{
  let state=game('m249-disarmament');
  const before=inventorySnapshot(state);
  const alliedMonster=placeMonster(state,0,BLUE_EYES);
  const opposingMonster=placeMonster(state,3,CELTIC_GUARDIAN);
  const alliedEquip=placeBackrow(state,2,EQUIP_A,{faceUp:true,resolved:true,equippedTo:alliedMonster.uid});
  const opposingEquip=placeBackrow(state,3,EQUIP_B,{faceUp:true,resolved:true,equippedTo:opposingMonster.uid});
  const ordinaryTrap=placeBackrow(state,0,MAGIC_JAMMER);
  const {state:next,source}=activate(state,0,'20727787','trap');
  state=next;
  assert.ok(state.core.players[0].grave.some(card=>card.uid===alliedEquip.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===opposingEquip.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===alliedMonster.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===opposingMonster.uid));
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===ordinaryTrap.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Soul Taker destroys a face-up partner-owned opposing monster and grants 1000 LP to the opposing team',()=>{
  let state=game('m249-soul-taker');
  const before=inventorySnapshot(state);
  const target=placeMonster(state,3,CELTIC_GUARDIAN);
  const ally=placeMonster(state,2,MYSTICAL_ELF);
  const initial=state.core.players.map(player=>player.lp);
  const {state:next,source}=activate(state,0,'81510157','spell',target.uid);
  state=next;
  assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid));
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===ally.uid));
  assert.deepEqual(state.core.players.map(player=>player.lp),[initial[0],initial[1]+1000]);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Soul Taker grants no LP when the opposing partner turns its target face-down in response',()=>{
  let state=game('m249-soul-taker-response');
  const before=inventorySnapshot(state);
  const target=placeMonster(state,3,CELTIC_GUARDIAN);
  const initial=state.core.players.map(player=>player.lp);
  const source=putSpellInHand(state,0,'81510157');
  const activation=tag.tagActions(state,member(0)).find(action=>
    action.kind==='spell'&&action.card===source.uid&&action.target===target.uid
  );
  assert.ok(activation);
  state=tag.stepTagDuel(state,member(0),activation);
  const book=placeBackrow(state,1,BOOK_OF_MOON,{faceUp:false,setTurn:1});
  const response=tag.tagActions(state,member(1)).find(action=>
    action.kind==='spell'&&action.card===book.uid&&action.target===target.uid
  );
  assert.ok(response,'the active opposing partner may protect the inactive partner-owned target');
  state=settle(tag.stepTagDuel(state,member(1),response));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===target.uid&&card.faceUp===false));
  assert.deepEqual(state.core.players.map(player=>player.lp),initial,
    'the opposing team gains no LP because the target was not destroyed');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('conditional spells requiring Dark Magician remain unavailable when the only copy is face-down',()=>{
  for(const id of ['63391643','02314238']){
    const state=game('m249-hidden-magician-'+id);
    placeMonster(state,2,DARK_MAGICIAN,{faceUp:false,position:'def'});
    const source=putSpellInHand(state,0,id);
    assert.ok(!tag.tagActions(state,member(0)).some(action=>action.card===source.uid),
      id+' must require a face-up Dark Magician on the activating team');
  }
});

test('Needle Ceiling requires four total monsters across the two shared fields, not four per team',()=>{
  const state=game('m249-needle-threshold');
  placeMonster(state,0,BLUE_EYES);
  placeMonster(state,2,CELTIC_GUARDIAN);
  placeMonster(state,1,MYSTICAL_ELF);
  const source=placeBackrow(state,0,'38411870');
  assert.ok(!tag.tagActions(state,member(0)).some(action=>action.card===source.uid),
    'three total monsters are below the four-monster threshold');
  placeMonster(state,3,FILLERS[0]);
  assert.ok(tag.tagActions(state,member(0)).some(action=>action.kind==='trap'&&action.card===source.uid),
    'the fourth monster on the opposing partner field completes the shared threshold');
});
