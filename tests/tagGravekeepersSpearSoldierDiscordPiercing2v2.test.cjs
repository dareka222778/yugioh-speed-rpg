'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m296-spear-soldier-discord-'));
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

const SPEAR_SOLDIER='63695531';
const AXE_RAIDER='48305365';
const CELTIC_GUARDIAN='91152256';
const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=20,'the isolated four-seat fixture needs twenty certified Normal Monster fillers');
for(const id of [SPEAR_SOLDIER,AXE_RAIDER,CELTIC_GUARDIAN]){
  assert.ok(getPlayableCard(id),'card must be playable: '+id);
  assert.equal(getCardStatus(id)?.stage,'certified','card must remain certified: '+id);
}
assert.equal(getPlayableCard(SPEAR_SOLDIER).englishName,"Gravekeeper's Spear Soldier");
assert.equal(getPlayableCard(SPEAR_SOLDIER).atk,1500);
assert.equal(getPlayableCard(SPEAR_SOLDIER).defense,1000);
assert.deepEqual(getMonsterEffect(SPEAR_SOLDIER),{
  trigger:'continuous',
  operation:{kind:'continuous',rules:[{kind:'combat',filter:{selfOnly:true},rule:{kind:'piercing'}}]}
});
assert.equal(getMonsterDefinition(SPEAR_SOLDIER)?.activation.policy,'continuous');
assert.equal(getEffect(AXE_RAIDER)?.kind,'normal');

function member(seat){return 'm296-seat-'+seat;}
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
  throw new Error('M296 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,id,position='atk',faceUp=true){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,
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
  const forged=interaction(record,partner,index,'m296-'+suffix+'-forged',actor);
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
    current=await submit(current,actor,pass,'m296-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario,{sourceId,sourceSeat=2,targetSeat=3,targetId=CELTIC_GUARDIAN,sourcePosition='atk'}){
  const required=[[],[],[],[]];
  required[sourceSeat].push(sourceId);
  required[targetSeat].push(targetId);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M296 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m296-'+scenario});
  state.core.turn=3;
  const source=placeMonster(state,sourceSeat,sourceId,sourcePosition,true);
  const target=placeMonster(state,targetSeat,targetId,'def',false);
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m296-'+scenario,guild='m296-guild',channel='m296-channel';
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M296 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor:member(0),source,target,sourceSeat,targetSeat,before,record:store.getTag(id)};
}
async function enterBattle(fixture,record){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active teammate must see Battle Phase in the private Discord menu');
  return settleResponses(await submit(record,fixture.actor,index,'m296-'+fixture.id+'-battle'),fixture.id+'-battle');
}
async function attackTarget(fixture,record){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.source.uid&&action.target===fixture.target.uid
  );
  assert.ok(index>=0,'the active teammate must see the partner-owned face-down Defense target in the private Discord menu');
  await rejectInactivePartner(record,fixture.actor,member(fixture.sourceSeat),index,fixture.id);
  return settleResponses(await submit(record,fixture.actor,index,'m296-'+fixture.id+'-attack'),fixture.id+'-attack');
}
function assertFinal(fixture,record){
  assertConserved(record.state,fixture.before);
  assertPrivateHands(record.state);
  assertRules(record.state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(record.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(record.state))));
}
test('partner-owned Gravekeeper’s Spear Soldier deals 300 piercing damage to the opposing team through Discord 2v2',async()=>{
  const fixture=setup('spear-soldier-piercing',{sourceId:SPEAR_SOLDIER});
  assert.match(fixture.source.uid,/^m2:/);
  assert.match(fixture.target.uid,/^m3:/);
  const publicBefore=JSON.stringify(tag.publicTagDuel(fixture.record.state));
  assert.ok(!publicBefore.includes(CELTIC_GUARDIAN),'face-down target identity must stay private before Damage Calculation');
  assert.ok(!JSON.stringify(tagPublicMessage(fixture.record)).includes(CELTIC_GUARDIAN));
  let current=await enterBattle(fixture,fixture.record);
  current=await attackTarget(fixture,current);
  const state=current.state;
  assert.equal(state.core.players[1].lp,3700,'1500 ATK against 1200 DEF inflicts exactly 300 piercing damage');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.id===SPEAR_SOLDIER&&card.position==='atk'));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.target.uid&&card.id===CELTIC_GUARDIAN));
  assert.ok(!state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  assertFinal(fixture,current);
});
test('a Normal Monster attacking the same face-down Defense target does not inherit Spear Soldier piercing',async()=>{
  const fixture=setup('normal-control-no-piercing',{sourceId:AXE_RAIDER});
  assert.match(fixture.source.uid,/^m2:/);
  assert.match(fixture.target.uid,/^m3:/);
  assert.equal(getEffect(AXE_RAIDER)?.kind,'normal');
  let current=await enterBattle(fixture,fixture.record);
  current=await attackTarget(fixture,current);
  const state=current.state;
  assert.equal(state.core.players[1].lp,4000,'normal battle against Defense does not inflict piercing damage');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.id===AXE_RAIDER));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.target.uid&&card.id===CELTIC_GUARDIAN));
  assertFinal(fixture,current);
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
