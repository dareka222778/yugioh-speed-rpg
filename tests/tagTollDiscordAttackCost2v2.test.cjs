'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m308-toll-'));
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

const TOLL='82003859';
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&entry.card.atk>0);
const ATTACKER=NORMALS.filter(entry=>entry.card.atk>=1500&&entry.card.atk<=1800)
  .sort((a,b)=>b.card.atk-a.card.atk)[0]||NORMALS.slice().sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(ATTACKER,'a certified Normal attacker is required');
assert.equal(getPlayableCard(TOLL)?.englishName,'Toll');
assert.equal(getCardStatus(TOLL)?.stage,'certified');
assert.equal(getEffect(TOLL)?.kind,'continuous');
assert.deepEqual(getEffect(TOLL)?.rules,[{
  kind:'combat',
  filter:{},
  rule:{kind:'attackLP',amount:500,playerRule:true}
}]);

function member(seat){return 'm308-seat-'+seat;}
function deck(required=[],tollCount=0){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  for(let i=0;i<tollCount;i++)ids.unshift(TOLL);
  const result=[...new Set(ids)].slice(0,20);
  assert.equal(result.length,20,'each physical member must start with a legal 20-card Main Deck');
  for(const id of required)assert.ok(result.includes(id),'required physical card missing from deck: '+id);
  if(tollCount)assert.ok(result.includes(TOLL));
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
  throw new Error('M308 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat){
  const card=takePhysical(state,seat,ATTACKER.id);
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
  assert.equal(cards.length,before.size,'attack-cost resolution must conserve all physical cards');
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
    current=await submit(current,actor,pass,'m308-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario){
  const required=[[],[],[],[]];
  required[scenario.attackerSeat].push(ATTACKER.id);
  const tollCount=[0,0,0,0];
  tollCount[0]=1;
  if(scenario.twoTolls)tollCount[1]=1;
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({
    id,name:'M308 Seat '+seat,cards:deck(required[seat],tollCount[seat])
  }));
  const state=tag.createTagDuel(players,{
    classic:true,first:0,seed:'m308-toll-'+scenario.id
  });
  state.core.turn=3;
  const sources=[];
  for(const seat of [0,1]){
    if(!tollCount[seat])continue;
    const source=takePhysical(state,seat,TOLL);
    state.core.players[seat%2].backrow.push({
      ...source,faceUp:true,resolved:true,setTurn:0
    });
    sources.push({seat,source});
  }
  const attacker=placeMonster(state,scenario.attackerSeat);
  const attackerTeam=scenario.attackerSeat%2;
  if(scenario.lp!==undefined)state.core.players[attackerTeam].lp=scenario.lp;
  assert.match(attacker.uid,new RegExp('^m'+scenario.attackerSeat+':'));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const beforeLP=state.core.players.map(team=>team.lp);
  const id='m308-toll-'+scenario.id;
  const guild='m308-guild',channel='m308-channel';
  const members=ids.map((id,seat)=>({id,name:'M308 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,ids,before,beforeLP,sources,attacker,attackerTeam,record:store.getTag(id),scenario};
}
async function endTurn(record,actor,suffix){
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='end');
  assert.ok(index>=0,'the current representative must receive the End Phase action');
  const current=await submit(record,actor,index,'m308-'+suffix+'-end');
  return settleResponses(current,suffix+'-end');
}
async function enterBattle(record,actor,suffix){
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active physical teammate must receive the Battle Phase action');
  const current=await submit(record,actor,index,'m308-'+suffix+'-battle');
  return settleResponses(current,suffix+'-battle');
}
async function resolveScenario(fixture){
  let current=await endTurn(fixture.record,member(0),fixture.scenario.id+'-team0');
  if(fixture.attacker.uid.startsWith('m2:')){
    assert.equal(tag.tagDecisionMember(current.state).id,member(1));
    current=await endTurn(current,member(1),fixture.scenario.id+'-team1');
  }
  const actor=member(fixture.scenario.attackerSeat);
  assert.equal(tag.tagDecisionMember(current.state).id,actor);
  current=await enterBattle(current,actor,fixture.scenario.id);
  const actions=tag.tagActions(current.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&!action.target
  );
  if(fixture.scenario.insufficientLP){
    assert.equal(index,-1,'an attack must not be offered when the team cannot pay the Toll cost');
    const panel=tagPrivateMessage(current,actor,0);
    validateDiscordPayload(panel);
    assert.ok(tag.tagActions(current.state,actor).every(action=>action.kind!=='attack'));
    return current;
  }
  assert.ok(index>=0,'the Discord menu must expose the direct attack when the team can pay the Toll cost');
  const partner=fixture.scenario.attackerSeat===0?2:fixture.scenario.attackerSeat===2?0:
    fixture.scenario.attackerSeat===1?3:1;
  assert.deepEqual(tag.tagActions(current.state,member(partner)),[]);
  const forged=interaction(current,member(partner),index,'m308-'+fixture.scenario.id+'-forged',actor);
  const unchanged=JSON.stringify(current.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(current.id).revision,current.revision);
  assert.equal(JSON.stringify(store.getTag(current.id).state),unchanged);
  current=await submit(current,actor,index,'m308-'+fixture.scenario.id+'-attack');
  assert.equal(current.state.core.phase,'response','the attack cost must be paid at declaration before the response window');
  const expectedCost=fixture.scenario.twoTolls?1000:500;
  assert.equal(fixture.beforeLP[fixture.attackerTeam]-current.state.core.players[fixture.attackerTeam].lp,expectedCost);
  return settleResponses(current,fixture.scenario.id+'-attack');
}
function assertPublicPayload(record){
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(record.state)){
    assert.ok(!rendered.includes(card.uid),'public Discord payload leaked physical UID '+card.uid);
  }
}
function assertOutcome(fixture,current){
  const teams=current.state.core.players;
  if(fixture.scenario.insufficientLP){
    assert.deepEqual(teams.map(team=>team.lp),fixture.beforeLP);
    assert.ok(teams[fixture.attackerTeam].monsters.some(card=>card.uid===fixture.attacker.uid));
  }else{
    const cost=fixture.scenario.twoTolls?1000:500;
    const defenderTeam=1-fixture.attackerTeam;
    assert.equal(fixture.beforeLP[fixture.attackerTeam]-teams[fixture.attackerTeam].lp,cost);
    assert.equal(fixture.beforeLP[defenderTeam]-teams[defenderTeam].lp,ATTACKER.card.atk,
      'the direct-attack damage must remain separate from the Toll payment');
    assert.ok(teams[fixture.attackerTeam].monsters.some(card=>card.uid===fixture.attacker.uid));
  }
  for(const {seat,source} of fixture.sources){
    const backrow=teams[seat%2].backrow.find(card=>card.uid===source.uid);
    assert.ok(backrow&&backrow.id===TOLL&&backrow.faceUp&&backrow.resolved);
  }
  assertPublicPayload(current);
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
}
const SCENARIOS=[
  {id:'opponent-team-pays-one-toll',attackerSeat:1,twoTolls:false},
  {id:'source-team-partner-pays-one-toll',attackerSeat:2,twoTolls:false},
  {id:'two-tolls-stack',attackerSeat:1,twoTolls:true},
  {id:'exactly-500-lp-cannot-attack',attackerSeat:1,twoTolls:false,lp:500,insufficientLP:true}
];
for(const scenario of SCENARIOS){
  test('Toll Discord 2v2: '+scenario.id,async()=>{
    const fixture=setup(scenario);
    const current=await resolveScenario(fixture);
    assertOutcome(fixture,current);
  });
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
