'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m278-piercing-discord-'));
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

const MAD_SWORD_BEAST='79870141';
const DARK_DRICERATOPS='65287621';
const GRAVEKEEPERS_SPEAR_SOLDIER='63695531';
const ENRAGED_BATTLE_OX='76909279';
const GYAKU_GIRE_PANDA='09817927';
const GIANT_RAT='97017120';
const AXE_RAIDER='48305365';
const CELTIC_GUARDIAN='91152256';
const MYSTICAL_ELF='15025844';
const DARK_MAGICIAN='46986414';

for(const [id,name,atk] of [
  [MAD_SWORD_BEAST,'Mad Sword Beast',1400],
  [DARK_DRICERATOPS,'Dark Driceratops',2400],
  [GRAVEKEEPERS_SPEAR_SOLDIER,"Gravekeeper's Spear Soldier",1500],
  [ENRAGED_BATTLE_OX,'Enraged Battle Ox',1700],
  [GYAKU_GIRE_PANDA,'Gyaku-Gire Panda',800]
]){
  assert.equal(getPlayableCard(id)?.englishName,name);
  assert.equal(getPlayableCard(id)?.atk,atk);
  assert.equal(getCardStatus(id)?.stage,'certified');
  assert.equal(getEffect(id)?.kind,'monsterEffect');
  assert.equal(getMonsterEffect(id)?.trigger,'continuous');
  assert.equal(getMonsterEffect(id)?.operation.kind,'continuous');
}
for(const id of [MAD_SWORD_BEAST,DARK_DRICERATOPS,GRAVEKEEPERS_SPEAR_SOLDIER]){
  assert.deepEqual(getMonsterEffect(id)?.operation,{
    kind:'continuous',
    rules:[{kind:'combat',filter:{selfOnly:true},rule:{kind:'piercing'}}]
  });
}
assert.equal(getPlayableCard(GIANT_RAT)?.race,'Beast');
assert.equal(getPlayableCard(AXE_RAIDER)?.race,'Warrior');
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.defense,1200);
assert.equal(getPlayableCard(MYSTICAL_ELF)?.defense,2000);
assert.equal(getPlayableCard(DARK_MAGICIAN)?.atk,2500);

const requiredIds=[
  MAD_SWORD_BEAST,DARK_DRICERATOPS,GRAVEKEEPERS_SPEAR_SOLDIER,
  ENRAGED_BATTLE_OX,GYAKU_GIRE_PANDA,GIANT_RAT,AXE_RAIDER,
  CELTIC_GUARDIAN,MYSTICAL_ELF,DARK_MAGICIAN
];
const fillers=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!requiredIds.includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(fillers.length>=10,'the isolated piercing fixture needs ten certified Normal Monsters');
const POOL=[...requiredIds,...fillers.slice(0,10).map(entry=>entry.id)];
assert.equal(POOL.length,20);
assert.equal(new Set(POOL).size,20);

function member(seat){return 'm278-seat-'+seat;}
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
  throw new Error('M278 physical card missing from seat '+seat+': '+id);
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
  assert.ok(menu,'the real private Discord panel must expose the action menu');
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
    current=await submit(current,actor,pass,'m278-'+suffix+'-pass-'+guard);
  }
  return current;
}
async function rejectInactivePartner(record,actor,partner,index,suffix){
  assert.deepEqual(tag.tagActions(record.state,partner),[],
    'the inactive physical partner cannot submit the active teammate attack');
  const forged=interaction(record,partner,index,'m278-'+suffix+'-forged',actor);
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
function setup(scenario){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M278 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m278-piercing-'+scenario});
  state.core.turn=3;
  const actor=ids[0];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m278-'+scenario,guild='m278-guild',channel='m278-channel';
  const members=ids.map((id,seat)=>({id,name:'M278 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor,before,record:store.getTag(id)};
}
async function enterBattle(fixture){
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const battle=actions.findIndex(action=>action.kind==='battle');
  assert.ok(battle>=0,'the active teammate must see the Battle Phase action in Discord');
  const current=await submit(fixture.record,fixture.actor,battle,'m278-'+fixture.id+'-battle');
  return settleResponses(current,fixture.id+'-battle');
}
async function attack(fixture,record,attacker,target,suffix){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===target.uid
  );
  assert.ok(index>=0,'the actual Discord action list must expose the shared-field attack');
  await rejectInactivePartner(record,fixture.actor,member(2),index,suffix);
  const current=await submit(record,fixture.actor,index,'m278-'+suffix+'-attack');
  return settleResponses(current,suffix+'-resolve');
}
function assertFinal(fixture,state){
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}

for(const [sourceId,name,atk,targetId,targetName,targetDef] of [
  [MAD_SWORD_BEAST,'Mad Sword Beast',1400,CELTIC_GUARDIAN,'Celtic Guardian',1200],
  [DARK_DRICERATOPS,'Dark Driceratops',2400,MYSTICAL_ELF,'Mystical Elf',2000],
  [GRAVEKEEPERS_SPEAR_SOLDIER,"Gravekeeper's Spear Soldier",1500,CELTIC_GUARDIAN,'Celtic Guardian',1200]
]){
  test(name+' inflicts piercing damage through Discord to the shared opposing team',async()=>{
    const fixture=setup('inherent-'+sourceId);
    const source=deploy(fixture.record.state,2,sourceId,'atk');
    const target=deploy(fixture.record.state,3,targetId,'def');
    assert.match(source.uid,/^m2:/,'the attacker must retain inactive teammate physical ownership');
    assert.match(target.uid,/^m3:/,'the defender must retain opposing partner physical ownership');
    const beforeOwnLP=fixture.record.state.core.players[0].lp;
    const beforeOppLP=fixture.record.state.core.players[1].lp;
    let current=await enterBattle(fixture);
    current=await attack(fixture,current,source,target,'inherent-'+sourceId);
    assert.equal(current.state.core.players[1].lp,beforeOppLP-(atk-targetDef),
      'piercing damage equals ATK minus DEF and reaches the shared opposing LP');
    assert.equal(current.state.core.players[0].lp,beforeOwnLP);
    assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===source.uid));
    assert.ok(current.state.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===targetId));
    assert.equal(tag.publicTagDuel(current.state).teams[1].lp,beforeOppLP-(atk-targetDef));
    assertFinal(fixture,current.state);
  });
}

test('Enraged Battle Ox grants piercing to a partner-owned Beast ally through Discord',async()=>{
  const fixture=setup('battle-ox-beast');
  const source=deploy(fixture.record.state,2,ENRAGED_BATTLE_OX,'atk');
  const ally=deploy(fixture.record.state,0,GIANT_RAT,'atk');
  const target=deploy(fixture.record.state,3,CELTIC_GUARDIAN,'def');
  assert.match(source.uid,/^m2:/);
  assert.match(ally.uid,/^m0:/);
  assert.match(target.uid,/^m3:/);
  const beforeOppLP=fixture.record.state.core.players[1].lp;
  let current=await enterBattle(fixture);
  current=await attack(fixture,current,ally,target,'battle-ox-beast');
  assert.equal(current.state.core.players[1].lp,beforeOppLP-200,
    'a Beast ally receives piercing from the partner-owned Enraged Battle Ox');
  assert.ok(current.state.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===CELTIC_GUARDIAN));
  assertFinal(fixture,current.state);
});

test('Enraged Battle Ox does not grant piercing to a Warrior teammate',async()=>{
  const fixture=setup('battle-ox-warrior-control');
  const source=deploy(fixture.record.state,2,ENRAGED_BATTLE_OX,'atk');
  const ally=deploy(fixture.record.state,0,AXE_RAIDER,'atk');
  const target=deploy(fixture.record.state,3,MYSTICAL_ELF,'def');
  const beforeOwnLP=fixture.record.state.core.players[0].lp;
  const beforeOppLP=fixture.record.state.core.players[1].lp;
  let current=await enterBattle(fixture);
  current=await attack(fixture,current,ally,target,'battle-ox-warrior');
  assert.equal(current.state.core.players[1].lp,beforeOppLP,
    'a Warrior outside the Beast/Beast-Warrior/Winged Beast filter receives no piercing');
  assert.equal(current.state.core.players[0].lp,beforeOwnLP-300,
    'Axe Raider receives ordinary battle damage against 2000 DEF without piercing');
  assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===target.uid&&card.position==='def'));
  assertFinal(fixture,current.state);
});

test('Gyaku-Gire Panda counts both opposing seats for ATK and piercing through Discord',async()=>{
  const fixture=setup('gyaku-gire-both-opponents');
  const panda=deploy(fixture.record.state,2,GYAKU_GIRE_PANDA,'atk');
  const target=deploy(fixture.record.state,1,CELTIC_GUARDIAN,'def');
  const otherOpponent=deploy(fixture.record.state,3,DARK_MAGICIAN,'atk');
  assert.match(panda.uid,/^m2:/);
  assert.match(target.uid,/^m1:/);
  assert.match(otherOpponent.uid,/^m3:/);
  const beforeOppLP=fixture.record.state.core.players[1].lp;
  let current=await enterBattle(fixture);
  current=await attack(fixture,current,panda,target,'gyaku-gire');
  assert.equal(current.state.core.players[1].lp,beforeOppLP-600,
    'two opposing monsters across physical seats 1 and 3 give Panda 1800 ATK and 600 piercing damage');
  assert.ok(current.state.core.players[1].grave.some(card=>card.uid===target.uid&&card.id===CELTIC_GUARDIAN));
  assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===otherOpponent.uid),
    'the second opposing seat monster remains and contributes to Panda ATK');
  assertFinal(fixture,current.state);
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
