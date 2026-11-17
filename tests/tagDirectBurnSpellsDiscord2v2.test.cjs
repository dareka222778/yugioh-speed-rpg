'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m312-burn-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M312 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const SPARKS='76103675';
const HINOTAMA='46130346';
for(const [id,name,amount] of [[SPARKS,'Sparks',200],[HINOTAMA,'Hinotama',500]]){
  assert.equal(getPlayableCard(id)?.englishName,name);
  assert.equal(getEffect(id)?.kind,'burn');
  assert.equal(getEffect(id)?.amount,amount);
  assert.equal(getCardStatus(id)?.stage,'certified');
}
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'four physical Decks need at least twenty certified Normal Monster fillers');

function member(seat){return 'm312-seat-'+seat;}
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
  throw new Error('M312 physical card missing from seat '+seat+': '+id);
}
function endTurn(state){
  const actor=tag.tagDecisionMember(state).id;
  const end=tag.tagActions(state,actor).find(action=>action.kind==='end');
  assert.ok(end,'the active physical representative must be able to end the turn');
  state=tag.stepTagDuel(state,actor,end);
  for(let guard=0;state.core.phase==='discard';guard++){
    assert.ok(guard<12,'End Phase discard must terminate');
    const owner=tag.tagDecisionMember(state).id;
    const discard=tag.tagActions(state,owner).find(action=>action.kind==='discard');
    assert.ok(discard,'the physical owner must receive any required End Phase discard');
    state=tag.stepTagDuel(state,owner,discard);
  }
  return state;
}
function rotateToSeat2(state){
  for(let guard=0;tag.tagDecisionMember(state).id!==member(2);guard++){
    assert.ok(guard<4,'turn rotation must reach physical partner seat 2');
    state=endTurn(state);
  }
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  return state;
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
async function rejectInactive(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m312-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
function register(id,state){
  const ids=[0,1,2,3].map(member);
  const members=ids.map((id,seat)=>({id,name:'M312 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m312-guild','m312-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(seat,id,seed){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((memberId,physicalSeat)=>({
    id:memberId,name:'M312 Seat '+physicalSeat,
    cards:deck(physicalSeat===seat?[id]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  const spell=takePhysical(state,seat,id);
  holder(state,seat).hand.push(spell);
  if(seat===2)state=rotateToSeat2(state);
  assert.equal(tag.tagDecisionMember(state).id,member(seat));
  const partner=seat===0?2:0;
  state.core.players[0].lp=4000;
  state.core.players[1].lp=4000;
  const activeHand=tag.tagMemberHand(state,member(seat)).map(card=>card.uid);
  const activeDeck=holder(state,seat).deck.map(card=>card.uid);
  const partnerHand=tag.tagMemberHand(state,member(partner)).map(card=>card.uid);
  const partnerDeck=holder(state,partner).deck.map(card=>card.uid);
  const before=inventory(state);
  assert.match(spell.uid,new RegExp('^m'+seat+':'));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const record=register('m312-burn-'+seat,state);
  return {spell,seat,partner,activeHand,activeDeck,partnerHand,partnerDeck,before,record};
}
async function assertBurn(fixture,amount,requestId){
  const actor=member(fixture.seat);
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>action.kind==='spell'&&action.card===fixture.spell.uid);
  assert.ok(index>=0,'the active representative must receive the legal burn Spell action');
  assert.deepEqual(tag.tagActions(fixture.record.state,member(fixture.partner)),[],
    'the inactive physical partner cannot submit the Main Phase action');
  await rejectInactive(fixture.record,actor,member(fixture.partner),index,'burn-'+fixture.seat);
  const current=await submit(fixture.record,actor,index,requestId);
  const state=current.state;
  assert.equal(state.core.phase,'main');
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,4000-amount],
    'the Spell damages only the opposing shared team by its exact printed amount');
  assert.deepEqual(tag.tagMemberHand(state,actor).map(card=>card.uid),
    fixture.activeHand.filter(uid=>uid!==fixture.spell.uid),
    'only the resolving Spell leaves the active physical hand');
  assert.deepEqual(holder(state,fixture.seat).deck.map(card=>card.uid),fixture.activeDeck,
    'direct burn does not draw, mill or borrow from a physical Deck');
  assert.deepEqual(tag.tagMemberHand(state,member(fixture.partner)).map(card=>card.uid),fixture.partnerHand,
    'the partner private hand remains unchanged');
  assert.deepEqual(holder(state,fixture.partner).deck.map(card=>card.uid),fixture.partnerDeck,
    'the partner physical Deck remains unchanged');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.spell.uid),
    'the Spell enters the shared Graveyard with its physical UID');
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}

test('Sparks deals exactly 200 damage to the opposing team through the Discord Spell menu',async()=>{
  const fixture=setup(0,SPARKS,'m312-sparks');
  await assertBurn(fixture,200,'m312-sparks-activate');
});
test('Hinotama deals exactly 500 damage after physical turn rotation to seat 2',async()=>{
  const fixture=setup(2,HINOTAMA,'m312-hinotama');
  await assertBurn(fixture,500,'m312-hinotama-activate');
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});