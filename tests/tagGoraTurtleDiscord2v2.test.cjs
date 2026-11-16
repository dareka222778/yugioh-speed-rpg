'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m275-gora-turtle-discord-'));
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

const GORA_TURTLE='80233946';
const BLUE_EYES='89631139';
const CELTIC_GUARDIAN='91152256';

assert.deepEqual(getMonsterEffect(GORA_TURTLE)?.operation,{
  kind:'continuous',
  rules:[{kind:'preventAttack',filter:{controller:'both',minimumCurrentAtk:1900},declarationOnly:true}]
});
assert.equal(getCardStatus(GORA_TURTLE)?.stage,'certified');
assert.equal(getEffect(GORA_TURTLE)?.kind,'monsterEffect');
assert.equal(getPlayableCard(GORA_TURTLE)?.atk,1100);
assert.equal(getPlayableCard(BLUE_EYES)?.atk,3000);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);

const CORE=[GORA_TURTLE,BLUE_EYES,CELTIC_GUARDIAN];
const fillers=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!CORE.includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(fillers.length>=17,'the isolated Discord fixture needs seventeen certified Normal Monsters');
const POOL=[...CORE,...fillers.slice(0,17).map(entry=>entry.id)];
assert.equal(POOL.length,20);
assert.equal(new Set(POOL).size,20);

function member(seat){return 'm275-seat-'+seat;}
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
  throw new Error('M275 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,id,faceUp=true,position='atk'){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,
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
  assert.ok(menu,'the real private Discord panel must expose the action menu');
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
function allPanelOptions(record,actor,actionCount){
  const values=[];
  const pages=Math.max(1,Math.ceil(actionCount/20));
  for(let page=0;page<pages;page++){
    const panel=tagPrivateMessage(record,actor,page);
    validateDiscordPayload(panel);
    const components=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
    const menu=components.find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
    if(menu)for(const option of menu.options)values.push(option.value);
  }
  return values;
}
function setup(scenario){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M275 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:scenario.first,seed:'m275-gora-'+scenario.id});
  state.core.turn=3;
  const actor=ids[scenario.actorSeat];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const before=inventory(state);
  const source=placeMonster(state,2,GORA_TURTLE,scenario.faceUp,scenario.faceUp?'atk':'def');
  const high=placeMonster(state,scenario.highSeat,BLUE_EYES);
  const low=placeMonster(state,scenario.lowSeat,CELTIC_GUARDIAN);
  assert.match(source.uid,/^m2:/,'Gora Turtle must retain physical seat 2 ownership');
  assert.match(high.uid,new RegExp('^m'+scenario.highSeat+':'));
  assert.match(low.uid,new RegExp('^m'+scenario.lowSeat+':'));
  assert.equal(source.faceUp,scenario.faceUp);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const id='m275-'+scenario.id,guild='m275-guild',channel='m275-channel';
  const members=ids.map((id,seat)=>({id,name:'M275 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,ids,before,source,high,low,actor,record:store.getTag(id),scenario};
}
async function enterBattle(fixture){
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const battle=actions.findIndex(action=>action.kind==='battle');
  assert.ok(battle>=0,'the active physical teammate must be able to enter the Battle Phase');
  return submit(fixture.record,fixture.actor,battle,'m275-'+fixture.scenario.id+'-battle');
}
function assertPublicPayload(state){
  const payload=tagPublicMessage(state);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(state)){
    assert.ok(!rendered.includes(card.uid),'public Discord payload leaked physical UID '+card.uid);
  }
}
for(const scenario of [
  {id:'own-team',first:0,actorSeat:0,highSeat:0,lowSeat:2,faceUp:true,highAllowed:false,lowAllowed:true},
  {id:'opposing-team',first:1,actorSeat:1,highSeat:3,lowSeat:1,faceUp:true,highAllowed:false,lowAllowed:true},
  {id:'facedown-source',first:1,actorSeat:1,highSeat:3,lowSeat:1,faceUp:false,highAllowed:true,lowAllowed:true}
]){
  test('Gora Turtle Discord attack menu: '+scenario.id,async()=>{
    const fixture=setup(scenario);
    const current=await enterBattle(fixture);
    const actions=tag.tagActions(current.state,fixture.actor);
    const highIndex=actions.findIndex(action=>action.kind==='attack'&&action.card===fixture.high.uid);
    const lowIndex=actions.findIndex(action=>action.kind==='attack'&&action.card===fixture.low.uid);
    assert.equal(highIndex>=0,scenario.highAllowed,
      'the 1900+ ATK partner-owned attack must follow the face-up global declaration lock');
    assert.equal(lowIndex>=0,scenario.lowAllowed,
      'a 1400 ATK monster must remain legal under the 1900 threshold');
    const options=allPanelOptions(current,fixture.actor,actions.length);
    if(scenario.highAllowed)assert.ok(options.includes(String(highIndex)));
    else assert.equal(highIndex,-1);
    assert.ok(options.includes(String(lowIndex)),
      'the actual Discord action menu must expose the legal below-threshold attack');
    const partnerSeat=fixture.scenario.highSeat===fixture.actorSeat?2:fixture.scenario.highSeat;
    if(partnerSeat!==fixture.actorSeat){
      assert.deepEqual(tag.tagActions(current.state,member(partnerSeat)),[],
        'an inactive physical teammate cannot submit the active seat menu');
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
