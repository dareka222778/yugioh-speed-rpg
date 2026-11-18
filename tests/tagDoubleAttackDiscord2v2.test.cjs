'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m352-double-attack-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getCardStatus,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const HAYABUSA_KNIGHT='21015833';
const TWINHEADED_BEAST='82035781';
const CELTIC_GUARDIAN='91152256';
for(const id of [HAYABUSA_KNIGHT,TWINHEADED_BEAST]){
  assert.equal(getCardStatus(id)?.stage,'certified');
  assert.equal(getEffect(id)?.kind,'monsterEffect');
  assert.deepEqual(getMonsterEffect(id)?.operation.rules[0],{
    kind:'combat',filter:{selfOnly:true},rule:{kind:'attacks',maximum:2}
  });
}
assert.equal(getPlayableCard(HAYABUSA_KNIGHT)?.englishName,'Hayabusa Knight');
assert.equal(getPlayableCard(HAYABUSA_KNIGHT)?.atk,1000);
assert.equal(getPlayableCard(TWINHEADED_BEAST)?.englishName,'Twinheaded Beast');
assert.equal(getPlayableCard(TWINHEADED_BEAST)?.atk,1700);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.englishName,'Celtic Guardian');
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);

const LOW_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return id!==CELTIC_GUARDIAN&&card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&card.atk<1000&&Number.isInteger(card.defense);
}).slice(0,3);
assert.equal(LOW_NORMALS.length,3,'the double-attack fixture requires three distinct certified Normal Monsters weaker than Hayabusa Knight');
for(const id of LOW_NORMALS)assert.equal(getCardStatus(id)?.stage,'certified');
const SAFE_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return ![...LOW_NORMALS,CELTIC_GUARDIAN].includes(id)&&
    card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&Number.isInteger(card.defense);
});
assert.ok(SAFE_NORMALS.length>=20,'four physical Decks require twenty distinct Normal Monster fillers');

function member(seat){return 'm352-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...SAFE_NORMALS])];
  assert.ok(ids.length>=20,'each physical Main Deck must contain at least twenty distinct cards');
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
  throw new Error('M352 physical card missing from seat '+seat+': '+id);
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
  for(const team of state.core.players){
    assert.ok(team.monsters.length<=3,'each team shares exactly three Monster Zones');
    assert.ok(team.backrow.length<=3,'each team shares exactly three Spell/Trap Zones');
  }
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra??[]).length<=5);
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical twenty-card Decks must contribute exactly eighty cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'repeated attacks must conserve every physical card');
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
  assert.ok(menu,'the active physical representative must receive the private Discord action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private Discord menu must expose the legal action index '+index);
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1,'the committed Discord action must refresh the public panel');
  return store.getTag(record.id);
}
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const panel=tagPrivateMessage(record,partner);
  validateDiscordPayload(panel);
  const rows=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  assert.ok(!rows.some(row=>row.custom_id?.startsWith('tag:act:')),
    'the inactive physical partner must not receive the active representative action menu');
  const forged=interaction(record,partner,index,'m352-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'inactive partner actions must be rejected before Discord acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the Discord battle response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const pass=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal Pass action');
    current=await submit(current,actor,pass,'m352-'+suffix+'-pass-'+guard);
  }
  return current;
}
function register(state,key){
  const id='m352-'+key+'-'+Date.now();
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M352 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m352-guild','m352-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(attackerId,key){
  const required=[[],[],[],[]];
  required[0].push(attackerId);
  required[1].push(LOW_NORMALS[0],LOW_NORMALS[2]);
  required[3].push(LOW_NORMALS[1]);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M352 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:2,seed:'m352-'+key});
  state.core.turn=3;
  assert.deepEqual(state.active,[2,3],'seats 2 and 3 must be the active team representatives');
  const attacker=placeMonster(state,0,attackerId);
  const targets=[
    placeMonster(state,1,LOW_NORMALS[0]),
    placeMonster(state,3,LOW_NORMALS[1]),
    placeMonster(state,1,LOW_NORMALS[2])
  ];
  assert.match(attacker.uid,/^m0:/,'the attacker must preserve inactive allied partner seat 0 physical ownership');
  for(let i=0;i<targets.length;i++){
    assert.match(targets[i].uid,new RegExp('^m'+(i===1?3:1)+':'),
      'each opposing target must preserve its physical owner UID');
  }
  assert.equal(attacker.owner,0);
  assert.ok(targets.every(card=>card.owner===1));
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const record=register(state,key);
  assertPublicPayload(record);
  return {attacker,targets,before,record,key};
}
async function enterBattle(fixture){
  const actor=member(2);
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active representative must receive the legal Battle Phase action');
  await rejectInactivePartner(fixture.record,actor,member(0),index,fixture.key+'-battle');
  let current=await submit(fixture.record,actor,index,'m352-'+fixture.key+'-battle');
  return settleResponses(current,fixture.key+'-battle');
}
async function attackTarget(fixture,record,target,suffix){
  const actor=member(2);
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===target.uid
  );
  assert.ok(index>=0,'the active representative must receive the legal attack action for target '+target.uid);
  const panel=tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(panel);
  const menu=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
    .find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu&&menu.options.some(option=>option.value===String(index)),
    'the private Discord menu must expose the exact legal repeated attack');
  await rejectInactivePartner(record,actor,member(0),index,suffix);
  let current=await submit(record,actor,index,'m352-'+suffix+'-attack');
  return settleResponses(current,suffix+'-attack');
}
function assertStable(fixture,record){
  assertConserved(record.state,fixture.before);
  assertPrivateHands(record.state);
  assertRules(record.state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(record.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(record.state))));
}
for(const id of [HAYABUSA_KNIGHT,TWINHEADED_BEAST]){
  test('M352 '+getPlayableCard(id).englishName+' attacks twice in one Battle Phase through Discord 2v2, then cannot attack a third time',async()=>{
    const fixture=setup(id,id===HAYABUSA_KNIGHT?'hayabusa-knight':'twinheaded-beast');
    const attackerAtk=getPlayableCard(id).atk;
    let current=await enterBattle(fixture);
    assert.equal(current.state.core.phase,'battle');
    const initialOpponentLP=current.state.core.players[1].lp;
    const firstDamage=attackerAtk-getPlayableCard(LOW_NORMALS[0]).atk;
    current=await attackTarget(fixture,current,fixture.targets[0],fixture.key+'-first');
    assert.equal(current.state.core.players[1].lp,initialOpponentLP-firstDamage,
      'the first successful attack must apply ordinary battle damage to shared opponent LP');
    assert.ok(current.state.core.players[1].grave.some(card=>card.uid===fixture.targets[0].uid));
    const secondActions=tag.tagActions(current.state,member(2));
    assert.ok(secondActions.some(action=>
      action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.targets[1].uid
    ),'the same attacker must receive a second legal attack against a different opposing physical card');
    const secondDamage=attackerAtk-getPlayableCard(LOW_NORMALS[1]).atk;
    current=await attackTarget(fixture,current,fixture.targets[1],fixture.key+'-second');
    assert.equal(current.state.core.players[1].lp,initialOpponentLP-firstDamage-secondDamage,
      'the second attack must apply its own battle damage exactly once');
    assert.ok(current.state.core.players[1].grave.some(card=>card.uid===fixture.targets[1].uid));
    assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===fixture.targets[2].uid),
      'the third target must remain because the card is limited to two attacks');
    const thirdActions=tag.tagActions(current.state,member(2)).filter(action=>
      action.kind==='attack'&&action.card===fixture.attacker.uid
    );
    assert.equal(thirdActions.length,0,'the second attack exhausts the card-specific two-attack limit');
    assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.attacker.uid),
      'the partner-owned attacker must remain on the shared allied field');
    assertStable(fixture,current);
  });
}
test('M352 a Normal Monster without the double-attack effect receives only one attack in the same Battle Phase',async()=>{
  const fixture=setup(CELTIC_GUARDIAN,'normal-monster-control');
  let current=await enterBattle(fixture);
  const initialOpponentLP=current.state.core.players[1].lp;
  const damage=getPlayableCard(CELTIC_GUARDIAN).atk-getPlayableCard(LOW_NORMALS[0]).atk;
  current=await attackTarget(fixture,current,fixture.targets[0],'normal-monster-first');
  assert.equal(current.state.core.players[1].lp,initialOpponentLP-damage);
  const remaining=tag.tagActions(current.state,member(2)).filter(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid
  );
  assert.equal(remaining.length,0,'an ordinary Normal Monster must not inherit the two-attack effect');
  assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===fixture.targets[1].uid));
  assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===fixture.targets[2].uid));
  assertStable(fixture,current);
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
