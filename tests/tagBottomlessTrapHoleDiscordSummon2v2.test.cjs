'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m330-bottomless-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M330 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getActivationModel,getDestructionModel}=require('../dist/effectModels');
const {rulesFor}=require('../dist/rulesProfile');

const BOTTOMLESS='29401950';
const effect=getEffect(BOTTOMLESS);
assert.equal(getPlayableCard(BOTTOMLESS)?.englishName,'Bottomless Trap Hole');
assert.equal(getPlayableCard(BOTTOMLESS)?.kind,'trap');
assert.equal(getCardStatus(BOTTOMLESS)?.stage,'certified');
assert.equal(effect?.kind,'bottomlessTrapHole');
assert.deepEqual(getActivationModel(effect),{
  speed:2,window:'summoned',damage:'never',opponentOnly:true,
  summonKinds:['summon','flip','specialSummon'],minimumSummonAtk:1500
});
assert.deepEqual(getDestructionModel(effect),{
  operation:'destroyMonsters',scope:'selected',faceUp:true,minimumAtk:1500,destination:'banished'
});

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense)&&entry.card.level<=4);
const high=NORMALS.filter(entry=>entry.card.atk>=1500).sort((a,b)=>b.card.atk-a.card.atk)[0];
const low=NORMALS.filter(entry=>entry.card.atk<1500).sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(high,'Bottomless requires a summonable Normal Monster with at least 1500 ATK');
assert.ok(low,'the negative fixture requires a summonable Normal Monster below 1500 ATK');
const remaining=NORMALS.filter(entry=>![high.id,low.id].includes(entry.id));
const allyEntry=remaining[0],defenderEntry=remaining[1];
assert.ok(allyEntry&&defenderEntry,'the four-seat fixture needs distinct additional Normal Monsters');

function member(seat){return 'm330-seat-'+seat;}
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
  throw new Error('M330 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function deploy(state,seat,id,position='atk'){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,
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
    assert.ok(team.monsters.length<=3,'each team shares three Monster Zones');
    assert.ok(team.backrow.length<=3,'each team shares three Spell/Trap Zones');
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
    'the private Discord menu must expose legal action index '+index);
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
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m330-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'a rejected inactive partner action must not mutate the persisted duel');
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the Bottomless response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the active physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m330-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(targetEntry,scenario){
  const ids=[0,1,2,3].map(member);
  const required=[BOTTOMLESS,high.id,low.id,allyEntry.id,defenderEntry.id,targetEntry.id];
  const players=ids.map((id,seat)=>({id,name:'M330 Seat '+seat,cards:deck(required)}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m330-'+scenario});
  state.core.turn=3;
  assert.equal(tag.tagDecisionMember(state).id,member(0),'seat 0 must be the active summoning representative');
  const trapCard=takePhysical(state,3,BOTTOMLESS);
  const trap={...trapCard,faceUp:false,setTurn:0};
  state.core.players[1].backrow.push(trap);
  const ally=deploy(state,2,allyEntry.id,'atk');
  const defender=deploy(state,1,defenderEntry.id,'def');
  const summon=ensureInHand(state,0,targetEntry.id);
  const before=inventory(state);
  assert.match(trap.uid,/^m3:/,'Bottomless retains inactive physical seat 3 ownership');
  assert.match(ally.uid,/^m2:/);
  assert.match(defender.uid,/^m1:/);
  assertRules(state);
  assertPrivateHands(state);
  assert.ok(!JSON.stringify(tag.publicTagDuel(state)).includes(BOTTOMLESS),
    'the set Trap identity must remain private');
  assert.ok(!JSON.stringify(tag.publicTagDuel(state)).includes(trap.uid),
    'the set Trap UID must remain private');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m330-'+scenario,guild='m330-guild',channel='m330-channel';
  const members=ids.map((id,seat)=>({id,name:'M330 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,trap,ally,defender,summon,targetEntry,before,record:store.getTag(id)};
}
async function summon(record,actor,uid,requestId){
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='summon'&&action.card===uid&&action.position==='atk');
  assert.ok(index>=0,'the physical owner must receive a legal Normal Summon action');
  return submit(record,actor,index,requestId);
}
test('active defender activates partner-owned Bottomless through Discord and banishes the eligible summon',async()=>{
  const fixture=setup(high,'high-atk');
  assert.ok(high.card.atk>=1500);
  let current=await summon(fixture.record,member(0),fixture.summon.uid,fixture.id+'-summon');
  assert.equal(current.state.core.phase,'response','the eligible summon must open a real Trap response window');
  assert.equal(tag.tagDecisionMember(current.state).id,member(1),
    'the active physical defender receives summon-response priority');
  const actions=tag.tagActions(current.state,member(1));
  const index=actions.findIndex(action=>
    action.kind==='trap'&&action.card===fixture.trap.uid&&action.target===fixture.summon.uid
  );
  assert.ok(index>=0,'the private Discord menu must expose partner-owned Bottomless for the eligible summon');
  await rejectInactivePartner(current,member(1),member(3),index,'bottomless-high');
  current=await submit(current,member(1),index,fixture.id+'-activate-bottomless');
  current=await settleResponses(current,'bottomless-high-resolve');
  const state=current.state;
  assert.ok(state.core.players[0].banished.some(card=>card.uid===fixture.summon.uid),
    'the eligible summoned monster is banished');
  assert.ok(!state.core.players[0].grave.some(card=>card.uid===fixture.summon.uid),
    'the banished monster does not enter the Graveyard');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.ally.uid),
    'another monster on the summoning team remains');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===fixture.defender.uid),
    'the defending teammate monster remains');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.trap.uid),
    'the activated partner-owned Trap enters the defending team Graveyard');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});
test('Bottomless is absent from the Discord response window for a summon below 1500 ATK',async()=>{
  const fixture=setup(low,'low-atk');
  assert.ok(low.card.atk<1500);
  let current=await summon(fixture.record,member(0),fixture.summon.uid,fixture.id+'-summon');
  assert.equal(current.state.core.phase,'main',
    'an ineligible summon resolves without opening a response chain');
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.summon.uid),
    'the under-threshold monster remains on the shared field');
  assert.ok(!current.state.core.players[0].banished.some(card=>card.uid===fixture.summon.uid));
  assert.ok(!current.state.core.players[0].grave.some(card=>card.uid===fixture.summon.uid));
  assert.ok(current.state.core.players[1].backrow.some(card=>card.uid===fixture.trap.uid&&!card.faceUp),
    'the unused partner-owned Set Trap remains on the field');
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
