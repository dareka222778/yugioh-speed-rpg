'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m271-amazoness-fighter-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const AMAZONESS_FIGHTER='55821894';
const AXE_RAIDER='48305365';
const CELTIC_GUARDIAN='91152256';

assert.equal(getPlayableCard(AMAZONESS_FIGHTER)?.englishName,'Amazoness Fighter');
assert.equal(getPlayableCard(AMAZONESS_FIGHTER)?.atk,1500);
assert.equal(getCardStatus(AMAZONESS_FIGHTER)?.stage,'certified');
assert.equal(getEffect(AMAZONESS_FIGHTER)?.kind,'monsterEffect');
assert.equal(getMonsterEffect(AMAZONESS_FIGHTER)?.trigger,'continuous');
assert.equal(getMonsterEffect(AMAZONESS_FIGHTER)?.operation.kind,'continuous');
assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);

const CORE=[AMAZONESS_FIGHTER,AXE_RAIDER,CELTIC_GUARDIAN];
const fillers=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!CORE.includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(fillers.length>=17,'the isolated Discord fixture needs seventeen certified Normal Monster fillers');
const POOL=[...CORE,...fillers.slice(0,17).map(entry=>entry.id)];
assert.equal(POOL.length,20);
assert.equal(new Set(POOL).size,20);

function member(seat){return 'm271-seat-'+seat;}
function deck(){return [...POOL];}
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
  throw new Error('M271 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,id,position='atk'){
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
  assert.equal(cards.length,before.size,'Amazoness Fighter battle resolution must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
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
  assert.ok(menu,'the actual private Discord panel must expose the action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the Discord menu must contain the legal action index '+index);
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
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the battle response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m271-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M271 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{
    classic:true,first:scenario.first,seed:'m271-amazoness-fighter-'+scenario.name
  });
  state.core.turn=3;
  const actor=ids[scenario.actorSeat];
  assert.equal(tag.tagDecisionMember(state).id,actor,
    'the intended physical teammate must control the Discord action');
  const before=inventory(state);
  const fighter=placeMonster(state,scenario.fighterSeat,AMAZONESS_FIGHTER,'atk');
  const opponent=placeMonster(state,scenario.opponentSeat,scenario.opponentCard,'atk');
  assert.match(fighter.uid,new RegExp('^m'+scenario.fighterSeat+':'));
  assert.match(opponent.uid,new RegExp('^m'+scenario.opponentSeat+':'));
  assert.equal(fighter.owner,scenario.fighterSeat%2);
  assert.equal(opponent.owner,scenario.opponentSeat%2);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const id='m271-amazoness-fighter-'+scenario.name;
  const guild='m271-guild',channel='m271-channel';
  const members=ids.map((id,seat)=>({id,name:'M271 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {
    id,ids,before,fighter,opponent,actor,partnerSeat:scenario.partnerSeat,
    attacker:scenario.attacker==='fighter'?fighter:opponent,
    target:scenario.attacker==='fighter'?opponent:fighter,
    record:store.getTag(id),scenario
  };
}
async function resolveBattle(fixture){
  let current=fixture.record;
  const actor=fixture.actor;
  const battle=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='battle');
  assert.ok(battle>=0,'the active teammate must be able to enter the Battle Phase');
  current=await submit(current,actor,battle,'m271-'+fixture.scenario.name+'-battle');
  current=await settleResponses(current,fixture.scenario.name);

  const actions=tag.tagActions(current.state,actor);
  const attack=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.target.uid
  );
  assert.ok(attack>=0,'the real Discord action menu must expose the intended shared-field attack');
  assert.deepEqual(tag.tagActions(current.state,member(fixture.partnerSeat)),[],
    'the inactive physical partner cannot submit the active teammate attack');

  const forged=interaction(current,member(fixture.partnerSeat),attack,
    'm271-'+fixture.scenario.name+'-forged-partner',actor);
  const unchanged=JSON.stringify(current.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[],'forged partner interaction must be rejected before defer');
  assert.equal(store.getTag(current.id).revision,current.revision);
  assert.equal(JSON.stringify(store.getTag(current.id).state),unchanged,
    'rejected partner action must not mutate the duel');

  current=await submit(current,actor,attack,'m271-'+fixture.scenario.name+'-attack');
  return settleResponses(current,fixture.scenario.name);
}
function assertPublicPayload(state){
  const payload=tagPublicMessage(state);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(state)){
    assert.ok(!rendered.includes(card.uid),'public Discord payload leaked physical UID '+card.uid);
  }
}
function assertFinalState(fixture,current,expected){
  const team0=current.state.core.players[0];
  const team1=current.state.core.players[1];
  assert.equal(team0.lp,expected.team0Lp);
  assert.equal(team1.lp,expected.team1Lp);
  if(expected.fighterDestroyed){
    assert.ok(team0.grave.some(card=>card.uid===fixture.fighter.uid&&card.id===AMAZONESS_FIGHTER),
      'Amazoness Fighter must still be destroyed when its battle damage is prevented');
    assert.ok(!team0.monsters.some(card=>card.uid===fixture.fighter.uid));
  }else{
    assert.ok(team0.monsters.some(card=>card.uid===fixture.fighter.uid&&card.id===AMAZONESS_FIGHTER),
      'Amazoness Fighter must remain on the field after winning its battle');
  }
  if(expected.opponentDestroyed){
    assert.ok(team1.grave.some(card=>card.uid===fixture.opponent.uid&&card.id===CELTIC_GUARDIAN));
    assert.ok(!team1.monsters.some(card=>card.uid===fixture.opponent.uid));
  }else{
    assert.ok(team1.monsters.some(card=>card.uid===fixture.opponent.uid),
      'the stronger opposing monster must survive');
  }
  assertPublicPayload(current.state);
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
}

const SCENARIOS=[
  {
    name:'partner-owned attacker loses without damaging its team',
    first:2,actorSeat:2,partnerSeat:0,fighterSeat:0,opponentSeat:3,
    opponentCard:AXE_RAIDER,attacker:'fighter',
    expected:{team0Lp:4000,team1Lp:4000,fighterDestroyed:true,opponentDestroyed:false}
  },
  {
    name:'partner-owned defender prevents damage from the opposing active teammate',
    first:3,actorSeat:3,partnerSeat:1,fighterSeat:2,opponentSeat:1,
    opponentCard:AXE_RAIDER,attacker:'opponent',
    expected:{team0Lp:4000,team1Lp:4000,fighterDestroyed:true,opponentDestroyed:false}
  },
  {
    name:'winning attacker still inflicts ordinary damage on the opposing team',
    first:2,actorSeat:2,partnerSeat:0,fighterSeat:0,opponentSeat:3,
    opponentCard:CELTIC_GUARDIAN,attacker:'fighter',
    expected:{team0Lp:4000,team1Lp:3900,fighterDestroyed:false,opponentDestroyed:true}
  }
];
for(const scenario of SCENARIOS){
  test('Amazoness Fighter Discord battle rule: '+scenario.name,async()=>{
    const fixture=setup(scenario);
    const current=await resolveBattle(fixture);
    assertFinalState(fixture,current,scenario.expected);
  });
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
