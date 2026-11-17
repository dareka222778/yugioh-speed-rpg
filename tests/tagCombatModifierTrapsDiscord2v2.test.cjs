'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m300-combat-traps-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M300 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');
const {rulesFor}=require('../dist/rulesProfile');

const REINFORCEMENTS='17814387';
const CASTLE_WALLS='44209392';
for(const [id,kind] of [[REINFORCEMENTS,'reinforcements'],[CASTLE_WALLS,'castleWalls']]){
  assert.equal(getPlayableCard(id)?.kind,'trap',id+' must be an enabled Trap');
  assert.equal(getEffect(id)?.kind,kind);
  const activation=getActivationModel(getEffect(id));
  assert.equal(activation?.speed,2);
  assert.equal(activation?.window,'free');
  assert.equal(activation?.damage,'beforeCalculation');
}
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'four isolated physical Decks need at least twenty certified Normal Monsters');
const attackerEntry=NORMALS.reduce((best,current)=>current.card.atk<best.card.atk?current:best);
const reinforcementsTarget=NORMALS.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const castleWallsTarget=NORMALS.reduce((best,current)=>current.card.defense>best.card.defense?current:best);
assert.notEqual(attackerEntry.id,reinforcementsTarget.id);
assert.notEqual(attackerEntry.id,castleWallsTarget.id);
assert.ok(reinforcementsTarget.card.atk>attackerEntry.card.atk);
assert.ok(castleWallsTarget.card.defense>attackerEntry.card.atk);

function member(seat){return 'm300-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20,'each physical Deck must contain twenty distinct cards');
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
  throw new Error('M300 physical card missing from seat '+seat+': '+id);
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
    assert.ok(team.monsters.length<=3,'each team shares exactly three Monster Zones');
    assert.ok(team.backrow.length<=3,'each team shares exactly three Spell/Trap Zones');
  }
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique');
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
  assert.ok(menu,'the active physical representative must receive a real private Discord menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private Discord menu must expose the legal action index '+index);
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1,'the public duel panel must refresh after the committed action');
  return store.getTag(record.id);
}
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m300-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'the inactive physical owner must be rejected before acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'a rejected partner action must not mutate the persisted duel');
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the combat Trap response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const pass=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m300-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(spec,scenario){
  const ids=[0,1,2,3].map(member);
  const required=[spec.id,attackerEntry.id,spec.target.id];
  const players=ids.map((id,seat)=>({
    id,name:'M300 Seat '+seat,
    cards:deck(seat===0?[spec.id]:seat===1?[attackerEntry.id]:seat===2?[spec.target.id]:required)
  }));
  const state=tag.createTagDuel(players,{classic:true,first:1,seed:'m300-'+scenario});
  state.core.turn=3;
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'seat 1 must be the active attacking representative');
  const trapCard=takePhysical(state,0,spec.id);
  const trap={...trapCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(trap);
  const attacker=deploy(state,1,attackerEntry.id,'atk');
  const target=deploy(state,2,spec.target.id,spec.position);
  const before=inventory(state);
  assert.match(trap.uid,/^m0:/,'the Set Trap retains inactive partner seat 0 physical ownership');
  assert.match(attacker.uid,/^m1:/,'the attacking monster retains physical seat 1 ownership');
  assert.match(target.uid,/^m2:/,'the target retains inactive partner seat 2 physical ownership');
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m300-'+scenario,guild='m300-guild',channel='m300-channel';
  const members=ids.map((id,seat)=>({id,name:'M300 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {actor:member(2),trap,attacker,target,before,record:store.getTag(id),spec};
}
async function beginAttack(fixture,suffix){
  let current=fixture.record;
  assert.equal(tag.tagDecisionMember(current.state).id,member(1));
  assert.equal(tag.tagActions(current.state,member(1)).some(action=>
    action.kind==='trap'&&action.card===fixture.trap.uid
  ),false,'a response-only combat Trap is unavailable before the attack');
  const battleIndex=tag.tagActions(current.state,member(1)).findIndex(action=>action.kind==='battle');
  assert.ok(battleIndex>=0,'the active attacker must be able to enter the Battle Phase');
  current=await submit(current,member(1),battleIndex,'m300-'+suffix+'-battle');
  const attackIndex=tag.tagActions(current.state,member(1)).findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.target.uid
  );
  assert.ok(attackIndex>=0,'the active attacker must be able to declare the fixture battle');
  current=await submit(current,member(1),attackIndex,'m300-'+suffix+'-attack');
  assert.equal(current.state.core.phase,'response','the attack must open a response window');
  assert.equal(tag.tagDecisionMember(current.state).id,fixture.actor,
    'the active physical defender must receive response priority');
  return current;
}
function legalTrapTargets(record,trapUid,actor){
  return tag.tagActions(record.state,actor)
    .filter(action=>action.kind==='trap'&&action.card===trapUid)
    .map(action=>action.target)
    .sort();
}
const specs=[
  {id:REINFORCEMENTS,name:'Reinforcements',boost:'atkBoost',target:reinforcementsTarget,position:'atk'},
  {id:CASTLE_WALLS,name:'Castle Walls',boost:'defBoost',target:castleWallsTarget,position:'def'}
];
for(const spec of specs){
  test(spec.name+' offers only the defending team monster through the Discord response menu',async()=>{
    const fixture=setup(spec,'target-filter-'+spec.name);
    const current=await beginAttack(fixture,'target-filter-'+spec.name);
    assert.deepEqual(legalTrapTargets(current,fixture.trap.uid,fixture.actor),[fixture.target.uid],
      spec.name+' must not offer the opposing attacker as a legal target');
    assert.ok(!legalTrapTargets(current,fixture.trap.uid,fixture.actor).includes(fixture.attacker.uid));
    assertPrivateHands(current.state);
    assertPublicPayload(current);
    assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  });
  test(spec.name+' resolves through the active partner panel and modifies the shared-field monster',async()=>{
    const fixture=setup(spec,'resolution-'+spec.name);
    let current=await beginAttack(fixture,'resolution-'+spec.name);
    const actions=tag.tagActions(current.state,fixture.actor);
    const index=actions.findIndex(action=>
      action.kind==='trap'&&action.card===fixture.trap.uid&&action.target===fixture.target.uid
    );
    assert.ok(index>=0,'the active teammate must activate the inactive partner Set Trap against its own team monster');
    await rejectInactivePartner(current,fixture.actor,member(0),index,'resolution-'+spec.name);
    current=await submit(current,fixture.actor,index,'m300-'+spec.name+'-activate');
    current=await settleResponses(current,'resolve-'+spec.name);
    const state=current.state;
    const resolved=state.core.players[0].monsters.find(monster=>monster.uid===fixture.target.uid);
    assert.ok(resolved,'the target remains on the shared field after the response resolves');
    assert.equal(resolved[spec.boost],500,spec.name+' applies exactly 500 points to the selected teammate monster');
    assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.trap.uid),
      'the activated partner-owned Trap enters the shared Graveyard');
    assertConserved(state,fixture.before);
    assertPrivateHands(state);
    assertRules(state);
    assertPublicPayload(current);
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
  });
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
