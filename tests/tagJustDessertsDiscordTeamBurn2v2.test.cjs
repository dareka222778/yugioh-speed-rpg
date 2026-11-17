'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m302-just-desserts-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M302 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const JUST_DESSERTS='24068492';
assert.equal(getPlayableCard(JUST_DESSERTS)?.kind,'trap');
assert.equal(getEffect(JUST_DESSERTS)?.kind,'justDesserts');
assert.equal(getCardStatus(JUST_DESSERTS)?.stage,'certified');
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'four isolated physical Decks need at least twenty certified Normal Monsters');

function member(seat){return 'm302-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20,'each physical Deck must contain twenty distinct cards');
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
  throw new Error('M302 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain fixture card '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
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
  assert.ok(menu,'the active physical representative must receive a real private Discord menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private Discord menu must expose the legal action index '+index);
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1,'the public duel panel must refresh after the committed action');
  return store.getTag(record.id);
}
async function rejectInactivePartner(record,actor,partner,index){
  const forged=interaction(record,partner,index,'m302-just-desserts-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'the inactive physical partner must be rejected before acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'a rejected partner action must not mutate the persisted duel');
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the Just Desserts response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const pass=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m302-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M302 Seat '+seat,cards:deck(seat===2?[JUST_DESSERTS,NORMALS[0].id,NORMALS[1].id]:[])}));
  const state=tag.createTagDuel(players,{classic:true,first:1,seed:'m302-just-desserts-discord-team-burn'});
  state.core.turn=3;
  assert.equal(tag.tagDecisionMember(state).id,member(1),'seat 1 must be the active opposing representative');
  const trapCard=takePhysical(state,2,JUST_DESSERTS);
  const trap={...trapCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(trap);
  const existing=deploy(state,3,NORMALS[0].id);
  const summonCard=ensureInHand(state,1,NORMALS[1].id);
  const before=inventory(state);
  assert.match(trap.uid,/^m2:/,'the Set Trap retains inactive teammate seat 2 physical ownership');
  assert.match(existing.uid,/^m3:/,'the first opposing monster belongs physically to inactive seat 3');
  assert.match(summonCard.uid,/^m1:/,'the second opposing monster belongs physically to active seat 1');
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m302-just-desserts',guild='m302-guild',channel='m302-channel';
  const members=ids.map((id,seat)=>({id,name:'M302 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {trap,existing,summonCard,before,record:store.getTag(id)};
}
test('Just Desserts resolves from the active teammate Discord panel and counts both opposing physical seats',async()=>{
  const fixture=setup();
  let current=fixture.record;
  const actor=member(0);
  assert.equal(tag.tagDecisionMember(current.state).id,member(1),'seat 1 is already the active opponent');
  const summonIndex=tag.tagActions(current.state,member(1)).findIndex(action=>
    action.kind==='summon'&&action.card===fixture.summonCard.uid
  );
  assert.ok(summonIndex>=0,'seat 1 must receive the legal Normal Summon action');
  current=await submit(current,member(1),summonIndex,'m302-normal-summon');
  assert.equal(current.state.core.phase,'response','the Normal Summon opens a Trap response window');
  assert.equal(current.state.core.players[1].monsters.length,2,
    'the opposing shared field contains one monster from seat 1 and one from seat 3');
  assert.equal(tag.tagDecisionMember(current.state).id,actor,
    'the active defending representative receives response priority');
  const trapIndex=tag.tagActions(current.state,actor).findIndex(action=>
    action.kind==='trap'&&action.card===fixture.trap.uid
  );
  assert.ok(trapIndex>=0,'the active teammate sees the partner-owned Just Desserts response');
  await rejectInactivePartner(current,actor,member(2),trapIndex);
  current=await submit(current,actor,trapIndex,'m302-activate-just-desserts');
  current=await settleResponses(current,'resolve-just-desserts');
  const state=current.state;
  assert.equal(state.core.players[1].lp,3000,
    'Just Desserts inflicts 500 shared LP damage for each of the two opposing monsters');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].monsters.length,2,'the Trap does not destroy the counted monsters');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.trap.uid),
    'the activated partner-owned Trap enters the shared Graveyard');
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
