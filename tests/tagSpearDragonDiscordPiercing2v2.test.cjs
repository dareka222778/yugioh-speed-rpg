'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m294-spear-dragon-discord-'));
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

const SPEAR_DRAGON='31553716';
const CELTIC_GUARDIAN='91152256';
const SKILL_DRAIN='82732705';
const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=20,'the isolated four-seat fixture needs twenty certified Normal Monster fillers');
assert.equal(getPlayableCard(SPEAR_DRAGON)?.englishName,'Spear Dragon');
assert.equal(getPlayableCard(SPEAR_DRAGON)?.atk,1900);
assert.equal(getPlayableCard(SPEAR_DRAGON)?.defense,0);
assert.equal(getCardStatus(SPEAR_DRAGON)?.stage,'certified');
assert.equal(getCardStatus(CELTIC_GUARDIAN)?.stage,'certified');
assert.equal(getCardStatus(SKILL_DRAIN)?.stage,'certified');
assert.equal(getEffect(SPEAR_DRAGON)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(SPEAR_DRAGON),{
  trigger:'continuous',operation:{kind:'endDamageDefensePiercing'}
});
assert.equal(getMonsterDefinition(SPEAR_DRAGON)?.activation.window,'continuous');

function member(seat){return 'm294-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS])];
  assert.ok(ids.length>=20,'each physical Deck must contain at least twenty unique cards');
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
  throw new Error('M294 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,id,faceUp=true){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:faceUp?'atk':'def',faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function setSkillDrain(state,seat){
  const card=takePhysical(state,seat,SKILL_DRAIN);
  const trap={...card,faceUp:true,resolved:true,setTurn:0};
  state.core.players[seat%2].backrow.push(trap);
  return trap;
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
  const forged=interaction(record,partner,index,'m294-'+suffix+'-forged',actor);
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
    current=await submit(current,actor,pass,'m294-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario,{targetFaceUp=true,negated=false}={}){
  const required=[[],[],[SPEAR_DRAGON],[CELTIC_GUARDIAN]];
  if(negated)required[3].push(SKILL_DRAIN);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M294 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m294-'+scenario});
  state.core.turn=3;
  const source=placeMonster(state,2,SPEAR_DRAGON,true);
  const target=placeMonster(state,3,CELTIC_GUARDIAN,targetFaceUp);
  const skillDrain=negated?setSkillDrain(state,3):null;
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m294-'+scenario,guild='m294-guild',channel='m294-channel';
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M294 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor:member(0),source,target,skillDrain,before,record:store.getTag(id)};
}
async function enterBattle(fixture,record){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active teammate must see Battle Phase in the private Discord menu');
  return settleResponses(await submit(record,fixture.actor,index,'m294-'+fixture.id+'-battle'),fixture.id+'-battle');
}
async function attackTarget(fixture,record){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.source.uid&&action.target===fixture.target.uid
  );
  assert.ok(index>=0,'the active teammate must see the shared-field attack against the partner-owned Defense monster');
  await rejectInactivePartner(record,fixture.actor,member(2),index,fixture.id);
  return settleResponses(await submit(record,fixture.actor,index,'m294-'+fixture.id+'-attack'),fixture.id+'-attack');
}
function assertOutcome(fixture,record,{piercing,sourcePosition,targetDestroyed=true}){
  const state=record.state;
  assert.equal(state.core.phase,'battle','the position change must resolve at the end of Damage Step, before Battle Phase ends');
  assert.equal(state.core.players[0].monsters.find(card=>card.uid===fixture.source.uid)?.position,sourcePosition);
  assert.equal(state.core.players[1].lp,piercing?3300:4000);
  if(targetDestroyed){
    assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.target.uid&&card.id===CELTIC_GUARDIAN));
    assert.ok(!state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  }
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
test('partner-owned Spear Dragon deals 700 piercing damage and changes to Defense at the end of Damage Step through Discord',async()=>{
  const fixture=setup('piercing-defense');
  assert.match(fixture.source.uid,/^m2:/);
  assert.match(fixture.target.uid,/^m3:/);
  let current=await enterBattle(fixture,fixture.record);
  current=await attackTarget(fixture,current);
  assertOutcome(fixture,current,{piercing:true,sourcePosition:'def'});
});
test('face-down Defense target remains private before attack but still receives Spear Dragon piercing',async()=>{
  const fixture=setup('face-down-defense',{targetFaceUp:false});
  const publicBefore=JSON.stringify(tag.publicTagDuel(fixture.record.state));
  assert.ok(!publicBefore.includes(CELTIC_GUARDIAN));
  assert.ok(!JSON.stringify(tagPublicMessage(fixture.record)).includes(CELTIC_GUARDIAN));
  let current=await enterBattle(fixture,fixture.record);
  current=await attackTarget(fixture,current);
  assertOutcome(fixture,current,{piercing:true,sourcePosition:'def'});
});
test('Skill Drain suppresses Spear Dragon piercing and its Damage-Step position change',async()=>{
  const fixture=setup('skill-drain-negation',{negated:true});
  assert.ok(fixture.skillDrain&&fixture.skillDrain.faceUp&&fixture.skillDrain.resolved);
  let current=await enterBattle(fixture,fixture.record);
  current=await attackTarget(fixture,current);
  assertOutcome(fixture,current,{piercing:false,sourcePosition:'atk'});
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
