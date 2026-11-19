'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m306-kishido-spirit-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const KISHIDO='60519422';
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&entry.card.atk>0);
const byAtk=new Map();
for(const entry of NORMALS){
  const group=byAtk.get(entry.card.atk)||[];
  group.push(entry);
  byAtk.set(entry.card.atk,group);
}
const EQUAL_PAIR=[...byAtk.values()].find(group=>group.length>=2)?.slice(0,2);
assert.ok(EQUAL_PAIR,'the certified Normal pool must contain two distinct monsters with equal positive ATK');
assert.notEqual(EQUAL_PAIR[0].id,EQUAL_PAIR[1].id);
assert.equal(EQUAL_PAIR[0].card.atk,EQUAL_PAIR[1].card.atk);
assert.equal(getPlayableCard(KISHIDO)?.englishName,'Kishido Spirit');
assert.equal(getPlayableCard(KISHIDO)?.kind,'spell');
assert.equal(getCardStatus(KISHIDO)?.stage,'certified');
assert.equal(getEffect(KISHIDO)?.kind,'continuous');
assert.deepEqual(getEffect(KISHIDO)?.rules,[{
  kind:'combat',
  filter:{controller:'source'},
  rule:{kind:'indestructible',equalAtk:true}
}]);

function member(seat){return 'm306-seat-'+seat;}
function deck(required=[],includeKishido=false){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  if(includeKishido)ids.unshift(KISHIDO);
  const result=[...new Set(ids)].slice(0,20);
  assert.equal(result.length,20,'each physical member must start with a legal 20-card Main Deck');
  for(const id of required)assert.ok(result.includes(id),'required physical card missing from deck: '+id);
  if(includeKishido)assert.ok(result.includes(KISHIDO));
  return result;
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
  throw new Error('M306 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,entry){
  const card=takePhysical(state,seat,entry.id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function assertRules(state){
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  for(const team of state.core.players){
    assert.ok(team.monsters.length<=3);
    assert.ok(team.backrow.length<=3);
    assert.ok((team.extra??[]).length<=5);
  }
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'equal-ATK battle must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function interaction(record,userId,index,requestId,actionOwner=userId){
  const calls=[];
  return {
    id:requestId,guildId:record.guild,user:{id:userId},
    customId:'tag:act:'+record.id+':'+record.revision+':'+actionOwner,
    values:[String(index)],isButton:()=>false,isStringSelectMenu:()=>true,
    deferUpdate:async()=>{
      assert.equal(store.getTag(record.id).revision,record.revision);
      calls.push('defer');
    },
    editReply:async payload=>{calls.push('edit');validateDiscordPayload(payload);},
    calls
  };
}
async function submit(record,actor,index,requestId){
  const panel=tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(panel);
  const components=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  const menu=components.find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu,'the actual private Discord panel must expose the action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the Discord menu must contain the legal action index '+index);
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1);
  return store.getTag(record.id);
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m306-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario){
  const required=[[],[],[],[]];
  required[scenario.attackerSeat].push(EQUAL_PAIR[0].id);
  required[scenario.targetSeat].push(EQUAL_PAIR[1].id);
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({
    id,name:'M306 Seat '+seat,cards:deck(required[seat],seat===0)
  }));
  const state=tag.createTagDuel(players,{
    classic:true,first:0,seed:'m306-kishido-'+scenario.id
  });
  state.core.turn=3;
  const source=takePhysical(state,0,KISHIDO);
  state.core.players[0].backrow.push({
    ...source,faceUp:scenario.sourceFaceUp,resolved:scenario.sourceFaceUp,setTurn:0
  });
  const attacker=placeMonster(state,scenario.attackerSeat,EQUAL_PAIR[0]);
  const target=placeMonster(state,scenario.targetSeat,EQUAL_PAIR[1]);
  assert.match(source.uid,/^m0:/);
  assert.match(attacker.uid,new RegExp('^m'+scenario.attackerSeat+':'));
  assert.match(target.uid,new RegExp('^m'+scenario.targetSeat+':'));
  assert.equal(attacker.owner,scenario.attackerSeat%2);
  assert.equal(target.owner,scenario.targetSeat%2);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const beforeLP=state.core.players.map(team=>team.lp);
  const id='m306-kishido-'+scenario.id;
  const guild='m306-guild',channel='m306-channel';
  const members=ids.map((id,seat)=>({id,name:'M306 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {
    id,ids,before,beforeLP,source,attacker,target,
    attackerSeat:scenario.attackerSeat,targetSeat:scenario.targetSeat,
    record:store.getTag(id),scenario
  };
}
async function endTurn(record,actor,suffix){
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='end');
  assert.ok(index>=0,'the current representative must receive the End Phase action');
  const current=await submit(record,actor,index,'m306-'+suffix+'-end');
  return settleResponses(current,suffix+'-end');
}
async function enterBattle(record,actor,suffix){
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active physical teammate must receive the Battle Phase action');
  const current=await submit(record,actor,index,'m306-'+suffix+'-battle');
  return settleResponses(current,suffix+'-battle');
}
async function rejectInactivePartner(record,partner,actor,index,suffix){
  assert.deepEqual(tag.tagActions(record.state,member(partner)),[],
    'the inactive physical partner cannot submit the active teammate attack');
  const forged=interaction(record,member(partner),index,'m306-'+suffix+'-forged',member(actor));
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[],'forged partner action must be rejected before defer');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'rejected partner action must not mutate the duel');
}
function assertPublicPayload(record){
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(record.state)){
    assert.ok(!rendered.includes(card.uid),'public Discord payload leaked physical UID '+card.uid);
  }
}
async function resolveScenario(fixture){
  let current=fixture.record;
  current=await endTurn(current,member(0),fixture.scenario.id+'-team0');
  if(fixture.attackerSeat===2){
    assert.equal(tag.tagDecisionMember(current.state).id,member(1),
      'team 1 must receive its turn after team 0');
    current=await endTurn(current,member(1),fixture.scenario.id+'-team1');
  }
  assert.equal(tag.tagDecisionMember(current.state).id,member(fixture.attackerSeat),
    'the intended physical teammate must control the Discord attack');
  current=await enterBattle(current,member(fixture.attackerSeat),fixture.scenario.id);
  const actions=tag.tagActions(current.state,member(fixture.attackerSeat));
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.target.uid
  );
  assert.ok(index>=0,'the Discord action menu must expose the intended equal-ATK battle');
  const partner=fixture.attackerSeat===0?2:fixture.attackerSeat===2?0:
    fixture.attackerSeat===1?3:1;
  await rejectInactivePartner(current,partner,fixture.attackerSeat,index,fixture.scenario.id);
  current=await submit(current,member(fixture.attackerSeat),index,'m306-'+fixture.scenario.id+'-attack');
  return settleResponses(current,fixture.scenario.id+'-attack');
}
function assertOutcome(fixture,current){
  const teams=current.state.core.players;
  const sourceActive=fixture.scenario.sourceFaceUp;
  const team0Protected=sourceActive;
  const team0Card=fixture.attackerSeat%2===0?fixture.attacker:fixture.target;
  const team1Card=fixture.attackerSeat%2===1?fixture.attacker:fixture.target;
  if(team0Protected){
    assert.ok(teams[0].monsters.some(card=>card.uid===team0Card.uid&&card.id===team0Card.id),
      'Kishido Spirit must protect the team-0 monster, including a partner-owned monster');
    assert.ok(teams[1].grave.some(card=>card.uid===team1Card.uid&&card.id===team1Card.id),
      'the opposing equal-ATK monster must still be destroyed');
  }else{
    assert.ok(teams[0].grave.some(card=>card.uid===team0Card.uid&&card.id===team0Card.id),
      'a face-down Kishido Spirit must not protect the team-0 monster');
    assert.ok(teams[1].grave.some(card=>card.uid===team1Card.uid&&card.id===team1Card.id),
      'the opposing equal-ATK monster must also be destroyed when the source is inactive');
  }
  assert.equal(teams[0].lp,fixture.beforeLP[0]);
  assert.equal(teams[1].lp,fixture.beforeLP[1]);
  assert.equal(teams[0].backrow.some(card=>card.uid===fixture.source.uid&&card.id===KISHIDO),true);
  const sourceNow=teams[0].backrow.find(card=>card.uid===fixture.source.uid);
  assert.equal(sourceNow.faceUp,sourceActive);
  assert.equal(sourceNow.resolved,sourceActive);
  assertPublicPayload(current);
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
}
const SCENARIOS=[
  {id:'protect-partner-owned-defender',attackerSeat:1,targetSeat:0,sourceFaceUp:true},
  {id:'protect-active-partner-attacker',attackerSeat:2,targetSeat:3,sourceFaceUp:true},
  {id:'face-down-source-does-not-protect',attackerSeat:1,targetSeat:0,sourceFaceUp:false}
];
for(const scenario of SCENARIOS){
  test('Kishido Spirit Discord 2v2: '+scenario.id,async()=>{
    const fixture=setup(scenario);
    const current=await resolveScenario(fixture);
    assertOutcome(fixture,current);
  });
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
