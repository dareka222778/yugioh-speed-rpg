'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m336-trap-hole-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M336 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');
const {rulesFor}=require('../dist/rulesProfile');

const TRAP_HOLE='04206964';
assert.equal(getPlayableCard(TRAP_HOLE)?.englishName,'Trap Hole');
assert.equal(getPlayableCard(TRAP_HOLE)?.kind,'trap');
assert.equal(getCardStatus(TRAP_HOLE)?.stage,'certified');
assert.equal(getEffect(TRAP_HOLE)?.kind,'trapHole');
const activation=getActivationModel(getEffect(TRAP_HOLE));
assert.equal(activation?.window,'summoned');
assert.equal(activation?.opponentOnly,true);
assert.equal(activation?.minimumSummonAtk,1000);
assert.deepEqual(activation?.summonKinds,['summon','flip']);

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'four physical Decks require at least twenty certified Normal Monsters');
const HIGH=NORMALS.find(entry=>entry.card.atk>=1000);
const LOW=NORMALS.find(entry=>entry.card.atk<1000);
assert.ok(HIGH,'the certified Normal Monster pool needs a face-up target at or above 1000 ATK');
assert.ok(LOW,'the certified Normal Monster pool needs a face-up target below 1000 ATK');

function member(seat){return 'm336-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20);
  return ids.slice(0,20);
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical Deck must contain '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function takePhysical(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M336 physical card missing from seat '+seat+': '+id);
}
function assertRules(state,initialDeckSizes){
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  if(initialDeckSizes)assert.deepEqual(initialDeckSizes,[20,20,20,20]);
  for(const team of state.core.players){
    assert.ok(team.monsters.length<=3);
    assert.ok(team.backrow.length<=3);
  }
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra||[]).length<=5);
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
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function assertHidden(publicState,card){
  assert.ok(!publicState.includes(card.id),'the Set Trap identity must remain hidden');
  assert.ok(!publicState.includes(card.uid),'the Set Trap UID must remain hidden');
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
  assert.ok(menu,'the active physical representative must receive a private Discord menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private menu must expose legal action index '+index);
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
async function rejectInactive(record,activeSeat,inactiveSeat,index,suffix){
  const forged=interaction(record,member(inactiveSeat),index,'m336-'+suffix+'-forged',member(activeSeat));
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<20,'the summon response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the active physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m336-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(targetEntry,scenario){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M336 Seat '+seat,
    cards:deck(seat===0?[TRAP_HOLE]:seat===1?[targetEntry.id]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:1,seed:'m336-trap-hole-'+scenario});
  state.core.turn=3;
  const initialDeckSizes=[0,1,2,3].map(seat=>{
    const physical=holder(state,seat);
    return physical.deck.length+physical.hand.length;
  });
  assertRules(state,initialDeckSizes);
  const trapCard=takePhysical(state,0,TRAP_HOLE);
  const trap={...trapCard,faceUp:false,setTurn:0};
  state.core.players[0].backrow.push(trap);
  const monster=ensureInHand(state,1,targetEntry.id);
  const before=inventory(state);
  assert.match(trap.uid,/^m0:/,'Trap Hole retains inactive physical seat 0 ownership');
  assert.match(monster.uid,/^m1:/,'the Normal Summon retains active physical seat 1 ownership');
  assertHidden(JSON.stringify(tag.publicTagDuel(state)),trap);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m336-'+scenario;
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M336 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m336-guild','m336-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {trap,monster,before,initialDeckSizes,record:store.getTag(id),targetEntry};
}
async function summon(record,monster,suffix){
  const actor=member(1);
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='summon'&&action.card===monster.uid&&action.position==='atk'
  );
  assert.ok(index>=0,'the active opponent must receive the Normal Summon action in its private Discord menu');
  const current=await submit(record,actor,index,'m336-'+suffix+'-summon');
  assert.equal(current.state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(current.state).id,member(2),
    'the active defender is seat 2 while Trap Hole is physically owned by inactive seat 0');
  assert.equal(tag.tagActions(current.state,member(0)).length,0,
    'the inactive physical owner cannot activate the shared Set Trap');
  return current;
}

test('Trap Hole activates through Discord against an opponent Normal Summon with at least 1000 ATK',async()=>{
  const f=setup(HIGH,'eligible');
  let current=await summon(f.record,f.monster,'eligible');
  const actions=tag.tagActions(current.state,member(2));
  const index=actions.findIndex(action=>
    action.kind==='trap'&&action.card===f.trap.uid&&action.target===f.monster.uid
  );
  assert.ok(index>=0,'the active defender menu must expose the eligible partner-owned Trap Hole target');
  await rejectInactive(current,2,0,index,'eligible');
  current=await submit(current,member(2),index,'m336-eligible-trap-hole');
  current=await settleResponses(current,'eligible');
  assert.equal(current.state.core.phase,'main');
  assert.equal(tag.tagDecisionMember(current.state).id,member(1));
  assert.ok(current.state.core.players[0].grave.some(card=>card.uid===f.trap.uid),
    'the partner-owned Trap Hole enters the defender shared Graveyard');
  assert.ok(current.state.core.players[1].grave.some(card=>card.uid===f.monster.uid),
    'the eligible summoned monster enters the attacker shared Graveyard');
  assert.equal(current.state.core.players[0].lp,4000);
  assert.equal(current.state.core.players[1].lp,4000);
  assertConserved(current.state,f.before);
  assertPrivateHands(current.state);
  assertRules(current.state,f.initialDeckSizes);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});

test('Trap Hole is not offered through Discord against an opponent Normal Summon below 1000 ATK',async()=>{
  const f=setup(LOW,'below-threshold');
  let current=await summon(f.record,f.monster,'below-threshold');
  const actions=tag.tagActions(current.state,member(2));
  assert.ok(!actions.some(action=>action.kind==='trap'&&action.card===f.trap.uid),
    'the private response menu must not offer Trap Hole below the printed ATK threshold');
  assert.ok(actions.some(action=>action.kind==='pass'));
  current=await settleResponses(current,'below-threshold');
  assert.equal(current.state.core.phase,'main');
  assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===f.monster.uid),
    'the below-threshold monster remains on the shared field');
  assert.ok(current.state.core.players[0].backrow.some(card=>card.uid===f.trap.uid&&!card.faceUp),
    'the partner-owned Trap Hole remains Set and hidden');
  assertHidden(JSON.stringify(tag.publicTagDuel(current.state)),f.trap);
  assert.equal(current.state.core.players[0].lp,4000);
  assert.equal(current.state.core.players[1].lp,4000);
  assertConserved(current.state,f.before);
  assertPrivateHands(current.state);
  assertRules(current.state,f.initialDeckSizes);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
