'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard}=require('../dist/effectRegistry');

const sources=[
  {id:'48148828',name:'D.D. Crazy Beast',atk:1400},
  {id:'16475472',name:'Lesser Fiend',atk:2100}
];
const normalCards=tag.tagNormalCardIds.map(id=>getPlayableCard(id)).filter(card=>card&&Number.isInteger(card.atk)&&Number.isInteger(card.defense));
const targets=sources.map(source=>normalCards.filter(card=>card.atk<source.atk).sort((a,b)=>b.atk-a.atk)[0]);
const highDefense=normalCards.filter(card=>card.defense>2100).sort((a,b)=>a.defense-b.defense)[0];
assert.ok(targets.every(Boolean),'each banish-victim monster needs a weaker Normal Monster');
assert.ok(highDefense,'the negative fixture needs a Normal Monster with DEF above 2100');
const pool=[...new Set([...targets.map(card=>card.id),highDefense.id,...tag.tagNormalCardIds])].slice(0,18);
const deckIds=[...sources.map(source=>source.id),...pool].slice(0,20);
assert.equal(deckIds.length,20);

function game(first,seed){
  const state=tag.createTagDuel(
    [0,1,2,3].map(seat=>({id:'m93-seat-'+seat,name:'M93 Seat '+seat,cards:deckIds})),
    {classic:true,first,seed}
  );
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  return state;
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function take(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M93 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position){
  const card=take(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function act(state,seat,kind,filter=()=>true){
  const member='m93-seat-'+seat;
  const action=tag.tagActions(state,member).find(candidate=>candidate.kind===kind&&filter(candidate));
  assert.ok(action,'seat '+seat+' needs '+kind+' in '+state.core.phase);
  return tag.stepTagDuel(state,member,action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'response chain did not terminate');
    const member=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,member).find(action=>action.kind==='pass');
    assert.ok(pass,'current responder must have a legal pass');
    state=tag.stepTagDuel(state,member,pass);
  }
  return state;
}
function startBattle(state,seat){return settle(act(state,seat,'battle'));}
function attack(state,seat,source,target){return settle(act(state,seat,'attack',a=>a.card===source&&a.target===target));}
function snapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id);
}

for(let i=0;i<sources.length;i++)for(const first of [0,2])test(sources[i].name+' banishes a destroyed monster from inactive opponent physical seat '+((first+3)%4),()=>{
  const sourceDef=sources[i];
  const targetDef=targets[i];
  const sourceSeat=(first+2)%4;
  const targetSeat=(first+3)%4;
  let state=game(first,'m93-banish-'+sourceDef.id+'-'+first);
  const source=deploy(state,sourceSeat,sourceDef.id,'atk');
  const target=deploy(state,targetSeat,targetDef.id,'atk');
  const sourceAtk=engine.atk(source,state.core);
  const targetAtk=engine.atk(target,state.core);
  assert.ok(sourceAtk>targetAtk);
  assert.match(source.uid,new RegExp('^m'+sourceSeat+':'));
  assert.match(target.uid,new RegExp('^m'+targetSeat+':'));
  tag.assertTagDuel(state);
  const before=snapshot(state);

  state=startBattle(state,first);
  state=attack(state,first,source.uid,target.uid);

  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid),'the continuous source must survive');
  assert.ok(state.core.players[1].banished.some(card=>card.uid===target.uid),'the destroyed victim must be banished instead of sent to the Graveyard');
  assert.ok(!state.core.players[1].grave.some(card=>card.uid===target.uid));
  assert.equal(state.core.players[1].lp,4000-(sourceAtk-targetAtk));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

for(const sourceDef of sources)test(sourceDef.name+' does not banish a monster that survives battle',()=>{
  let state=game(0,'m93-banish-negative-'+sourceDef.id);
  const source=deploy(state,2,sourceDef.id,'atk');
  const target=deploy(state,3,highDefense.id,'def');
  const sourceAtk=engine.atk(source,state.core);
  assert.ok(highDefense.defense>sourceAtk);
  const before=snapshot(state);

  state=startBattle(state,0);
  state=attack(state,0,source.uid,target.uid);

  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===target.uid));
  assert.ok(!state.core.players[1].banished.some(card=>card.uid===target.uid));
  assert.ok(!state.core.players[1].grave.some(card=>card.uid===target.uid));
  assert.equal(state.core.players[0].lp,4000-(highDefense.defense-sourceAtk));
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
