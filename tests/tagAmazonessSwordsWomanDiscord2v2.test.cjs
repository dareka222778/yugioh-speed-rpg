'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m267-amazoness-swords-discord-'));
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

const SWORD='94004268';
const BLUE_EYES='89631139';
const CELTIC_GUARDIAN='91152256';
assert.equal(getPlayableCard(SWORD)?.englishName,'Amazoness Swords Woman');
assert.equal(getCardStatus(SWORD)?.stage,'certified');
assert.equal(getEffect(SWORD)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(SWORD),{
  trigger:'continuous',
  operation:{
    kind:'continuous',
    rules:[{kind:'combat',filter:{selfOnly:true},rule:{kind:'damage',mode:'reflect',when:'battle'}}]
  }
});
assert.equal(getPlayableCard(BLUE_EYES)?.atk,3000);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);

const core=[SWORD,BLUE_EYES,CELTIC_GUARDIAN];
const fillers=[...new Set(tag.tagNormalCardIds)].filter(id=>!core.includes(id)).slice(0,17);
assert.equal(fillers.length,17,'the Discord fixture needs seventeen certified Normal Monster fillers');
const POOL=[...core,...fillers];
assert.equal(POOL.length,20);
assert.equal(new Set(POOL).size,20);
function member(seat){return 'm267-seat-'+seat;}
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
  throw new Error('M267 physical card missing from seat '+seat+': '+id);
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
function interaction(record,actor,index,requestId){
  const calls=[];
  return {
    id:requestId,guildId:record.guild,user:{id:actor},
    customId:'tag:act:'+record.id+':'+record.revision+':'+actor,
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
    current=await submit(current,actor,pass,'m267-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M267 Seat '+seat,cards:deck()}));
  const first=scenario==='defending'?3:2;
  const state=tag.createTagDuel(players,{classic:true,first,seed:'m267-swords-'+scenario});
  state.core.turn=3;
  const expectedActor=scenario==='defending'?3:2;
  assert.equal(tag.tagDecisionMember(state).id,ids[expectedActor]);
  const before=inventory(state);
  const sourceSeat=scenario==='defending'?2:0;
  const sword=placeMonster(state,sourceSeat,SWORD,'atk');
  const targetId=scenario==='normal-damage'?CELTIC_GUARDIAN:BLUE_EYES;
  const defender=placeMonster(state,3,targetId,'atk');
  assert.match(sword.uid,/^m[02]:/,'the Swords Woman must belong physically to a partner seat');
  assert.match(defender.uid,/^m3:/);
  assertRules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertPrivateHands(state);

  const id='m267-amazoness-'+scenario,guild='m267-guild',channel='m267-channel';
  const members=ids.map((id,seat)=>({id,name:'M267 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,ids,before,sword,defender,actor:ids[expectedActor],record:store.getTag(id)};
}
async function resolveBattle(fixture,scenario){
  let current=fixture.record;
  const actor=fixture.actor;
  const battle=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='battle');
  assert.ok(battle>=0,'the current physical seat must be able to enter the Battle Phase');
  current=await submit(current,actor,battle,'m267-'+scenario+'-battle');
  current=await settleResponses(current,scenario);
  const attackingSword=scenario!=='defending';
  const attack=tag.tagActions(current.state,actor).findIndex(action=>
    action.kind==='attack'&&action.card===(attackingSword?fixture.sword.uid:fixture.defender.uid)&&
    action.target===(attackingSword?fixture.defender.uid:fixture.sword.uid)
  );
  assert.ok(attack>=0,'the actual Discord action menu must offer the intended shared-field attack');
  current=await submit(current,actor,attack,'m267-'+scenario+'-attack');
  current=await settleResponses(current,scenario);
  return current;
}
function assertPublicPayload(state,expectedLp){
  const payload=tagPublicMessage(state);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(state))assert.ok(!rendered.includes(card.uid),'public Discord payload leaked UID '+card.uid);
  assert.ok(rendered.includes(expectedLp+' PV'),'public field embed must show the resolved team LP');
}

test('Amazoness Swords Woman reflects battle damage when the inactive partner-owned monster attacks',async()=>{
  const fixture=setup('attacking');
  const current=await resolveBattle(fixture,'attacking');
  assert.equal(current.state.core.players[0].lp,4000,'the Swords Woman team receives no battle damage');
  assert.equal(current.state.core.players[1].lp,2500,'the opposing team receives the reflected 1500 damage');
  assert.ok(current.state.core.players[0].grave.some(card=>card.uid===fixture.sword.uid));
  assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===fixture.defender.uid));
  assertPublicPayload(current.state,2500);
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});

test('Amazoness Swords Woman reflects battle damage when the inactive partner-owned monster defends',async()=>{
  const fixture=setup('defending');
  const current=await resolveBattle(fixture,'defending');
  assert.equal(current.state.core.players[0].lp,4000,'the Swords Woman team receives no battle damage');
  assert.equal(current.state.core.players[1].lp,2500,'the attacking team receives the reflected 1500 damage');
  assert.ok(current.state.core.players[0].grave.some(card=>card.uid===fixture.sword.uid));
  assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===fixture.defender.uid));
  assertPublicPayload(current.state,2500);
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});

test('Amazoness Swords Woman does not redirect ordinary damage dealt to the opponent',async()=>{
  const fixture=setup('normal-damage');
  const current=await resolveBattle(fixture,'normal-damage');
  assert.equal(current.state.core.players[0].lp,4000);
  assert.equal(current.state.core.players[1].lp,3900,'the opposing team receives the ordinary 100 battle damage');
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.sword.uid));
  assert.ok(current.state.core.players[1].grave.some(card=>card.uid===fixture.defender.uid));
  assertPublicPayload(current.state,3900);
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
