'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,enabledCardIds}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const RYU='57281778'; // Ryu Kokki: Warrior/Spellcaster identity
const GETSU='21887179'; // Getsu Fuhma: Fiend/Zombie identity
const SPIDER='45688586'; // Karakuri Spider: attacking DARK target
const normal=tag.tagNormalCardIds.map(id=>getPlayableCard(id)).filter(card=>card&&Number.isInteger(card.atk)&&Number.isInteger(card.defense));
const ryuPositive=normal.filter(card=>['Warrior','Spellcaster'].includes(card.race)&&card.atk>0&&card.atk<=2000).sort((a,b)=>b.atk-a.atk)[0];
const ryuNegative=normal.filter(card=>!['Warrior','Spellcaster'].includes(card.race)&&card.atk>0&&card.atk<=2000).sort((a,b)=>b.atk-a.atk)[0];
const karakuriDark=normal.filter(card=>card.attribute==='DARK'&&card.defense>400).sort((a,b)=>a.defense-b.defense)[0];
const karakuriLight=normal.filter(card=>card.attribute==='LIGHT'&&card.defense>400).sort((a,b)=>a.defense-b.defense)[0];
const all=enabledCardIds.map(id=>getPlayableCard(id)).filter(card=>card&&card.kind==='monster'&&!card.fusion&&card.monsterType!=='fusion'&&card.monsterType!=='ritual');
const getsuPositive=all.filter(card=>{
  if(!['Fiend','Zombie'].includes(card.race)||card.defense<=1700)return false;
  const effect=getMonsterEffect(card.id);
  return !effect||effect.trigger==='flip';
}).sort((a,b)=>a.defense-b.defense)[0];
const getsuNegative=normal.filter(card=>!['Fiend','Zombie'].includes(card.race)&&card.defense>1700).sort((a,b)=>a.defense-b.defense)[0];
assert.ok(ryuPositive&&ryuNegative,'Ryu Kokki fixtures need matching and non-matching Normal Monsters');
assert.ok(getsuPositive&&getsuNegative,'Getsu Fuhma fixtures need Fiend/Zombie and non-matching high-DEF monsters');
assert.ok(karakuriDark&&karakuriLight,'Karakuri Spider fixtures need DARK and LIGHT high-DEF Normal Monsters');

const fixtureIds=[...new Set([
  RYU,GETSU,SPIDER,
  ryuPositive.id,ryuNegative.id,getsuPositive.id,getsuNegative.id,karakuriDark.id,karakuriLight.id,
  ...tag.tagNormalCardIds
])].slice(0,20);
assert.equal(fixtureIds.length,20);

function game(first,seed){
  const state=tag.createTagDuel(
    [0,1,2,3].map(seat=>({id:'m94-seat-'+seat,name:'M94 Seat '+seat,cards:fixtureIds})),
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
  throw new Error('M94 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position){
  const card=take(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function act(state,seat,kind,filter=()=>true){
  const member='m94-seat-'+seat;
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
function assertTargetResult(state,source,target,expectedDestroyed){
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid),'source must remain on its shared team field');
  const inGrave=state.core.players[1].grave.some(card=>card.uid===target.uid);
  const onField=state.core.players[1].monsters.some(card=>card.uid===target.uid);
  assert.equal(inGrave,expectedDestroyed,'target destruction must follow the exact race/attribute filter');
  assert.equal(onField,!expectedDestroyed,'non-matching target must remain on the shared field');
  tag.assertTagDuel(state);
}

for(const [targetId,expected] of [[ryuPositive.id,true],[ryuNegative.id,false]])test('Ryu Kokki destroys only a battled Warrior/Spellcaster in 2v2 (target '+targetId+')',()=>{
  let state=game(1,'m94-ryu-'+targetId);
  const source=deploy(state,0,RYU,'def');
  const target=deploy(state,1,targetId,'atk');
  assert.ok(getPlayableCard(target.id).atk<=2000,'target must survive ordinary battle against Ryu Kokki DEF');
  const before=snapshot(state);

  state=startBattle(state,1);
  state=attack(state,1,target.uid,source.uid);

  assertTargetResult(state,source,target,expected);
  assertConserved(state,before);
});

for(const [targetId,expected] of [[getsuPositive.id,true],[getsuNegative.id,false]])test('Getsu Fuhma destroys only a battled Fiend/Zombie in 2v2 (target '+targetId+')',()=>{
  let state=game(0,'m94-getsu-'+targetId);
  const source=deploy(state,2,GETSU,'atk');
  const target=deploy(state,1,targetId,'def');
  assert.ok(getPlayableCard(target.id).defense>1700,'target must survive ordinary battle against Getsu Fuhma');
  const before=snapshot(state);

  state=startBattle(state,0);
  state=attack(state,0,source.uid,target.uid);

  assertTargetResult(state,source,target,expected);
  assertConserved(state,before);
});

for(const [targetId,expected] of [[karakuriDark.id,true],[karakuriLight.id,false]])test('Karakuri Spider destroys only a DARK monster it attacks in 2v2 (target '+targetId+')',()=>{
  let state=game(0,'m94-spider-'+targetId);
  const source=deploy(state,2,SPIDER,'atk');
  const target=deploy(state,1,targetId,'def');
  assert.ok(getPlayableCard(target.id).defense>400,'target must survive ordinary battle against Karakuri Spider');
  const before=snapshot(state);

  state=startBattle(state,0);
  state=attack(state,0,source.uid,target.uid);

  assertTargetResult(state,source,target,expected);
  assertConserved(state,before);
});
