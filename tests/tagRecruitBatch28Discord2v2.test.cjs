'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m345-recruit-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getCardStatus,engineCatalog}=require('../dist/effectRegistry');
const {getMonsterEffect,getMonsterDefinition}=require('../dist/monsterEffects');
const {matchesMonsterSelector}=require('../dist/cardSelectors');
const {rulesFor}=require('../dist/rulesProfile');

const AXE_RAIDER='48305365';
const CASES=[
  {id:'55013285',name:'Troop Dragon',trigger:'onBattleDestroyed',policy:'mandatory',candidate:'55013285',mode:'battle'},
  {id:'93107608',name:'Howling Insect',trigger:'onBattleDestroyed',policy:'optional',candidate:'07019529',mode:'battle'},
  {id:'77044671',name:'Pyramid Turtle',trigger:'onBattleDestroyed',policy:'optional',candidate:'77044671',mode:'battle'},
  {id:'39191307',name:'Masked Dragon',trigger:'onBattleDestroyed',policy:'optional',candidate:'55444629',mode:'battle'},
  {id:'24317029',name:"Gravekeeper's Spy",trigger:'flip',policy:'mandatory',candidate:'37101832',mode:'flip'}
];
const EXCLUDED=new Set([...CASES.map(c=>c.id),...CASES.map(c=>c.candidate),AXE_RAIDER]);
const SAFE_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return !EXCLUDED.has(id)&&card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&Number.isInteger(card.defense);
});
assert.ok(SAFE_NORMALS.length>=20,'four physical Decks need twenty certified Normal Monster fixture identities');

for(const c of CASES){
  const source=getPlayableCard(c.id),candidate=getPlayableCard(c.candidate);
  assert.equal(source?.englishName,c.name);
  assert.equal(getCardStatus(c.id)?.stage,'certified');
  assert.equal(getCardStatus(c.candidate)?.stage,'certified');
  assert.ok(candidate&&candidate.kind==='monster',c.name+' candidate must be playable');
  assert.equal(getMonsterEffect(c.id)?.trigger,c.trigger);
  assert.equal(getMonsterDefinition(c.id)?.activation.policy,c.policy);
  assert.equal(getMonsterEffect(c.id)?.operation.kind,'recruit');
  assert.ok(matchesMonsterSelector(candidate,getMonsterEffect(c.id).operation.filter),
    c.name+' candidate must satisfy its exact race/name/archetype/stat filter');
}
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);
assert.equal(getCardStatus(AXE_RAIDER)?.stage,'certified');

function test(name,fn){
  nodeTest(name,async(...args)=>{
    try{return await fn(...args);}
    catch(error){console.error('[M345 diagnostic] '+name+'\\n'+(error?.stack||error));throw error;}
  });
}
function member(seat){return 'm345-seat-'+seat;}
function deck(required=[]){
  const ids=[...required];
  for(const id of SAFE_NORMALS)if(!ids.includes(id))ids.push(id);
  assert.ok(ids.length>=20,'fixture Deck must contain at least twenty cards');
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
  throw new Error('M345 physical card missing from seat '+seat+': '+id);
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
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra||[]).length<=5);
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical twenty-card Decks must contribute exactly eighty cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
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
    editReply:async payload=>{validateDiscordPayload(payload);calls.push('edit');},
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
  assert.ok(menu,'the active physical representative must receive a real private Discord action menu');
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
  const panel=tagPrivateMessage(record,partner);
  validateDiscordPayload(panel);
  const rows=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  assert.ok(!rows.some(row=>row.custom_id?.startsWith('tag:act:')),
    'the inactive physical partner must not receive the active representative action menu');
  const forged=interaction(record,partner,index,'m345-'+suffix+'-forged',actor);
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
    assert.ok(guard<40,'the response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m345-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(c,key,{includeCandidate=true,includePartnerDecoy=true}={}){
  const required=[[],[AXE_RAIDER],[],[]];
  required[0].push(c.id);
  if(includePartnerDecoy)required[0].push(c.candidate);
  if(includeCandidate)required[2].push(c.candidate);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M345 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:1,seed:'m345-'+key});
  state.core.turn=3;
  assert.deepEqual(state.active,[2,1],'turn rotation must make seats 2 and 1 the active representatives');
  const source=placeMonster(state,0,c.id,c.mode==='battle');
  const attacker=c.mode==='battle'?placeMonster(state,1,AXE_RAIDER,true):null;
  const candidate=includeCandidate?holder(state,2).deck.find(card=>card.id===c.candidate)||null:null;
  const partnerDecoy=includePartnerDecoy?holder(state,0).deck.find(card=>card.id===c.candidate)||null:null;
  if(includeCandidate)assert.ok(candidate,'active representative physical Deck must contain the eligible recruit');
  if(includePartnerDecoy)assert.ok(partnerDecoy,'inactive partner physical Deck must contain its private decoy');
  assert.match(source.uid,/^m0:/,'the source must retain inactive partner physical ownership');
  if(attacker)assert.match(attacker.uid,/^m1:/);
  if(candidate)assert.match(candidate.uid,/^m2:/);
  if(partnerDecoy)assert.match(partnerDecoy.uid,/^m0:/);
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  tag.assertTagDuel(state);
  const id='m345-'+key,guild='m345-guild-'+key,channel='m345-channel-'+key;
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M345 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  const record=store.getTag(id);
  assertPublicPayload(record);
  return {id,key,c,source,attacker,candidate,partnerDecoy,before,record};
}
async function enterBattle(fixture,record){
  const actor=member(1);
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active opponent must see Battle Phase in the private Discord menu');
  return settleResponses(await submit(record,actor,index,'m345-'+fixture.key+'-battle'),fixture.key+'-battle');
}
async function attackSource(fixture,record){
  const actor=member(1);
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.source.uid
  );
  assert.ok(index>=0,'the active opponent must see the shared-field attack against the recruiter');
  return settleResponses(await submit(record,actor,index,'m345-'+fixture.key+'-attack'),fixture.key+'-attack');
}
async function flipSpy(fixture,record){
  const actor=member(2);
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='position'&&action.card===fixture.source.uid&&action.mode==='flip'
  );
  assert.ok(index>=0,'the active representative must receive the partner-owned FLIP Summon action');
  await rejectInactivePartner(record,actor,member(0),index,fixture.key+'-flip');
  return submit(record,actor,index,'m345-'+fixture.key+'-flip');
}
async function activateOptional(fixture,record){
  assert.equal(record.state.core.phase,'choice');
  assert.equal(record.state.core.choice.source,'triggerOptional');
  const actor=tag.tagDecisionMember(record.state).id;
  assert.equal(actor,member(2),'the active representative of the source team must receive the optional trigger');
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target===fixture.source.uid);
  assert.ok(index>=0,'the private Discord menu must offer the optional recruiter trigger');
  assert.ok(actions.some(action=>action.kind==='choose'&&action.target==='__skip__'),
    'the optional trigger must expose a decline action');
  await rejectInactivePartner(record,actor,member(0),index,fixture.key+'-optional');
  return submit(record,actor,index,'m345-'+fixture.key+'-activate');
}
async function recruit(fixture,record){
  assert.equal(record.state.core.phase,'choice');
  assert.equal(record.state.core.choice.source,'monsterRecruit');
  const actor=tag.tagDecisionMember(record.state).id;
  assert.equal(actor,member(2),'recruit selection belongs to the active physical representative');
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target===fixture.candidate?.uid);
  assert.ok(index>=0,'the active representative private menu must offer the eligible recruit from its own Deck');
  assert.ok(!actions.some(action=>action.kind==='choose'&&action.target===fixture.partnerDecoy?.uid),
    'the inactive partner Deck must not leak into recruit options');
  assert.deepEqual(record.state.core.choice.targets,[fixture.candidate.uid]);
  await rejectInactivePartner(record,actor,member(0),index,fixture.key+'-recruit');
  return submit(record,actor,index,'m345-'+fixture.key+'-recruit');
}
function assertOutcome(fixture,record,recruited){
  const state=record.state,c=fixture.c;
  if(c.mode==='battle'){
    const damage=1700-getPlayableCard(c.id).atk;
    assert.equal(state.core.players[0].lp,4000-damage);
    assert.equal(state.core.players[1].lp,4000);
    assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.source.uid&&card.id===c.id));
    assert.ok(!state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid));
    assert.ok(state.core.players[1].monsters.some(card=>card.uid===fixture.attacker.uid));
  }else{
    assert.equal(state.core.players[0].lp,4000);
    assert.equal(state.core.players[1].lp,4000);
    const source=state.core.players[0].monsters.find(card=>card.uid===fixture.source.uid);
    assert.ok(source&&source.faceUp&&source.position==='def','Gravekeeper\'s Spy remains face-up in Defense after its FLIP trigger');
  }
  if(recruited){
    const monster=state.core.players[0].monsters.find(card=>card.uid===fixture.candidate.uid&&card.id===c.candidate);
    assert.ok(monster,'the exact physical Deck card must enter the shared field');
    assert.match(monster.uid,/^m2:/,'the recruited monster must retain the active representative physical UID');
    assert.ok(!holder(state,2).deck.some(card=>card.uid===fixture.candidate.uid));
    assert.ok(holder(state,0).deck.some(card=>card.uid===fixture.partnerDecoy.uid),
      'the inactive partner physical Deck must remain untouched');
  }else{
    if(fixture.candidate)assert.ok(holder(state,2).deck.some(card=>card.uid===fixture.candidate.uid));
    if(fixture.partnerDecoy)assert.ok(holder(state,0).deck.some(card=>card.uid===fixture.partnerDecoy.uid));
    assert.ok(!state.core.players[0].monsters.some(card=>card.uid===fixture.candidate?.uid));
  }
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(record);
  tag.assertTagDuel(state);
  tag.assertTagDuel(JSON.parse(JSON.stringify(state)));
}
for(const c of CASES){
  test('M345 '+c.name+' recruits from the active physical Deck through Discord 2v2',async()=>{
    const fixture=setup(c,c.name.toLowerCase().replaceAll(' ','-'));
    let current=fixture.record;
    if(c.mode==='battle'){
      current=await enterBattle(fixture,current);
      current=await attackSource(fixture,current);
      if(c.policy==='optional')current=await activateOptional(fixture,current);
      else assert.equal(current.state.core.choice.source,'monsterRecruit','mandatory Troop Dragon trigger must open recruitment directly');
    }else current=await flipSpy(fixture,current);
    current=await recruit(fixture,current);
    assertOutcome(fixture,current,true);
  });
}
test('M345 Howling Insect cannot recruit a matching card from the inactive partner Deck',async()=>{
  const c=CASES.find(x=>x.name==='Howling Insect');
  const fixture=setup(c,'partner-deck-private',{includeCandidate:false,includePartnerDecoy:true});
  let current=await enterBattle(fixture,fixture.record);
  current=await attackSource(fixture,current);
  assert.equal(current.state.core.phase,'battle','no eligible active-Deck card means no optional recruiter window');
  assert.equal(current.state.core.choice,undefined);
  assert.ok(holder(current.state,0).deck.some(card=>card.uid===fixture.partnerDecoy.uid));
  assertOutcome(fixture,current,false);
});
test('M345 optional recruiter can be declined without moving either physical Deck',async()=>{
  const c=CASES.find(x=>x.name==='Pyramid Turtle');
  const fixture=setup(c,'decline-optional',{includeCandidate:true,includePartnerDecoy:true});
  let current=await enterBattle(fixture,fixture.record);
  current=await attackSource(fixture,current);
  assert.equal(current.state.core.choice.source,'triggerOptional');
  const actor=tag.tagDecisionMember(current.state).id;
  const actions=tag.tagActions(current.state,actor);
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target==='__skip__');
  assert.ok(index>=0,'the optional recruiter must expose a decline action');
  await rejectInactivePartner(current,actor,member(0),index,'decline');
  current=await submit(current,actor,index,'m345-decline');
  assert.equal(current.state.core.phase,'battle');
  assertOutcome(fixture,current,false);
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
