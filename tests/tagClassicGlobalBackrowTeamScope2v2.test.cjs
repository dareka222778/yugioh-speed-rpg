'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');

const HEAVY_STORM='19613556';
const HARPIE_DUSTER='18144506';
const SOGEN='86318356';
const MOUNTAIN='50913601';
const MIRROR_FORCE='44095762';
const SEVEN_TOOLS='03819470';
const TORRENTIAL='53582587';
const MAGIC_JAMMER='77414722';

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the 2v2 fixture needs eight certified Normal Monsters');
const normalDeck=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm164-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalDeck])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
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
  throw new Error('M164 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function setBackrow(state,seat,id){
  const card=takeCard(state,seat,id);
  const placed={...card,faceUp:false,setTurn:0};
  state.core.players[seat%2].backrow.push(placed);
  return placed;
}
function setField(state,seat,id){
  const card=takeCard(state,seat,id);
  const placed={...card,faceUp:true,setTurn:0,resolved:true};
  state.core.players[seat%2].field=placed;
  return placed;
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function act(state,seat,kind,filter=()=>true){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind===kind&&filter(candidate));
  assert.ok(action,'seat '+seat+' needs '+kind+' in '+state.core.phase);
  return tag.stepTagDuel(state,member(seat),action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Spell response chain must terminate');
    const responder=tag.tagDecisionMember(state);
    const pass=tag.tagActions(state,responder.id).find(candidate=>candidate.kind==='pass');
    assert.ok(pass,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,responder.id,pass);
  }
  return state;
}
function snapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'all four physical 20-card decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'global backrow destruction must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function fixture(spellId){
  const required=[
    [spellId,MIRROR_FORCE],
    [TORRENTIAL],
    [SEVEN_TOOLS,SOGEN],
    [MAGIC_JAMMER,MOUNTAIN]
  ];
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M164 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m164-global-backrow-'+spellId});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  const spell=ensureInHand(state,0,spellId);
  const alliedSet0=setBackrow(state,0,MIRROR_FORCE);
  const opponentSet0=setBackrow(state,1,TORRENTIAL);
  const alliedSet2=setBackrow(state,2,SEVEN_TOOLS);
  const opponentSet2=setBackrow(state,3,MAGIC_JAMMER);
  const alliedField=setField(state,2,SOGEN);
  const opponentField=setField(state,3,MOUNTAIN);
  const monsters=[
    deploy(state,0,normal[0].id),
    deploy(state,3,normal[1].id)
  ];
  tag.assertTagDuel(state);
  return {state,spell,alliedSet0,opponentSet0,alliedSet2,opponentSet2,alliedField,opponentField,monsters};
}
function assertHidden(publicState,cards){
  for(const card of cards){
    assert.ok(!publicState.includes(card.id),'a Set Spell/Trap identity leaked: '+card.uid);
    assert.ok(!publicState.includes(card.uid),'a Set Spell/Trap UID leaked: '+card.uid);
  }
}
function inGrave(state,team,card){
  return state.core.players[team].grave.some(entry=>entry.uid===card.uid&&entry.id===card.id);
}

test('Heavy Storm and Harpie\'s Feather Duster are certified Normal Spells with distinct global scopes',()=>{
  const heavy=getEffect(HEAVY_STORM),harpie=getEffect(HARPIE_DUSTER);
  assert.equal(getPlayableCard(HEAVY_STORM)?.englishName,'Heavy Storm');
  assert.equal(getPlayableCard(HARPIE_DUSTER)?.englishName,"Harpie's Feather Duster");
  assert.deepEqual(heavy,{kind:'destroySpellTraps',scope:'all'});
  assert.deepEqual(harpie,{kind:'destroySpellTraps',scope:'opponent'});
  assert.deepEqual(getActivationModel(heavy),{speed:1,window:'main',damage:'never'});
  assert.deepEqual(getActivationModel(harpie),{speed:1,window:'main',damage:'never'});
});

test('Heavy Storm destroys both teams shared backrows and Field Zones, preserving monsters and physical UIDs',()=>{
  const f=fixture(HEAVY_STORM),state=f.state;
  const before=snapshot(state);
  const hidden=[f.alliedSet0,f.opponentSet0,f.alliedSet2,f.opponentSet2];
  assertHidden(JSON.stringify(tag.publicTagDuel(state)),hidden);
  const monsterUids=state.core.players.map(team=>team.monsters.map(monster=>monster.uid));

  state=settle(act(state,0,'spell',action=>action.card===f.spell.uid));

  assert.deepEqual(state.core.players.map(team=>team.backrow),[[],[]],'Heavy Storm must destroy Set cards from both teams');
  assert.deepEqual(state.core.players.map(team=>team.field),[null,null],'Heavy Storm must destroy both shared Field Zones');
  assert.deepEqual(state.core.players.map(team=>team.monsters.map(monster=>monster.uid)),monsterUids,'Heavy Storm must not affect monsters');
  for(const card of [f.alliedSet0,f.alliedSet2,f.alliedField])assert.ok(inGrave(state,0,card),'team 0 physical cards must enter its shared Graveyard: '+card.uid);
  for(const card of [f.opponentSet0,f.opponentSet2,f.opponentField])assert.ok(inGrave(state,1,card),'team 1 physical cards must enter its shared Graveyard: '+card.uid);
  assert.ok(inGrave(state,0,f.spell),'Heavy Storm itself must enter the activating team Graveyard');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Harpie\'s Feather Duster destroys only the opposing team backrow and Field Zone',()=>{
  const f=fixture(HARPIE_DUSTER),state=f.state;
  const before=snapshot(state);
  const hidden=[f.alliedSet0,f.opponentSet0,f.alliedSet2,f.opponentSet2];
  assertHidden(JSON.stringify(tag.publicTagDuel(state)),hidden);
  const monsterUids=state.core.players.map(team=>team.monsters.map(monster=>monster.uid));

  state=settle(act(state,0,'spell',action=>action.card===f.spell.uid));

  assert.deepEqual(state.core.players[0].backrow.map(card=>card.uid),[f.alliedSet0.uid,f.alliedSet2.uid],'the activating team backrow must survive');
  assert.equal(state.core.players[0].field?.uid,f.alliedField.uid,'the activating team Field Zone must survive');
  assert.deepEqual(state.core.players[1].backrow,[],'both opposing physical members share the affected backrow');
  assert.equal(state.core.players[1].field,null,'the opposing shared Field Zone must be destroyed');
  assert.deepEqual(state.core.players.map(team=>team.monsters.map(monster=>monster.uid)),monsterUids,'the monster fields must remain untouched');
  for(const card of [f.opponentSet0,f.opponentSet2,f.opponentField])assert.ok(inGrave(state,1,card),'opposing physical cards must enter the opposing shared Graveyard: '+card.uid);
  for(const card of [f.alliedSet0,f.alliedSet2,f.alliedField])assert.ok(!inGrave(state,0,card),'allied backrow/Field cards must not be destroyed');
  assert.ok(inGrave(state,0,f.spell),'Harpie\'s Feather Duster itself must enter the activating team Graveyard');
  const publicAfter=JSON.stringify(tag.publicTagDuel(state));
  assertHidden(publicAfter,[f.alliedSet0,f.alliedSet2]);
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
