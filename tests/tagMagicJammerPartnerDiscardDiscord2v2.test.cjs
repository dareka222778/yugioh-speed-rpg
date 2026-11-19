'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m326-magic-jammer-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M326 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const POT='55144522';
const MAGIC_JAMMER='77414722';
const DISCARD='48305365';
const PARTNER_ONLY='91152256';
for(const [id,name,kind] of [
  [POT,'Pot of Greed','potOfGreed'],
  [MAGIC_JAMMER,'Magic Jammer','magicJammer']
]){
  assert.equal(getPlayableCard(id)?.englishName,name);
  assert.equal(getEffect(id)?.kind,kind);
  assert.equal(getCardStatus(id)?.stage,'certified');
}
for(const id of [DISCARD,PARTNER_ONLY])assert.ok(getPlayableCard(id));
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20);
function member(seat){return 'm326-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20);
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
  throw new Error('M326 physical card missing from seat '+seat+': '+id);
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
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
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
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for seat '+seat);
  }
}
function assertPublicPayload(record){
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(record.state)){
    assert.ok(!rendered.includes(card.uid),'public payload leaked UID '+card.uid);
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
  assert.ok(menu,'the active physical representative must receive a private Discord menu');
  assert.ok(menu.options.some(option=>option.value===String(index)));
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
async function rejectInactive(record,inactiveSeat,index,activeSeat,requestId){
  const forged=interaction(record,member(inactiveSeat),index,requestId,member(activeSeat));
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
function register(state){
  const id='m326-magic-jammer-discord';
  const ids=[0,1,2,3].map(member);
  const members=ids.map((id,seat)=>({id,name:'M326 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m326-guild','m326-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(){
  const ids=[0,1,2,3].map(member);
  const required=ids.map((id,seat)=>[
    ...(seat===0?[POT]:[]),
    ...(seat===1?[DISCARD]:[]),
    ...(seat===3?[MAGIC_JAMMER,PARTNER_ONLY]:[])
  ]);
  const players=ids.map((id,seat)=>({id,name:'M326 Seat '+seat,cards:deck(required[seat])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m326-magic-jammer'});
  state.core.turn=3;
  const pot=takePhysical(state,0,POT);
  const jam=takePhysical(state,3,MAGIC_JAMMER);
  const discard=takePhysical(state,1,DISCARD);
  const partnerOnly=takePhysical(state,3,PARTNER_ONLY);
  holder(state,0).deck.push(...holder(state,0).hand);
  holder(state,0).hand=[pot];
  holder(state,1).deck.push(...holder(state,1).hand);
  holder(state,1).hand=[discard];
  holder(state,3).deck.push(...holder(state,3).hand);
  holder(state,3).hand=[partnerOnly];
  state.core.players[1].backrow.push({...jam,faceUp:false,setTurn:1});
  assert.ok(pot.uid.startsWith('m0:'));
  assert.ok(jam.uid.startsWith('m3:'));
  assert.ok(discard.uid.startsWith('m1:'));
  assert.ok(partnerOnly.uid.startsWith('m3:'));
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const hands=new Map([0,1,2,3].map(seat=>[seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)]));
  const decks=new Map([0,1,2,3].map(seat=>[seat,holder(state,seat).deck.map(card=>card.uid)]));
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicBefore.includes(jam.id),'the Set Counter Trap identity must remain hidden publicly');
  assert.ok(!publicBefore.includes(jam.uid),'the Set Counter Trap physical UID must remain hidden publicly');
  return {pot,jam,discard,partnerOnly,before,hands,decks,record:register(state)};
}

test('Magic Jammer set by the inactive partner is activated by the active teammate and pays its discard from the active physical hand',async()=>{
  const fixture=setup();
  const actor=member(0);
  const potActions=tag.tagActions(fixture.record.state,actor);
  const potIndex=potActions.findIndex(action=>action.kind==='spell'&&action.card===fixture.pot.uid);
  assert.ok(potIndex>=0,'the active representative must receive Pot of Greed');
  let current=await submit(fixture.record,actor,potIndex,'m326-pot-of-greed');
  assert.equal(current.state.core.phase,'response','Pot of Greed must open a response window');
  assert.equal(tag.tagDecisionMember(current.state).id,member(1),
    'the active physical representative of the opposing team receives response priority');
  const jamActions=tag.tagActions(current.state,member(1));
  const jamIndex=jamActions.findIndex(action=>action.kind==='trap'&&action.card===fixture.jam.uid);
  assert.ok(jamIndex>=0,
    'the active teammate must be able to activate a Counter Trap set by the inactive partner');
  assert.deepEqual(tag.tagActions(current.state,member(3)),[],
    'the inactive physical owner cannot submit the shared-field Counter Trap action');
  await rejectInactive(current,3,jamIndex,1,'m326-forged-jammer');
  current=await submit(current,member(1),jamIndex,'m326-magic-jammer');
  const state=current.state;
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.pot.uid),
    'the negated Pot of Greed must be sent to its controller team Graveyard');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.jam.uid),
    'Magic Jammer set by the partner must enter the shared team Graveyard');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.discard.uid),
    'the Counter Trap discard cost must come from the active representative seat 1');
  assert.ok(!state.core.players[1].grave.some(card=>card.uid===fixture.partnerOnly.uid),
    'the inactive partner private hand must not pay the active representative discard cost');
  assert.deepEqual(tag.tagMemberHand(state,member(1)).map(card=>card.uid),[],
    'the active representative paid its only discard card');
  assert.deepEqual(tag.tagMemberHand(state,member(3)).map(card=>card.uid),[fixture.partnerOnly.uid],
    'the inactive partner private hand must remain untouched');
  assert.deepEqual(holder(state,0).deck.map(card=>card.uid),fixture.decks.get(0),
    'negated Pot of Greed must not draw two cards');
  for(const seat of [1,2,3]){
    const expectedDeck=fixture.decks.get(seat);
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),expectedDeck,
      'the response chain must not mutate physical Deck '+seat);
  }
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,4000]);
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
