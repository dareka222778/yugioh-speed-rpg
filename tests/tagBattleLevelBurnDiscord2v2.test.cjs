'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m280-battle-level-burn-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M280 test diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const NEEDLE_BURROWER='98162242';
const DES_SCISSORS='52768103';
const CELTIC_GUARDIAN='91152256';
const SWORDSMAN_OF_LANDSTAR='03573512';
const MYSTICAL_ELF='15025844';
const REQUIRED=[NEEDLE_BURROWER,DES_SCISSORS,CELTIC_GUARDIAN,SWORDSMAN_OF_LANDSTAR,MYSTICAL_ELF];

const fillers=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!REQUIRED.includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.level)&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
const fillerIds=fillers.slice(0,15).map(entry=>entry.id);
const POOL=[...REQUIRED,...fillerIds];

test('M280 certified battle-level burn definitions and fixture preflight',()=>{
  assert.equal(getPlayableCard(NEEDLE_BURROWER)?.englishName,'Needle Burrower');
  assert.equal(getPlayableCard(NEEDLE_BURROWER)?.level,5);
  assert.equal(getPlayableCard(NEEDLE_BURROWER)?.atk,1700);
  assert.equal(getCardStatus(NEEDLE_BURROWER)?.stage,'certified');
  assert.equal(getEffect(NEEDLE_BURROWER)?.kind,'monsterEffect');
  assert.equal(getMonsterEffect(NEEDLE_BURROWER)?.trigger,'continuous');
  assert.equal(getMonsterEffect(NEEDLE_BURROWER)?.operation.kind,'battleLevelBurn');

  assert.equal(getPlayableCard(DES_SCISSORS)?.englishName,'KA-2 Des Scissors');
  assert.equal(getPlayableCard(DES_SCISSORS)?.level,4);
  assert.equal(getPlayableCard(DES_SCISSORS)?.atk,1000);
  assert.equal(getCardStatus(DES_SCISSORS)?.stage,'certified');
  assert.equal(getEffect(DES_SCISSORS)?.kind,'monsterEffect');
  assert.equal(getMonsterEffect(DES_SCISSORS)?.trigger,'continuous');
  assert.equal(getMonsterEffect(DES_SCISSORS)?.operation.kind,'battleLevelBurn');

  assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.level,4);
  assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);
  assert.equal(getPlayableCard(SWORDSMAN_OF_LANDSTAR)?.level,3);
  assert.equal(getPlayableCard(SWORDSMAN_OF_LANDSTAR)?.atk,500);
  assert.equal(getPlayableCard(MYSTICAL_ELF)?.level,4);
  assert.equal(getPlayableCard(MYSTICAL_ELF)?.defense,2000);
  assert.ok(fillerIds.length>=15,'the isolated 2v2 fixture needs fifteen certified Normal Monster fillers');
  assert.equal(POOL.length,20,'each physical player must receive a legal 20-card Deck');
  assert.equal(new Set(POOL).size,20,'the isolated Deck must not contain duplicate identities');
});

function member(seat){return 'm280-seat-'+seat;}
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
  throw new Error('M280 physical card missing from seat '+seat+': '+id);
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
  assert.ok(menu,'the real private Discord panel must expose the active seat action menu');
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
    current=await submit(current,actor,pass,'m280-'+suffix+'-pass-'+guard);
  }
  return current;
}
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m280-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[],'forged inactive-partner action must be rejected before defer');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'rejected partner action must not mutate the persisted duel');
}
function setup(scenario,sourceId,targetId,targetPosition){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M280 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m280-'+scenario});
  state.core.turn=3;
  const actor=ids[0];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const source=deploy(state,2,sourceId,'atk');
  const target=deploy(state,3,targetId,targetPosition);
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m280-'+scenario,guild='m280-guild',channel='m280-channel';
  const members=ids.map((id,seat)=>({id,name:'M280 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  const record=store.getTag(id);
  return {id,actor,before,source,target,record};
}
function assertFinal(fixture,state){
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
async function enterBattle(fixture){
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active teammate must see the Battle Phase action in Discord');
  const current=await submit(fixture.record,fixture.actor,index,'m280-'+fixture.id+'-battle');
  return settleResponses(current,fixture.id+'-battle');
}
async function attack(fixture,record,suffix){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.source.uid&&action.target===fixture.target.uid
  );
  assert.ok(index>=0,'the Discord action list must expose the partner-owned attacker and opposing physical target');
  await rejectInactivePartner(record,fixture.actor,member(2),index,suffix);
  const current=await submit(record,fixture.actor,index,'m280-'+suffix+'-attack');
  return settleResponses(current,suffix+'-resolve');
}
async function playBattle(fixture,suffix){
  const inBattle=await enterBattle(fixture);
  return attack(fixture,inBattle,suffix);
}

test('Needle Burrower burns 500 per original Level when its partner-owned attacker destroys a Level 4 monster',async()=>{
  const fixture=setup('needle-level-4',NEEDLE_BURROWER,CELTIC_GUARDIAN,'atk');
  assert.match(fixture.source.uid,/^m2:/);
  assert.match(fixture.target.uid,/^m3:/);
  const ownBefore=fixture.record.state.core.players[0].lp;
  const opposingBefore=fixture.record.state.core.players[1].lp;
  const current=await playBattle(fixture,'needle-level-4');
  const expectedBattleDamage=1700-1400;
  const expectedEffectDamage=500*4;
  assert.equal(current.state.core.players[0].lp,ownBefore);
  assert.equal(current.state.core.players[1].lp,opposingBefore-expectedBattleDamage-expectedEffectDamage);
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid));
  assert.ok(current.state.core.players[1].grave.some(card=>card.uid===fixture.target.uid));
  assert.ok(!current.state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  assertFinal(fixture,current.state);
});

test('KA-2 Des Scissors uses the destroyed Level 3 monster, not its own Level, for burn damage',async()=>{
  const fixture=setup('des-scissors-level-3',DES_SCISSORS,SWORDSMAN_OF_LANDSTAR,'atk');
  assert.match(fixture.source.uid,/^m2:/);
  assert.match(fixture.target.uid,/^m3:/);
  const ownBefore=fixture.record.state.core.players[0].lp;
  const opposingBefore=fixture.record.state.core.players[1].lp;
  const current=await playBattle(fixture,'des-scissors-level-3');
  const expectedBattleDamage=1000-500;
  const expectedEffectDamage=500*3;
  assert.equal(current.state.core.players[0].lp,ownBefore);
  assert.equal(current.state.core.players[1].lp,opposingBefore-expectedBattleDamage-expectedEffectDamage);
  assert.ok(current.state.core.players[1].grave.some(card=>card.uid===fixture.target.uid));
  assert.ok(!current.state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  assertFinal(fixture,current.state);
});

test('Needle Burrower does not burn when a Level 4 Defense monster survives battle',async()=>{
  const fixture=setup('needle-surviving-defense',NEEDLE_BURROWER,MYSTICAL_ELF,'def');
  const ownBefore=fixture.record.state.core.players[0].lp;
  const opposingBefore=fixture.record.state.core.players[1].lp;
  const current=await playBattle(fixture,'needle-surviving-defense');
  assert.equal(current.state.core.players[0].lp,ownBefore-(2000-1700));
  assert.equal(current.state.core.players[1].lp,opposingBefore);
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid));
  assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  assert.ok(!current.state.core.players[1].grave.some(card=>card.uid===fixture.target.uid));
  assertFinal(fixture,current.state);
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
