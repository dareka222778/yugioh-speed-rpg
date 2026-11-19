'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m285-kuriboh-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M285 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect,getMonsterDefinition}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const KURIBOH='40640057';
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense));
const attackerEntry=NORMALS.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const defenderEntry=NORMALS.filter(entry=>entry.id!==attackerEntry.id)
  .reduce((best,current)=>current.card.atk<best.card.atk?current:best);
const FILLERS=NORMALS.map(entry=>entry.id)
  .filter(id=>![attackerEntry.id,defenderEntry.id].includes(id));
assert.ok(FILLERS.length>=20,'four isolated 20-card Decks need twenty certified Normal Monster fillers');
assert.ok(attackerEntry.card.atk>defenderEntry.card.atk,'the battle fixture must produce positive damage');

assert.equal(getPlayableCard(KURIBOH)?.englishName,'Kuriboh');
assert.equal(getCardStatus(KURIBOH)?.stage,'certified');
assert.equal(getEffect(KURIBOH)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(KURIBOH),{
  trigger:'quick',cost:{kind:'discard',count:1},operation:{kind:'battleShield'}
});
assert.equal(getMonsterDefinition(KURIBOH)?.activation.window,'opposingDamageCalculation');

function member(seat){return 'm285-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...FILLERS])];
  assert.ok(ids.length>=20,'each physical Deck must contain twenty unique cards');
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
  throw new Error('M285 physical card missing from seat '+seat+': '+id);
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
    assert.ok(team.monsters.length<=3);
    assert.ok(team.backrow.length<=3);
  }
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
  assert.ok(menu,'the active physical seat must receive a real private Discord action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the Discord panel must expose the legal action index '+index);
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
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m285-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'the inactive partner must be rejected before Discord acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the damage-calculation response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m285-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(ownerSeat,scenario){
  const required=[
    [attackerEntry.id],
    [defenderEntry.id],
    [],
    []
  ];
  required[ownerSeat].push(KURIBOH);
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M285 Seat '+seat,cards:deck(required[seat])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m285-'+scenario});
  state.core.turn=3;
  const actor=ids[0];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const attacker=deploy(state,0,attackerEntry.id);
  const defender=deploy(state,1,defenderEntry.id);
  const kuriboh=takePhysical(state,ownerSeat,KURIBOH);
  holder(state,ownerSeat).hand.push(kuriboh);
  assert.match(attacker.uid,/^m0:/);
  assert.match(defender.uid,/^m1:/);
  assert.match(kuriboh.uid,new RegExp('^m'+ownerSeat+':'));
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m285-'+scenario,guild='m285-guild',channel='m285-channel';
  const members=ids.map((id,seat)=>({id,name:'M285 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor,attacker,defender,kuriboh,before,record:store.getTag(id),ownerSeat};
}
async function enterBattle(fixture){
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active attacker must see the Battle Phase action in Discord');
  const current=await submit(fixture.record,fixture.actor,index,fixture.id+'-battle');
  return settleResponses(current,fixture.id+'-battle');
}
async function attackDefender(fixture,record){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.defender.uid
  );
  assert.ok(index>=0,'the Discord action menu must expose the shared-field attack');
  return submit(record,fixture.actor,index,fixture.id+'-attack');
}
async function advanceToKuriboh(record,uid,suffix){
  let current=record;
  for(let guard=0;guard<40;guard++){
    if(current.state.core.phase!=='response')return {record:current,actor:null,index:-1};
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const index=actions.findIndex(action=>action.kind==='monsterEffect'&&action.card===uid);
    if(index>=0)return {record:current,actor,index};
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'each response priority must expose a legal pass');
    current=await submit(current,actor,pass,'m285-'+suffix+'-pass-'+guard);
  }
  throw new Error('Kuriboh response window did not settle within forty Discord interactions');
}
function assertFinal(fixture,record,protectedDamage){
  const state=record.state;
  const expectedDamage=attackerEntry.card.atk-defenderEntry.card.atk;
  assert.equal(state.core.players[0].lp,4000,'the attacking team must not receive battle damage');
  assert.equal(state.core.players[1].lp,protectedDamage?4000:4000-expectedDamage,
    'Kuriboh prevents only the current battle damage when its active physical owner controls the response');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.attacker.uid),
    'the attacker remains on the shared field');
  assert.ok(!state.core.players[1].monsters.some(card=>card.uid===fixture.defender.uid),
    'Kuriboh prevents damage, not battle destruction');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.defender.uid),
    'the defeated monster enters the defending team shared Graveyard');
  if(protectedDamage){
    assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.kuriboh.uid),
      'the discarded Kuriboh enters the shared Graveyard with its physical UID');
    assert.ok(!tag.tagMemberHand(state,member(1)).some(card=>card.uid===fixture.kuriboh.uid));
    assert.ok(!tag.tagMemberHand(state,member(3)).some(card=>card.uid===fixture.kuriboh.uid));
  }else{
    assert.ok(tag.tagMemberHand(state,member(3)).some(card=>card.uid===fixture.kuriboh.uid),
      'the inactive partner retains Kuriboh in its own private hand');
    assert.ok(!state.core.players[1].grave.some(card=>card.uid===fixture.kuriboh.uid));
  }
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
test('active physical defender uses Kuriboh from the private Discord panel during Damage Calculation',async()=>{
  const fixture=setup(1,'active-defender');
  let current=await enterBattle(fixture);
  current=await attackDefender(fixture,current);
  const window=await advanceToKuriboh(current,fixture.kuriboh.uid,'active-defender');
  current=window.record;
  assert.equal(current.state.core.phase,'response');
  assert.equal(current.state.core.pending.stage,'calculation');
  assert.equal(window.actor,member(1));
  assert.ok(window.index>=0,'the active physical defender must receive the Kuriboh Quick Effect in its private menu');
  await rejectInactivePartner(current,member(1),member(3),window.index,'active-defender');
  current=await submit(current,window.actor,window.index,'m285-active-defender-kuriboh');
  current=await settleResponses(current,'active-defender-after-kuriboh');
  assertFinal(fixture,current,true);
});
test('inactive partner Kuriboh stays private and cannot protect the active teammate battle',async()=>{
  const fixture=setup(3,'inactive-partner');
  let current=await enterBattle(fixture);
  current=await attackDefender(fixture,current);
  const window=await advanceToKuriboh(current,fixture.kuriboh.uid,'inactive-partner');
  current=window.record;
  assert.equal(window.index,-1,'the active defender cannot borrow Kuriboh from its inactive partner hand');
  assert.equal(current.state.core.phase,'battle','without an accessible Kuriboh the attack resolves normally');
  const activeActions=tag.tagActions(current.state,member(1));
  assert.ok(!activeActions.some(action=>action.kind==='monsterEffect'&&action.card===fixture.kuriboh.uid));
  const activePanel=tagPrivateMessage(current,member(1));
  validateDiscordPayload(activePanel);
  assert.ok(!JSON.stringify(activePanel).includes(fixture.kuriboh.uid),
    'the active teammate private Discord panel must not expose the partner Kuriboh UID');
  const forged=interaction(current,member(3),0,'m285-inactive-partner-forged',member(1));
  const unchanged=JSON.stringify(current.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(current.id).revision,current.revision);
  assert.equal(JSON.stringify(store.getTag(current.id).state),unchanged);
  assertFinal(fixture,current,false);
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
