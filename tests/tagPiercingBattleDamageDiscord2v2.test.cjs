'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m351-piercing-battle-'));
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

const ENRAGED_BATTLE_OX='76909279';
const GRAVEKEEPERS_SPEAR_SOLDIER='63695531';
const GAZELLE='05818798';
const CELTIC_GUARDIAN='91152256';

const CASES=[
  {
    key:'enraged-beast-partner-owner',
    name:'Enraged Battle Ox grants piercing to a partner-owned Beast controlled by the active teammate',
    source:ENRAGED_BATTLE_OX,sourceSeat:0,
    attacker:GAZELLE,attackerSeat:2,
    target:CELTIC_GUARDIAN,expectedDamage:500
  },
  {
    key:'enraged-warrior-negative',
    name:'Enraged Battle Ox does not grant piercing to a Warrior outside its race filter',
    source:ENRAGED_BATTLE_OX,sourceSeat:0,
    attacker:CELTIC_GUARDIAN,attackerSeat:2,
    target:CELTIC_GUARDIAN,expectedDamage:0
  },
  {
    key:'spear-soldier-partner-owner',
    name:'Gravekeeper\'s Spear Soldier pierces when the active teammate attacks with the inactive partner-owned source',
    source:GRAVEKEEPERS_SPEAR_SOLDIER,sourceSeat:0,
    attacker:GRAVEKEEPERS_SPEAR_SOLDIER,attackerSeat:0,
    target:CELTIC_GUARDIAN,expectedDamage:500
  }
];

for(const id of [ENRAGED_BATTLE_OX,GRAVEKEEPERS_SPEAR_SOLDIER]){
  assert.equal(getCardStatus(id)?.stage,'certified');
  assert.equal(getEffect(id)?.kind,'monsterEffect');
  assert.equal(getMonsterEffect(id)?.trigger,'continuous');
  assert.equal(getMonsterEffect(id)?.operation.kind,'continuous');
}
assert.equal(getPlayableCard(ENRAGED_BATTLE_OX)?.englishName,'Enraged Battle Ox');
assert.equal(getPlayableCard(ENRAGED_BATTLE_OX)?.atk,1700);
assert.equal(getPlayableCard(ENRAGED_BATTLE_OX)?.race,'Beast-Warrior');
assert.deepEqual(getMonsterEffect(ENRAGED_BATTLE_OX)?.operation.rules[0],{
  kind:'combat',
  filter:{controller:'source',races:['Beast','Beast-Warrior','Winged Beast']},
  rule:{kind:'piercing'}
});
assert.equal(getPlayableCard(GRAVEKEEPERS_SPEAR_SOLDIER)?.englishName,"Gravekeeper's Spear Soldier");
assert.equal(getPlayableCard(GRAVEKEEPERS_SPEAR_SOLDIER)?.atk,1500);
assert.deepEqual(getMonsterEffect(GRAVEKEEPERS_SPEAR_SOLDIER)?.operation.rules[0],{
  kind:'combat',filter:{selfOnly:true},rule:{kind:'piercing'}
});
assert.equal(getPlayableCard(GAZELLE)?.englishName,'Gazelle the King of Mythical Beasts');
assert.equal(getPlayableCard(GAZELLE)?.race,'Beast');
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.englishName,'Celtic Guardian');
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.defense,1000);

const SAFE_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return ![GAZELLE,CELTIC_GUARDIAN].includes(id)&&
    card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&Number.isInteger(card.defense);
});
assert.ok(SAFE_NORMALS.length>=20,'four physical Decks require twenty distinct certified Normal Monster fillers');

function member(seat){return 'm351-seat-'+seat;}
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
  throw new Error('M351 physical card missing from seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'piercing battle must conserve every physical card');
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
  const forged=interaction(record,partner,index,'m351-'+suffix+'-forged',actor);
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
    current=await submit(current,actor,pass,'m351-'+suffix+'-pass-'+guard);
  }
  return current;
}
function register(state,key){
  const id='m351-'+key+'-'+Date.now();
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M351 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m351-guild','m351-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(entry){
  const required=[[],[],[],[]];
  required[entry.sourceSeat].push(entry.source);
  required[entry.attackerSeat].push(entry.attacker);
  required[1].push(entry.target);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M351 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:2,seed:'m351-'+entry.key});
  state.core.turn=3;
  assert.deepEqual(state.active,[2,3],'seats 2 and 3 must be the active team representatives');
  const source=placeMonster(state,entry.sourceSeat,entry.source);
  const attacker=entry.attacker===entry.source&&entry.attackerSeat===entry.sourceSeat
    ?source:placeMonster(state,entry.attackerSeat,entry.attacker);
  const target=placeMonster(state,1,entry.target,'def');
  assert.match(source.uid,/^m0:/,'the continuous effect/source must retain inactive allied partner seat 0 ownership');
  assert.match(attacker.uid,new RegExp('^m'+entry.attackerSeat+':'),
    'the attacking monster must retain its physical owner UID');
  assert.match(target.uid,/^m1:/,'the Defense Position target must retain inactive opposing partner seat 1 ownership');
  assert.equal(source.owner,0);
  assert.equal(attacker.owner,0);
  assert.equal(target.owner,1);
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const record=register(state,entry.key);
  assertPublicPayload(record);
  return {entry,source,attacker,target,before,record};
}
async function enterBattle(fixture){
  const actor=member(2);
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active representative must receive the legal Battle Phase action');
  await rejectInactivePartner(fixture.record,actor,member(0),index,fixture.entry.key+'-battle');
  let current=await submit(fixture.record,actor,index,'m351-'+fixture.entry.key+'-battle');
  current=await settleResponses(current,fixture.entry.key+'-battle');
  assert.equal(current.state.core.phase,'battle','the Discord Battle Phase action must enter Battle Phase');
  return current;
}
function assertStable(fixture,record){
  assertConserved(record.state,fixture.before);
  assertPrivateHands(record.state);
  assertRules(record.state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(record.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(record.state))));
}
for(const entry of CASES){
  test('M351 '+entry.name+' resolves through Discord 2v2',async()=>{
    const fixture=setup(entry);
    const actor=member(2);
    const currentBattle=await enterBattle(fixture);
    const actions=tag.tagActions(currentBattle.state,actor);
    const attackIndex=actions.findIndex(action=>
      action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.target.uid
    );
    assert.ok(attackIndex>=0,'the active representative must be able to attack with the partner-owned monster');
    const privatePanel=tagPrivateMessage(currentBattle,actor,Math.floor(attackIndex/20));
    validateDiscordPayload(privatePanel);
    const menu=privatePanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
      .find(component=>component.custom_id==='tag:act:'+currentBattle.id+':'+currentBattle.revision+':'+actor);
    assert.ok(menu,'the active representative must receive the private attack action menu');
    const attackerName=getPlayableCard(entry.attacker).name;
    assert.ok(menu.options.some(option=>option.value===String(attackIndex)&&option.label.includes(attackerName)),
      'the private menu must expose the exact legal attack action and localized card name');
    const publicPanel=tagPublicMessage(currentBattle);
    validateDiscordPayload(publicPanel);
    assert.ok(!JSON.stringify(publicPanel).includes(fixture.attacker.uid)&&
      !JSON.stringify(publicPanel).includes(fixture.target.uid),
      'the public Discord panel must not expose physical UIDs');
    await rejectInactivePartner(currentBattle,actor,member(0),attackIndex,entry.key+'-attack');
    const ownLP=currentBattle.state.core.players[0].lp;
    const opponentLP=currentBattle.state.core.players[1].lp;
    let current=await submit(currentBattle,actor,attackIndex,'m351-'+entry.key+'-attack');
    current=await settleResponses(current,entry.key+'-attack');
    assert.equal(current.state.core.players[0].lp,ownLP,'the attacking team must not lose LP in a winning attack');
    assert.equal(current.state.core.players[1].lp,opponentLP-entry.expectedDamage,
      'only the correctly filtered piercing damage must reach the opposing shared LP');
    assert.ok(current.state.core.players[1].grave.some(card=>
      card.uid===fixture.target.uid&&card.id===entry.target
    ),'the defeated opposing partner-owned monster must enter its shared Graveyard with the original UID');
    assert.ok(current.state.core.players[0].monsters.some(card=>
      card.uid===fixture.attacker.uid&&card.id===entry.attacker
    ),'the attacking partner-owned monster must survive on the shared allied field');
    if(fixture.source.uid!==fixture.attacker.uid){
      assert.ok(current.state.core.players[0].monsters.some(card=>
        card.uid===fixture.source.uid&&card.faceUp
      ),'Enraged Battle Ox must remain face-up for the continuous effect');
    }
    assertStable(fixture,current);
  });
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
