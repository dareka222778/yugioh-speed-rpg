'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m321-ceal-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const engine=require('../dist/duelEngine');
const {rulesFor}=require('../dist/rulesProfile');

const CEAL='95638658';
const CELTIC_GUARDIAN='91152256';
const SPEAR_DRAGON='31553716';
const BLUE_EYES='89631139';
const required=[
 [CEAL,'Arco Lança Estrelas - Ceal'],
 [CELTIC_GUARDIAN,'Celtic Guardian'],
 [SPEAR_DRAGON,'Spear Dragon'],
 [BLUE_EYES,'Blue-Eyes White Dragon']
];
for(const [id,name] of required){
  assert.equal(getPlayableCard(id)?.englishName,name,'M321 card identity must be canonical: '+id);
  assert.equal(getCardStatus(id)?.stage,'certified','M321 only adds Discord integration for already certified cards');
}
assert.equal(getEffect(CEAL)?.kind,'equip');
assert.equal(getEffect(CEAL)?.atk,-1000);
assert.equal(getEffect(CEAL)?.combat?.some(rule=>rule.kind==='direct'),true);

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'M321 requires twenty certified Normal Monsters for each physical Deck');

function member(seat){return 'm321-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20);
  const result=ids.slice(0,20);
  for(const id of required)assert.ok(result.includes(id),'required card missing from physical Deck: '+id);
  return result;
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
  throw new Error('M321 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,id){
  const physical=takePhysical(state,seat,id);
  const monster={id:physical.id,uid:physical.uid,owner:seat%2,position:'atk',faceUp:true,
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
    assert.ok(team.monsters.length<=3);
    assert.ok(team.backrow.length<=3);
    assert.ok((team.extra??[]).length<=5);
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
  return JSON.stringify(payload.embeds[0].toJSON());
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
async function submitAction(record,actor,index,requestId){
  const panel=tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(panel);
  const components=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  const menu=components.find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu,'the active physical representative must receive a private Discord action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)));
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1,'the shared public field must be refreshed after the action');
  return store.getTag(record.id);
}
async function settle(record,prefix){
  for(let guard=0;record.state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
    const actor=tag.tagDecisionMember(record.state).id;
    const index=tag.tagActions(record.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(index>=0,'the current physical responder must receive a legal Pass action');
    record=await submitAction(record,actor,index,prefix+'-pass-'+guard);
  }
  return record;
}
function register(state){
  const id='m321-ceal-direct';
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M321 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m321-guild','m321-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
async function activateCeal(record,ceal,monster){
  const index=tag.tagActions(record.state,member(0)).findIndex(action=>
    action.kind==='spell'&&action.card===ceal.uid&&action.target===monster.uid
  );
  assert.ok(index>=0,'Ceal must be offered for the partner-owned shared-field monster');
  const forged=interaction(record,member(2),index,'m321-forged-partner',member(0));
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'the inactive physical partner must be rejected before Discord acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
  record=await submitAction(record,member(0),index,'m321-ceal-equip');
  return settle(record,'m321-ceal');
}
function test(name,fn){
  nodeTest(name,async(...args)=>{
    try{return await fn(...args);}
    catch(error){console.error('[M321 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}
  });
}

test('Shooting Star Bow - Ceal grants direct attack to a partner-owned monster through Discord',async()=>{
  const players=[
    {id:member(0),name:'M321 Seat 0',cards:deck([CEAL,SPEAR_DRAGON])},
    {id:member(1),name:'M321 Seat 1',cards:deck([BLUE_EYES])},
    {id:member(2),name:'M321 Seat 2',cards:deck([CELTIC_GUARDIAN])},
    {id:member(3),name:'M321 Seat 3',cards:deck([CELTIC_GUARDIAN])}
  ];
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m321-ceal-partner-direct-attack'});
  state.core.turn=3;
  const target=placeMonster(state,2,CELTIC_GUARDIAN);
  const ordinary=placeMonster(state,0,SPEAR_DRAGON);
  const opposingBlueEyes=placeMonster(state,1,BLUE_EYES);
  const opposingCeltic=placeMonster(state,3,CELTIC_GUARDIAN);
  const ceal=takePhysical(state,0,CEAL);
  holder(state,0).hand.push(ceal);
  assert.ok(target.uid.startsWith('m2:'),'the equipped monster must retain partner physical ownership');
  assert.ok(ceal.uid.startsWith('m0:'),'the Equip Spell must retain the active player physical ownership');
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assert.equal(state.core.players[0].monsters.length,2);
  assert.equal(state.core.players[1].monsters.length,2);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const record=register(state);
  let current=await activateCeal(record,ceal,target);
  const liveTarget=current.state.core.players[0].monsters.find(card=>card.uid===target.uid);
  const liveOrdinary=current.state.core.players[0].monsters.find(card=>card.uid===ordinary.uid);
  assert.equal(engine.atk(liveTarget,current.state.core),400,
    'Celtic Guardian loses exactly 1000 ATK while equipped');
  assert.equal(engine.atk(liveOrdinary,current.state.core),1900,
    'the un-equipped teammate receives no ATK penalty');
  assert.ok(current.state.core.players[0].backrow.some(card=>card.uid===ceal.uid&&card.equippedTo===target.uid));
  let rendered=assertPublicPayload(current);
  assert.ok(rendered.includes('ATQ 400'));
  assert.ok(rendered.includes('ATQ 1900'));
  assertPrivateHands(current.state);
  assertRules(current.state);

  const battleIndex=tag.tagActions(current.state,member(0)).findIndex(action=>action.kind==='battle');
  assert.ok(battleIndex>=0,'the active player must enter Battle Phase through the Discord menu');
  current=await submitAction(current,member(0),battleIndex,'m321-enter-battle');
  current=await settle(current,'m321-battle-start');
  assert.equal(current.state.core.phase,'battle');
  const attacks=tag.tagActions(current.state,member(0));
  assert.ok(attacks.some(action=>action.kind==='attack'&&action.card===target.uid&&!action.target),
    'Ceal must permit a direct attack while both opposing monsters remain on the field');
  assert.ok(!attacks.some(action=>action.kind==='attack'&&action.card===ordinary.uid&&!action.target),
    'a teammate monster without Ceal must not gain a direct-attack action');
  assert.ok(attacks.some(action=>action.kind==='attack'&&action.card===ordinary.uid&&action.target===opposingBlueEyes.uid),
    'the un-equipped monster retains only legal attacks against opposing monsters');

  const opponentLPBefore=current.state.core.players[1].lp;
  const directIndex=attacks.findIndex(action=>action.kind==='attack'&&action.card===target.uid&&!action.target);
  current=await submitAction(current,member(0),directIndex,'m321-ceal-direct-attack');
  current=await settle(current,'m321-direct-attack');
  assert.equal(opponentLPBefore-current.state.core.players[1].lp,400,
    'direct battle damage must equal Ceal-reduced ATK and reach the opposing team');
  assert.equal(current.state.core.players[0].lp,record.state.core.players[0].lp,
    'the attacking team must not receive or lose the redirected direct-attack damage');
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===target.uid),
    'the partner-owned monster remains on the shared field after a direct attack');
  assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===opposingCeltic.uid));
  rendered=assertPublicPayload(current);
  assert.ok(rendered.includes('ATQ 400'));
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertConserved(current.state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
