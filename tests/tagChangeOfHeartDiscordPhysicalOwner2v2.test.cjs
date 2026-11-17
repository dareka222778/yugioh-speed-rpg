'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m316-change-heart-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M316 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const CHANGE_OF_HEART='04031928';
const DARK_MAGICIAN='46986414';
assert.equal(getPlayableCard(CHANGE_OF_HEART)?.englishName,'Change of Heart');
assert.equal(getEffect(CHANGE_OF_HEART)?.kind,'changeHeart');
assert.equal(getCardStatus(CHANGE_OF_HEART)?.stage,'certified');
assert.equal(getPlayableCard(DARK_MAGICIAN)?.englishName,'Dark Magician');

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20);
function member(seat){return 'm316-seat-'+seat;}
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
  throw new Error('M316 physical card missing from seat '+seat+': '+id);
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
async function rejectInactive(record,index,suffix){
  const forged=interaction(record,member(2),index,'m316-'+suffix+'-forged',member(0));
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
function register(id,state){
  const ids=[0,1,2,3].map(member);
  const members=ids.map((id,seat)=>({id,name:'M316 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m316-guild','m316-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((memberId,seat)=>({
    id:memberId,name:'M316 Seat '+seat,
    cards:deck(seat===0?[CHANGE_OF_HEART]:seat===3?[DARK_MAGICIAN]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m316-change-of-heart'});
  state.core.turn=3;
  const spell=takePhysical(state,0,CHANGE_OF_HEART);
  holder(state,0).hand.push(spell);
  const stolen=takePhysical(state,3,DARK_MAGICIAN);
  const target={...stolen,position:'atk',faceUp:true};
  state.core.players[1].monsters.push(target);
  assert.match(spell.uid,/^m0:/);
  assert.match(target.uid,/^m3:/,'the opponent monster must retain physical seat 3 ownership');
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const partnerHand=tag.tagMemberHand(state,member(2)).map(card=>card.uid);
  const partnerDeck=holder(state,2).deck.map(card=>card.uid);
  const record=register('m316-change-heart',state);
  return {spell,target,before,partnerHand,partnerDeck,record};
}

test('Change of Heart takes an opponent partner-owned monster through Discord and returns it to its original team at End Phase',async()=>{
  const fixture=setup();
  const actor=member(0);
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>action.kind==='spell'&&action.card===fixture.spell.uid&&action.target===fixture.target.uid);
  assert.ok(index>=0,'the active representative must receive Change of Heart targeting the shared opposing field');
  assert.deepEqual(tag.tagActions(fixture.record.state,member(2)),[],
    'the inactive physical partner cannot submit the active Spell action');
  await rejectInactive(fixture.record,index,'change-heart');
  const stolen=await submit(fixture.record,actor,index,'m316-change-heart-activate');
  let state=stolen.state;
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.target.uid),
    'the stolen monster enters the activating team shared Monster Zone');
  assert.ok(!state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  const controlled=state.core.players[0].monsters.find(card=>card.uid===fixture.target.uid);
  assert.equal(controlled.owner,1,'control changes but original team ownership remains');
  assert.equal(controlled.uid,fixture.target.uid,'the physical owner seat 3 UID must not be rewritten');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.spell.uid));
  assert.deepEqual(holder(state,2).deck.map(card=>card.uid),fixture.partnerDeck);
  assert.deepEqual(tag.tagMemberHand(state,member(2)).map(card=>card.uid),fixture.partnerHand);
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(stolen);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const endActions=tag.tagActions(state,actor);
  const endIndex=endActions.findIndex(action=>action.kind==='end');
  assert.ok(endIndex>=0,'the active representative must receive the End Phase action');
  const ended=await submit(stolen,actor,endIndex,'m316-change-heart-end');
  state=ended.state;
  assert.equal(tag.tagDecisionMember(state).id,member(1),'the opposing team becomes active after End Phase');
  assert.ok(!state.core.players[0].monsters.some(card=>card.uid===fixture.target.uid),
    'Change of Heart expires at the activating team End Phase');
  const returned=state.core.players[1].monsters.find(card=>card.uid===fixture.target.uid);
  assert.ok(returned,'the borrowed monster returns to the original team shared field');
  assert.equal(returned.owner,1);
  assert.equal(returned.uid,fixture.target.uid,'physical seat 3 ownership survives the control return');
  assert.ok(!state.core.players.some(player=>player.grave.some(card=>card.uid===fixture.target.uid)));
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(ended);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});