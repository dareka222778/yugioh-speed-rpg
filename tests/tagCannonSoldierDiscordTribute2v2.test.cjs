'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m286-cannon-soldier-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M286 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const CANNON_SOLDIER='11384280';
const NORMAL_FODDER='91152256';
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
const NORMAL_IDS=NORMALS.map(entry=>entry.id);
assert.ok(NORMAL_IDS.length>=20,'four isolated physical Decks need twenty certified Normal Monsters');
assert.equal(getPlayableCard(CANNON_SOLDIER)?.englishName,'Cannon Soldier');
assert.equal(getPlayableCard(CANNON_SOLDIER)?.atk,1400);
assert.equal(getCardStatus(CANNON_SOLDIER)?.stage,'certified');
assert.equal(getEffect(CANNON_SOLDIER)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(CANNON_SOLDIER),{
  trigger:'ignition',cost:{kind:'tribute',count:1},operation:{kind:'burn',amount:500}
});
assert.equal(getPlayableCard(NORMAL_FODDER)?.englishName,'Celtic Guardian');

function member(seat){return 'm286-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMAL_IDS])];
  assert.ok(ids.length>=20,'each physical Deck must contain twenty distinct certified cards');
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
  throw new Error('M286 physical card missing from seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takePhysical(state,seat,id);
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
    assert.ok(team.monsters.length<=3,'each team shares exactly three Monster Zones');
    assert.ok(team.backrow.length<=3,'each team shares exactly three Spell/Trap Zones');
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
    'the Discord panel must expose the legal action index '+index);
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1,'the public field must refresh after the committed action');
  return store.getTag(record.id);
}
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m286-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'the inactive physical partner must be rejected before acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'a rejected partner action must not mutate the persisted duel');
}
function setup(scenario,sourceSeat,tributeSeats){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M286 Seat '+seat,cards:deck([CANNON_SOLDIER,NORMAL_FODDER])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m286-'+scenario});
  state.core.turn=3;
  const actor=ids[0];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const source=deploy(state,sourceSeat,CANNON_SOLDIER);
  const tributes=tributeSeats.map((seat,index)=>deploy(state,seat,NORMAL_FODDER));
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m286-'+scenario,guild='m286-guild',channel='m286-channel';
  const members=ids.map((id,seat)=>({id,name:'M286 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor,source,tributes,before,record:store.getTag(id)};
}
function cannonIndex(record,actor,source,tribute){
  return tag.tagActions(record.state,actor).findIndex(action=>
    action.kind==='monsterEffect'&&action.card===source.uid&&
    Array.isArray(action.tributes)&&action.tributes.length===1&&action.tributes[0]===tribute.uid
  );
}
async function activate(record,actor,source,tribute,suffix){
  const index=cannonIndex(record,actor,source,tribute);
  assert.ok(index>=0,'the private Discord menu must offer the exact legal Cannon Soldier Tribute');
  const partner=actor===member(0)?member(2):member(0);
  await rejectInactivePartner(record,actor,partner,index,suffix);
  return submit(record,actor,index,'m286-'+suffix+'-activate');
}
function assertFinal(fixture,record,expectedBurn,sourceRemains){
  const state=record.state;
  assert.equal(state.core.players[0].lp,4000,'the activating team must not lose LP');
  assert.equal(state.core.players[1].lp,4000-expectedBurn,
    'each resolved Cannon Soldier activation burns exactly 500 shared opposing LP');
  if(sourceRemains){
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid),
      'a partner-owned source retains its physical UID on the shared field');
  }else{
    assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.source.uid),
      'a self-Tributed source enters its team shared Graveyard');
  }
  for(const tribute of fixture.tributes){
    assert.ok(state.core.players[0].grave.some(card=>card.uid===tribute.uid),
      'each selected Tribute enters the shared Graveyard with its physical UID');
  }
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
test('Cannon Soldier uses the active Discord panel to Tribute an inactive partner monster',async()=>{
  const fixture=setup('partner-owned-tribute',0,[2]);
  assert.match(fixture.source.uid,/^m0:/);
  assert.match(fixture.tributes[0].uid,/^m2:/);
  const current=await activate(fixture.record,fixture.actor,fixture.source,fixture.tributes[0],'partner-owned-tribute');
  assertFinal(fixture,current,500,true);
});
test('the active teammate can activate a partner-owned Cannon Soldier and Tribute its own monster',async()=>{
  const fixture=setup('partner-owned-source',2,[0]);
  assert.match(fixture.source.uid,/^m2:/);
  assert.match(fixture.tributes[0].uid,/^m0:/);
  const current=await activate(fixture.record,fixture.actor,fixture.source,fixture.tributes[0],'partner-owned-source');
  assertFinal(fixture,current,500,true);
});
test('Cannon Soldier may Tribute itself through Discord and still resolve its activated burn',async()=>{
  const fixture=setup('self-tribute',0,[]);
  const self=fixture.source;
  fixture.tributes.push(self);
  const index=cannonIndex(fixture.record,fixture.actor,self,self);
  assert.ok(index>=0,'the private menu must offer Cannon Soldier as its own Tribute');
  await rejectInactivePartner(fixture.record,fixture.actor,member(2),index,'self-tribute');
  const current=await submit(fixture.record,fixture.actor,index,'m286-self-tribute-activate');
  assertFinal(fixture,current,500,false);
});
test('Cannon Soldier can activate twice through Discord while legal Tributes remain',async()=>{
  const fixture=setup('repeat-activation',0,[0,2]);
  const first=await activate(fixture.record,fixture.actor,fixture.source,fixture.tributes[0],'repeat-first');
  const second=await activate(first,fixture.actor,fixture.source,fixture.tributes[1],'repeat-second');
  assertFinal(fixture,second,1000,true);
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
