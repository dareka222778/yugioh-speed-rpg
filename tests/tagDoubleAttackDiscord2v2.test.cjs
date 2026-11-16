'use strict';
const {test:nodeTest,after}=require('node:test');
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M277 test diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m277-double-attack-discord-'));
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

const HAYABUSA_KNIGHT='21015833';
const TWINHEADED_BEAST='82035781';
const BATTLE_WARRIOR='55550921';
const MYSTICAL_ELF='15025844';
const CELTIC_GUARDIAN='91152256';

const fillers=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>![BATTLE_WARRIOR,MYSTICAL_ELF,CELTIC_GUARDIAN].includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
const normalIds=fillers.slice(0,8).map(entry=>entry.id);
test('M277 certified multi-attack card and fixture preflight',()=>{
  for(const [id,name,atk] of [
    [HAYABUSA_KNIGHT,'Hayabusa Knight',1000],
    [TWINHEADED_BEAST,'Twinheaded Beast',1700]
  ]){
    assert.equal(getPlayableCard(id)?.englishName,name);
    assert.equal(getPlayableCard(id)?.atk,atk);
    assert.equal(getCardStatus(id)?.stage,'certified');
    assert.equal(getEffect(id)?.kind,'monsterEffect');
    assert.deepEqual(getMonsterEffect(id)?.operation,{
      kind:'continuous',
      rules:[{kind:'combat',filter:{selfOnly:true},rule:{kind:'attacks',maximum:2}}]
    });
  }
  assert.equal(getPlayableCard(BATTLE_WARRIOR)?.atk,700);
  assert.equal(getPlayableCard(MYSTICAL_ELF)?.atk,800);
  assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);
  assert.ok(fillers.length>=8,'the isolated multi-attack fixture needs eight certified Normal Monsters');
  assert.equal(new Set(normalIds).size,8);
});
function member(seat){return 'm277-seat-'+seat;}
function deck(sourceId){
  const ids=[...new Set([sourceId,BATTLE_WARRIOR,MYSTICAL_ELF,CELTIC_GUARDIAN,...normalIds])];
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
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
  throw new Error('M277 physical card missing from seat '+seat+': '+id);
}
function deploy(state,seat,id){
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
  for(const team of state.core.players){
    assert.ok(team.monsters.length<=3,'each shared team field has only three Monster Zones');
    assert.ok(team.backrow.length<=3,'each shared team field has only three Spell/Trap Zones');
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
function assertPublicPayload(state){
  const payload=tagPublicMessage(state);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(state)){
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
  assert.ok(menu,'the real private Discord panel must expose the action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the Discord menu must contain the legal action index '+index);
  const i=interaction(record,actor,index,requestId);
  const selected=tag.tagActions(record.state,actor)[index];
  let refreshes=0;
  try{await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});}catch(error){console.error('[M277 submit diagnostic]',JSON.stringify({id:record.id,actor,index,requestId,phase:record.state.core.phase,selected},null,2));throw error;}
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
    current=await submit(current,actor,pass,'m277-'+suffix+'-pass-'+guard);
  }
  return current;
}
async function rejectInactivePartner(record,actor,partner,index,suffix){
  assert.deepEqual(tag.tagActions(record.state,partner),[],
    'the inactive physical owner cannot submit an attack during the partner turn');
  const forged=interaction(record,partner,index,'m277-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[],'forged partner action must be rejected before defer');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'rejected partner action must not mutate the duel');
}
function setup(sourceId,scenario){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M277 Seat '+seat,cards:deck(sourceId)}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m277-'+scenario+'-'+sourceId});
  state.core.turn=3;
  const actor=ids[0];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const before=inventory(state);
  const source=deploy(state,2,sourceId);
  const firstTarget=deploy(state,1,BATTLE_WARRIOR);
  const secondTarget=deploy(state,3,MYSTICAL_ELF);
  const thirdTarget=deploy(state,1,CELTIC_GUARDIAN);
  assert.match(source.uid,/^m2:/);
  assert.match(firstTarget.uid,/^m1:/);
  assert.match(secondTarget.uid,/^m3:/);
  assert.match(thirdTarget.uid,/^m1:/);
  assert.equal(state.core.players[1].monsters.length,3,
    'three opposing monsters must occupy exactly the shared team field capacity');
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const id='m277-'+scenario+'-'+sourceId,guild='m277-guild',channel='m277-channel';
  const members=ids.map((id,seat)=>({id,name:'M277 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor,source,firstTarget,secondTarget,thirdTarget,before,record:store.getTag(id)};
}
async function enterBattle(fixture){
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const battle=actions.findIndex(action=>action.kind==='battle');
  assert.ok(battle>=0,'the active teammate must see the Battle Phase action in Discord');
  let current=await submit(fixture.record,fixture.actor,battle,'m277-'+fixture.id+'-battle');
  return settleResponses(current,fixture.id+'-battle');
}
async function attack(fixture,record,target,suffix){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.source.uid&&action.target===target.uid
  );
  assert.ok(index>=0,'the Discord action list must expose the next legal partner-owned attack');
  await rejectInactivePartner(record,fixture.actor,member(2),index,suffix);
  const current=await submit(record,fixture.actor,index,'m277-'+suffix+'-attack');
  return settleResponses(current,suffix+'-resolve');
}

for(const [sourceId,name,atk] of [
  [HAYABUSA_KNIGHT,'Hayabusa Knight',1000],
  [TWINHEADED_BEAST,'Twinheaded Beast',1700]
]){
  test(name+' can attack twice through Discord in one shared 2v2 Battle Phase',async()=>{
    const fixture=setup(sourceId,name.toLowerCase().replaceAll(' ','-'));
    const beforeOppLP=fixture.record.state.core.players[1].lp;
    let current=await enterBattle(fixture);
    current=await attack(fixture,current,fixture.firstTarget,name+'-first');
    assert.ok(current.state.core.players[1].grave.some(card=>
      card.uid===fixture.firstTarget.uid&&card.id===BATTLE_WARRIOR
    ),'the first destroyed target must enter the shared Graveyard with its physical UID');
    assert.equal(current.state.core.players[1].lp,beforeOppLP-(atk-700),
      'the first battle damage must be applied to the opposing shared team');
    assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid),
      'the source must remain on the shared field after its first attack');

    current=await attack(fixture,current,fixture.secondTarget,name+'-second');
    assert.ok(current.state.core.players[1].grave.some(card=>
      card.uid===fixture.secondTarget.uid&&card.id===MYSTICAL_ELF
    ),'the second destroyed target must enter the shared Graveyard with its physical UID');
    assert.equal(current.state.core.players[1].lp,beforeOppLP-(atk-700)-(atk-800),
      'both attacks must apply their own damage to the shared opposing team');
    assert.ok(current.state.core.players[1].monsters.some(card=>
      card.uid===fixture.thirdTarget.uid&&card.id===CELTIC_GUARDIAN
    ),'the third opposing monster must remain as a control target');
    assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid),
      'the multi-attack source must survive both winning attacks');

    const further=tag.tagActions(current.state,fixture.actor).filter(action=>
      action.kind==='attack'&&action.card===fixture.source.uid
    );
    assert.deepEqual(further,[],'the source cannot declare a third attack in the same Battle Phase');
    assert.equal(current.state.core.phase,'battle',
      'the second attack must not prematurely end the shared Battle Phase');
    assertConserved(current.state,fixture.before);
    assertPrivateHands(current.state);
    assertRules(current.state);
    assertPublicPayload(current.state);
    assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
  });
}

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
