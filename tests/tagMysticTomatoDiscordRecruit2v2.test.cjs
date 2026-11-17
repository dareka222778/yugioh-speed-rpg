'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m293-mystic-tomato-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect,getMonsterDefinition}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const MYSTIC_TOMATO='83011277';
const SANGAN='26202165';
const CANNON_SOLDIER='11384280';
const NORMALS=[...new Set(tag.tagNormalCardIds)];
const SAFE_NORMALS=NORMALS.filter(id=>{
  const card=getPlayableCard(id);
  return card&&card.kind==='monster'&&card.monsterType==='normal'&&
    (card.attribute!=='DARK'||card.atk>1500);
});
const ATTACKER=SAFE_NORMALS.map(id=>({id,card:getPlayableCard(id)}))
  .find(entry=>entry.card&&entry.card.level<=4&&entry.card.atk>1400);
assert.ok(SAFE_NORMALS.length>=20,'the fixture needs twenty Normal Monsters outside the DARK/1500 recruiter range');
assert.ok(ATTACKER,'the battle fixture needs a Level 4-or-lower Normal Monster stronger than Mystic Tomato');
assert.equal(getPlayableCard(MYSTIC_TOMATO)?.englishName,'Mystic Tomato');
assert.equal(getPlayableCard(MYSTIC_TOMATO)?.atk,1400);
assert.equal(getPlayableCard(MYSTIC_TOMATO)?.attribute,'DARK');
assert.equal(getCardStatus(MYSTIC_TOMATO)?.stage,'certified');
assert.equal(getCardStatus(SANGAN)?.stage,'certified');
assert.equal(getCardStatus(CANNON_SOLDIER)?.stage,'certified');
assert.deepEqual(getMonsterEffect(MYSTIC_TOMATO),{
  trigger:'onBattleDestroyed',
  operation:{kind:'specialSummon',attribute:'DARK',maximumAtk:1500}
});
assert.equal(getMonsterDefinition(MYSTIC_TOMATO)?.activation.policy,'optional');

function member(seat){return 'm293-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...SAFE_NORMALS])];
  assert.ok(ids.length>=20,'each physical Deck must contain twenty unique cards');
  return ids.slice(0,20);
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
  throw new Error('M293 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,id,faceUp=true){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:faceUp?'atk':'def',faceUp,
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
  }
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical twenty-card Decks must contribute exactly eighty cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must remain unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function assertPublicPayload(record){
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(record.state)){
    assert.ok(!rendered.includes(card.uid),'public Discord payload leaked physical UID '+card.uid);
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
  const menu=components.find(component=>
    component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor
  );
  assert.ok(menu,'the active physical seat must receive a real private Discord action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private Discord panel must expose legal action index '+index);
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
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m293-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[],'inactive partner must be rejected before Discord acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the battle response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m293-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario,{includeCandidate=true,includePartnerDecoy=true}={}){
  const required=[[],[],[],[]];
  required[0].push(MYSTIC_TOMATO);
  if(includePartnerDecoy)required[0].push(CANNON_SOLDIER);
  if(includeCandidate)required[2].push(SANGAN);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M293 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:1,seed:'m293-'+scenario});
  state.core.turn=3;
  const tomato=placeMonster(state,0,MYSTIC_TOMATO,true);
  const attacker=placeMonster(state,1,ATTACKER.id,true);
  const candidate=holder(state,2).deck.find(card=>card.id===SANGAN)||null;
  const partnerDecoy=holder(state,0).deck.find(card=>card.id===CANNON_SOLDIER)||null;
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m293-'+scenario,guild='m293-guild',channel='m293-channel';
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M293 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor:member(1),tomato,attacker,candidate,partnerDecoy,before,record:store.getTag(id)};
}
async function enterBattle(fixture,record){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active opponent must see Battle Phase in the private Discord menu');
  return settleResponses(await submit(record,fixture.actor,index,'m293-'+fixture.id+'-battle'),fixture.id+'-battle');
}
async function attackTomato(fixture,record){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.tomato.uid
  );
  assert.ok(index>=0,'the active opponent must see the shared-field attack against Mystic Tomato');
  return settleResponses(await submit(record,fixture.actor,index,'m293-'+fixture.id+'-attack'),fixture.id+'-attack');
}
function assertBattleOutcome(fixture,record,recruited){
  const state=record.state;
  const damage=ATTACKER.card.atk-getPlayableCard(MYSTIC_TOMATO).atk;
  assert.equal(state.core.players[0].lp,4000-damage);
  assert.equal(state.core.players[1].lp,4000);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.tomato.uid&&card.id===MYSTIC_TOMATO));
  assert.ok(!state.core.players[0].monsters.some(card=>card.uid===fixture.tomato.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===fixture.attacker.uid));
  if(recruited){
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.candidate.uid&&card.id===SANGAN));
    assert.match(fixture.candidate.uid,/^m2:/,'the recruit must come from the active representative physical Deck');
    assert.ok(!holder(state,2).deck.some(card=>card.uid===fixture.candidate.uid));
    assert.ok(holder(state,0).deck.some(card=>card.uid===fixture.partnerDecoy.uid),
      'the inactive partner Deck must remain untouched');
  }else{
    if(fixture.candidate)assert.ok(holder(state,2).deck.some(card=>card.uid===fixture.candidate.uid));
    if(fixture.partnerDecoy)assert.ok(holder(state,0).deck.some(card=>card.uid===fixture.partnerDecoy.uid));
    assert.ok(!state.core.players[0].monsters.some(card=>card.id===SANGAN));
  }
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
async function activateTomato(fixture,record,suffix){
  assert.equal(record.state.core.phase,'choice');
  assert.equal(record.state.core.choice.source,'triggerOptional');
  const actor=tag.tagDecisionMember(record.state).id;
  assert.equal(actor,member(2),'the active representative of the defending team must receive the optional trigger');
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target===fixture.tomato.uid);
  assert.ok(index>=0,'the private Discord panel must offer the Tomato trigger');
  assert.ok(actions.some(action=>action.kind==='choose'&&action.target==='__skip__'),
    'the optional effect must expose a decline option');
  await rejectInactivePartner(record,actor,member(0),index,suffix);
  return submit(record,actor,index,'m293-'+suffix+'-activate');
}
async function recruitSangan(fixture,record,suffix){
  assert.equal(record.state.core.phase,'choice');
  assert.equal(record.state.core.choice.source,'monsterRecruit');
  assert.equal(tag.tagDecisionMember(record.state).id,member(2));
  const choices=tag.tagActions(record.state,member(2));
  const candidateIndex=choices.findIndex(action=>action.kind==='choose'&&action.target===fixture.candidate?.uid);
  assert.ok(candidateIndex>=0,'the active representative private panel must offer Sangan from its own Deck');
  assert.ok(!choices.some(action=>action.kind==='choose'&&action.target===fixture.partnerDecoy?.uid),
    'the inactive partner Deck must not leak into the recruiter options');
  assert.deepEqual(record.state.core.choice.targets,[fixture.candidate.uid]);
  return submit(record,member(2),candidateIndex,'m293-'+suffix+'-recruit');
}
test('battle-destroyed partner-owned Mystic Tomato recruits only from the active representative Deck through Discord',async()=>{
  const fixture=setup('active-deck-recruit');
  let current=await enterBattle(fixture,fixture.record);
  current=await attackTomato(fixture,current);
  assert.equal(current.state.core.choice.source,'triggerOptional');
  current=await activateTomato(fixture,current,'active-deck-recruit');
  assert.equal(current.state.core.choice.source,'monsterRecruit');
  current=await recruitSangan(fixture,current,'active-deck-recruit');
  assertBattleOutcome(fixture,current,true);
});
test('eligible DARK monster in the inactive partner Deck cannot satisfy Mystic Tomato when active Deck has none',async()=>{
  const fixture=setup('partner-deck-is-private',{includeCandidate:false,includePartnerDecoy:true});
  let current=await enterBattle(fixture,fixture.record);
  current=await attackTomato(fixture,current);
  assert.equal(current.state.core.phase,'battle','no recruiter trigger should open without an eligible card in the active Deck');
  assert.equal(current.state.core.choice,undefined);
  assert.ok(holder(current.state,0).deck.some(card=>card.uid===fixture.partnerDecoy.uid));
  assertBattleOutcome(fixture,current,false);
});
test('active representative may decline Mystic Tomato without moving either private Deck card',async()=>{
  const fixture=setup('decline-optional-recruit');
  let current=await enterBattle(fixture,fixture.record);
  current=await attackTomato(fixture,current);
  assert.equal(current.state.core.choice.source,'triggerOptional');
  const actor=tag.tagDecisionMember(current.state).id;
  const actions=tag.tagActions(current.state,actor);
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target==='__skip__');
  assert.ok(index>=0,'the private Discord menu must expose the optional decline action');
  current=await submit(current,actor,index,'m293-decline');
  assert.equal(current.state.core.phase,'battle');
  assertBattleOutcome(fixture,current,false);
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
