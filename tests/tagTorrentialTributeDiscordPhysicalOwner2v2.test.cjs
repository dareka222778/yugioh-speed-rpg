'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m325-torrential-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M325 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const TORRENTIAL='53582587';
const SUMMON='48305365';
const MONSTERS=[
  {id:'46986414',name:'Dark Magician',seat:1,faceUp:true},
  {id:'91152256',name:'Celtic Guardian',seat:2,faceUp:true},
  {id:'89631139',name:'Blue-Eyes White Dragon',seat:3,faceUp:false}
];
assert.equal(getPlayableCard(TORRENTIAL)?.englishName,'Torrential Tribute');
assert.equal(getEffect(TORRENTIAL)?.kind,'torrentialTribute');
assert.equal(getCardStatus(TORRENTIAL)?.stage,'certified');
assert.equal(getPlayableCard(SUMMON)?.englishName,'Axe Raider');
assert.equal(getEffect(SUMMON)?.kind,'normal');
for(const m of MONSTERS)assert.equal(getPlayableCard(m.id)?.englishName,m.name);
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20);
function member(seat){return 'm325-seat-'+seat;}
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
  throw new Error('M325 physical card missing from seat '+seat+': '+id);
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
  const id='m325-torrential-discord';
  const ids=[0,1,2,3].map(member);
  const members=ids.map((id,seat)=>({id,name:'M325 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m325-guild','m325-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(){
  const ids=[0,1,2,3].map(member);
  const required=ids.map((id,seat)=>[
    ...(seat===0?[SUMMON]:[]),
    ...(seat===3?[TORRENTIAL]:[]),
    ...MONSTERS.filter(m=>m.seat===seat).map(m=>m.id)
  ]);
  const players=ids.map((id,seat)=>({id,name:'M325 Seat '+seat,cards:deck(required[seat])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m325-torrential'});
  state.core.turn=3;
  const trap=takePhysical(state,3,TORRENTIAL);
  state.core.players[1].backrow.push({...trap,faceUp:false,setTurn:1});
  const summon=takePhysical(state,0,SUMMON);
  holder(state,0).hand.push(summon);
  const physicalMonsters=MONSTERS.map(spec=>{
    const card=takePhysical(state,spec.seat,spec.id);
    return {id:card.id,uid:card.uid,owner:spec.seat%2,position:spec.faceUp?'atk':'def',faceUp:spec.faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  });
  state.core.players[0].monsters.push(physicalMonsters.find(m=>m.owner===0));
  state.core.players[1].monsters.push(...physicalMonsters.filter(m=>m.owner===1));
  assert.ok(trap.uid.startsWith('m3:'));
  assert.ok(summon.uid.startsWith('m0:'));
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const hands=new Map([0,1,2,3].map(seat=>[seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)]));
  const decks=new Map([0,1,2,3].map(seat=>[seat,holder(state,seat).deck.map(card=>card.uid)]));
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicBefore.includes(trap.id),'a Set Trap identity must stay hidden in the public field');
  assert.ok(!publicBefore.includes(trap.uid),'a Set Trap physical UID must stay private');
  const hidden=physicalMonsters.find(m=>!m.faceUp);
  assert.ok(!publicBefore.includes(hidden.id));
  assert.ok(!publicBefore.includes(hidden.uid));
  return {trap,summon,physicalMonsters,before,hands,decks,record:register(state)};
}

test('Torrential Tribute set by the inactive partner can be activated by the active teammate after a Normal Summon and destroys both shared fields',async()=>{
  const fixture=setup();
  const actor=member(0);
  const summonActions=tag.tagActions(fixture.record.state,actor);
  const summonIndex=summonActions.findIndex(action=>action.kind==='summon'&&action.card===fixture.summon.uid&&action.position==='atk');
  assert.ok(summonIndex>=0,'the active physical representative must receive the Normal Summon action');
  assert.deepEqual(tag.tagActions(fixture.record.state,member(2)),[],
    'the inactive allied partner cannot submit the Normal Summon');
  await rejectInactive(fixture.record,2,summonIndex,0,'m325-forged-summon');
  let current=await submit(fixture.record,actor,summonIndex,'m325-normal-summon');
  assert.equal(current.state.core.phase,'response','a Normal Summon must open the Torrential response window');
  assert.equal(tag.tagDecisionMember(current.state).id,member(1),
    'the active physical representative of the opposing team receives response priority');
  const responseActions=tag.tagActions(current.state,member(1));
  const trapIndex=responseActions.findIndex(action=>action.kind==='trap'&&action.card===fixture.trap.uid);
  assert.ok(trapIndex>=0,
    'the active teammate must be allowed to activate a Trap physically set by the inactive partner');
  assert.deepEqual(tag.tagActions(current.state,member(3)),[],
    'the inactive physical owner cannot submit the shared-field Trap action');
  await rejectInactive(current,3,trapIndex,1,'m325-forged-trap');
  current=await submit(current,member(1),trapIndex,'m325-torrential-activate');
  const state=current.state;
  assert.deepEqual(state.core.players.map(player=>player.monsters.length),[0,0],
    'Torrential Tribute destroys every monster on both shared fields, including the new summon and face-down monsters');
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,4000],
    'Torrential Tribute destruction does not change team LP');
  const allMonsters=[...fixture.physicalMonsters,{id:fixture.summon.id,uid:fixture.summon.uid,owner:0}];
  for(const monster of allMonsters){
    assert.ok(state.core.players[monster.owner].grave.some(card=>card.uid===monster.uid),
      'each destroyed monster must enter its original team Graveyard: '+monster.uid);
    assert.ok(!state.core.players[1-monster.owner].grave.some(card=>card.uid===monster.uid),
      'destroyed monster must not be routed to the other team: '+monster.uid);
  }
  assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.trap.uid),
    'the Trap physically owned by seat 3 remains in its team shared Graveyard');
  for(const seat of [0,1,2,3]){
    const expected=fixture.hands.get(seat).filter(uid=>!(seat===0&&uid===fixture.summon.uid));
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),expected,
      'summon/Trap resolution must not mutate private hand '+seat);
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),fixture.decks.get(seat),
      'summon/Trap resolution must not mutate physical Deck '+seat);
  }
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
