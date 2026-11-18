'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m274-obnoxious-celtic-'));
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

const OBNOXIOUS_CELTIC='52077741';
const BLUE_EYES='89631139';
const CELTIC_GUARDIAN='91152256';

assert.equal(getPlayableCard(OBNOXIOUS_CELTIC)?.englishName,'Obnoxious Celtic Guard');
assert.equal(getPlayableCard(OBNOXIOUS_CELTIC)?.atk,1400);
assert.equal(getCardStatus(OBNOXIOUS_CELTIC)?.stage,'certified');
assert.equal(getEffect(OBNOXIOUS_CELTIC)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(OBNOXIOUS_CELTIC)?.operation,{
  kind:'continuous',
  rules:[{kind:'combat',filter:{selfOnly:true},rule:{kind:'indestructible',opponentAtkAtLeast:1900}}]
});
assert.equal(getPlayableCard(BLUE_EYES)?.atk,3000);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);

const CORE=[OBNOXIOUS_CELTIC,BLUE_EYES,CELTIC_GUARDIAN];
const fillers=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!CORE.includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(fillers.length>=17,'the isolated Discord fixture needs seventeen certified Normal Monsters');
const POOL=[...CORE,...fillers.slice(0,17).map(entry=>entry.id)];
assert.equal(POOL.length,20);
assert.equal(new Set(POOL).size,20);

function member(seat){return 'm274-seat-'+seat;}
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
  throw new Error('M274 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,id){
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
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<30,'the battle response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m274-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(entry){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M274 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:1,seed:'m274-obnoxious-'+entry.id});
  state.core.turn=3;
  const actor=ids[1];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const before=inventory(state);
  const guard=placeMonster(state,2,OBNOXIOUS_CELTIC);
  const attacker=placeMonster(state,3,entry.attacker);
  assert.match(guard.uid,/^m2:/);
  assert.match(attacker.uid,/^m3:/,'the attacker must retain inactive partner physical ownership');
  assert.equal(guard.owner,0);
  assert.equal(attacker.owner,1);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const id='m274-'+entry.id,guild='m274-guild',channel='m274-channel';
  const members=ids.map((id,seat)=>({id,name:'M274 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,ids,before,guard,attacker,actor,record:store.getTag(id),entry};
}
async function resolveBattle(fixture){
  let current=fixture.record;
  const actor=fixture.actor;
  const battle=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='battle');
  assert.ok(battle>=0);
  current=await submit(current,actor,battle,'m274-'+fixture.entry.id+'-battle');
  current=await settleResponses(current,fixture.entry.id);

  const attack=tag.tagActions(current.state,actor).findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.guard.uid
  );
  assert.ok(attack>=0,'the active teammate must attack the partner-owned Obnoxious Celtic Guard');
  assert.deepEqual(tag.tagActions(current.state,member(3)),[],
    'the inactive physical attacker owner cannot submit the active teammate action');

  const forged=interaction(current,member(3),attack,'m274-'+fixture.entry.id+'-forged',actor);
  const unchanged=JSON.stringify(current.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(current.id).revision,current.revision);
  assert.equal(JSON.stringify(store.getTag(current.id).state),unchanged);

  current=await submit(current,actor,attack,'m274-'+fixture.entry.id+'-attack');
  return settleResponses(current,fixture.entry.id);
}
function assertPublicPayload(state){
  const payload=tagPublicMessage(state);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(state)){
    assert.ok(!rendered.includes(card.uid),'public Discord payload leaked physical UID '+card.uid);
  }
}
for(const entry of [
  {id:'high-threshold',attacker:BLUE_EYES,expectedTeam0Lp:2400,guardDestroyed:false,attackerDestroyed:false},
  {id:'below-threshold',attacker:CELTIC_GUARDIAN,expectedTeam0Lp:4000,guardDestroyed:true,attackerDestroyed:true}
]){
  test('Obnoxious Celtic Guard Discord battle threshold: '+entry.id,async()=>{
    const fixture=setup(entry);
    const current=await resolveBattle(fixture);
    const team0=current.state.core.players[0];
    const team1=current.state.core.players[1];
    assert.equal(team0.lp,entry.expectedTeam0Lp,
      'battle indestructibility must not prevent ordinary battle damage');
    assert.equal(team1.lp,4000);
    if(entry.guardDestroyed){
      assert.ok(team0.grave.some(card=>card.uid===fixture.guard.uid&&card.id===OBNOXIOUS_CELTIC));
      assert.ok(!team0.monsters.some(card=>card.uid===fixture.guard.uid));
    }else{
      assert.ok(team0.monsters.some(card=>card.uid===fixture.guard.uid&&card.id===OBNOXIOUS_CELTIC),
        'an opposing monster with at least 1900 ATK cannot destroy the Guard');
    }
    if(entry.attackerDestroyed){
      assert.ok(team1.grave.some(card=>card.uid===fixture.attacker.uid&&card.id===entry.attacker));
    }else{
      assert.ok(team1.monsters.some(card=>card.uid===fixture.attacker.uid&&card.id===entry.attacker));
    }
    assertPublicPayload(current.state);
    assertConserved(current.state,fixture.before);
    assertPrivateHands(current.state);
    assertRules(current.state);
    assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
  });
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
