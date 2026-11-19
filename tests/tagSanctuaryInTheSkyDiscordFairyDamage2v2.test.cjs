'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m305-sanctuary-sky-'));
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

const SANCTUARY='56433456';
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'the isolated Discord fixture needs at least twenty certified Normal Monsters');
const FAIRY=NORMALS.filter(entry=>entry.card.race==='Fairy')
  .sort((a,b)=>a.card.atk-b.card.atk)[0];
const NON_FAIRY=NORMALS.filter(entry=>entry.card.race!=='Fairy');
const STRONG=NON_FAIRY.slice().sort((a,b)=>b.card.atk-a.card.atk)[0];
const WEAK_NON_FAIRY=NON_FAIRY.filter(entry=>entry.id!==STRONG.id)
  .sort((a,b)=>a.card.atk-b.card.atk)[0];

assert.ok(FAIRY,'the certified Normal pool must contain a Fairy-Type monster');
assert.ok(STRONG&&WEAK_NON_FAIRY,'the certified Normal pool must contain two distinct non-Fairy monsters');
assert.ok(STRONG.card.atk>FAIRY.card.atk,'the test attacker must defeat the Fairy in ATK position');
assert.ok(STRONG.card.atk>WEAK_NON_FAIRY.card.atk,'the control attack must cause positive battle damage');
assert.equal(getPlayableCard(SANCTUARY)?.englishName,'The Sanctuary in the Sky');
assert.equal(getPlayableCard(SANCTUARY)?.kind,'spell');
assert.equal(getCardStatus(SANCTUARY)?.stage,'certified');
assert.equal(getEffect(SANCTUARY)?.kind,'field');
assert.deepEqual(getEffect(SANCTUARY)?.rules,[{
  kind:'combat',
  filter:{races:['Fairy']},
  rule:{kind:'damage',mode:'zero',when:'battle'}
}]);

function member(seat){return 'm305-seat-'+seat;}
function deck(required=[],includeSanctuary=false){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  if(includeSanctuary)ids.unshift(SANCTUARY);
  const result=[...new Set(ids)].slice(0,20);
  assert.equal(result.length,20,'each physical member must start with a legal 20-card Main Deck');
  for(const id of required)assert.ok(result.includes(id),'required physical card missing from deck: '+id);
  if(includeSanctuary)assert.ok(result.includes(SANCTUARY));
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
  throw new Error('M305 physical card missing from seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'battle resolution must conserve all physical cards');
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
    current=await submit(current,actor,pass,'m305-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario){
  const required=[[],[],[],[]];
  required[scenario.attackerSeat].push(STRONG.id);
  required[scenario.targetSeat].push(scenario.target.id);
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({
    id,name:'M305 Seat '+seat,cards:deck(required[seat],seat===0)
  }));
  const state=tag.createTagDuel(players,{
    classic:true,first:0,seed:'m305-sanctuary-'+scenario.id
  });
  state.core.turn=3;
  const fieldCard=takePhysical(state,0,SANCTUARY);
  state.core.players[0].hand.push(fieldCard);
  const attacker=placeMonster(state,scenario.attackerSeat,STRONG);
  const target=placeMonster(state,scenario.targetSeat,scenario.target);
  assert.match(fieldCard.uid,/^m0:/);
  assert.match(attacker.uid,new RegExp('^m'+scenario.attackerSeat+':'));
  assert.match(target.uid,new RegExp('^m'+scenario.targetSeat+':'));
  assert.equal(attacker.owner,scenario.attackerSeat%2);
  assert.equal(target.owner,scenario.targetSeat%2);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const beforeLP=state.core.players.map(team=>team.lp);
  const id='m305-sanctuary-'+scenario.id;
  const guild='m305-guild',channel='m305-channel';
  const members=ids.map((id,seat)=>({id,name:'M305 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {
    id,ids,before,beforeLP,fieldCard,attacker,target,
    attackerSeat:scenario.attackerSeat,targetSeat:scenario.targetSeat,
    record:store.getTag(id),scenario
  };
}
async function activateSanctuary(fixture){
  let current=fixture.record;
  const actor=member(0);
  const actions=tag.tagActions(current.state,actor);
  const index=actions.findIndex(action=>action.kind==='field'&&action.card===fixture.fieldCard.uid);
  assert.ok(index>=0,'the active physical owner must see The Sanctuary in the Sky in the private field-spell menu');
  current=await submit(current,actor,index,'m305-'+fixture.scenario.id+'-activate-field');
  current=await settleResponses(current,fixture.scenario.id+'-field');
  const field=current.state.core.players[0].field;
  assert.ok(field&&field.uid===fixture.fieldCard.uid&&field.id===SANCTUARY);
  assert.equal(field.faceUp,true);
  assert.equal(field.resolved,true,'the field effect must be active after its response window');
  return current;
}
async function endTurn(record,actor,suffix){
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='end');
  assert.ok(index>=0,'the current representative must receive the End Phase action');
  const current=await submit(record,actor,index,'m305-'+suffix+'-end');
  return settleResponses(current,suffix+'-end');
}
async function enterBattle(record,actor,suffix){
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active physical teammate must receive the Battle Phase action');
  const current=await submit(record,actor,index,'m305-'+suffix+'-battle');
  return settleResponses(current,suffix+'-battle');
}
async function rejectInactivePartner(record,partner,actor,index,suffix){
  assert.deepEqual(tag.tagActions(record.state,member(partner)),[],
    'the inactive physical partner cannot submit the active teammate attack');
  const forged=interaction(record,member(partner),index,'m305-'+suffix+'-forged',member(actor));
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
  let current=await activateSanctuary(fixture);
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
  assert.ok(index>=0,'the Discord action menu must expose the shared-field attack');
  const partner=fixture.attackerSeat===0?2:fixture.attackerSeat===2?0:
    fixture.attackerSeat===1?3:1;
  await rejectInactivePartner(current,partner,fixture.attackerSeat,index,fixture.scenario.id);
  current=await submit(current,member(fixture.attackerSeat),index,'m305-'+fixture.scenario.id+'-attack');
  return settleResponses(current,fixture.scenario.id+'-attack');
}
function assertOutcome(fixture,current){
  const attackerTeam=fixture.attackerSeat%2,targetTeam=fixture.targetSeat%2;
  const attackerInfo=getPlayableCard(STRONG.id);
  const targetInfo=getPlayableCard(fixture.scenario.target.id);
  const teams=current.state.core.players;
  assert.equal(teams[targetTeam].grave.some(card=>card.uid===fixture.target.uid&&card.id===fixture.target.id),true,
    'the losing Fairy/non-Fairy monster must still be destroyed by battle');
  assert.ok(!teams[targetTeam].monsters.some(card=>card.uid===fixture.target.uid),
    'the losing monster must leave the shared Monster Zone');
  assert.ok(teams[attackerTeam].monsters.some(card=>card.uid===fixture.attacker.uid&&card.id===STRONG.id),
    'the winning attacker must remain on its team field');
  assert.equal(teams[0].field?.uid,fixture.fieldCard.uid);
  assert.equal(teams[0].field?.faceUp,true);
  assert.equal(teams[0].field?.resolved,true);
  const expectedDamage=fixture.scenario.protected?0:attackerInfo.atk-targetInfo.atk;
  assert.equal(fixture.beforeLP[targetTeam]-teams[targetTeam].lp,expectedDamage,
    fixture.scenario.protected?
      'The Sanctuary must zero battle damage to the controller of the Fairy monster':
      'the non-Fairy control must retain ordinary battle damage');
  assert.equal(teams[attackerTeam].lp,fixture.beforeLP[attackerTeam],
    'the winning attacker team must not receive battle damage');
  assertPublicPayload(current);
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
}
const SCENARIOS=[
  {
    id:'protect-team0-fairy',attackerSeat:1,targetSeat:0,target:FAIRY,
    protected:true
  },
  {
    id:'protect-team1-fairy',attackerSeat:2,targetSeat:3,target:FAIRY,
    protected:true
  },
  {
    id:'non-fairy-control',attackerSeat:1,targetSeat:0,target:WEAK_NON_FAIRY,
    protected:false
  }
];
for(const scenario of SCENARIOS){
  test('The Sanctuary in the Sky Discord 2v2: '+scenario.id,async()=>{
    const fixture=setup(scenario);
    const current=await resolveScenario(fixture);
    assertOutcome(fixture,current);
  });
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
