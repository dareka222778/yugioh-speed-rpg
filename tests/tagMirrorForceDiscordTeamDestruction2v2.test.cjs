'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m304-mirror-force-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M304 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getActivationModel,getDestructionModel}=require('../dist/effectModels');
const {rulesFor}=require('../dist/rulesProfile');

const MIRROR_FORCE='44095762';
assert.equal(getPlayableCard(MIRROR_FORCE)?.kind,'trap');
assert.equal(getEffect(MIRROR_FORCE)?.kind,'mirrorForce');
assert.equal(getCardStatus(MIRROR_FORCE)?.stage,'certified');
assert.deepEqual(getActivationModel(getEffect(MIRROR_FORCE)),{
  speed:2,window:'attackDeclared',damage:'never',opponentOnly:true
});
assert.deepEqual(getDestructionModel(getEffect(MIRROR_FORCE)),{
  operation:'destroyMonsters',scope:'opponent',position:'atk',destination:'grave'
});
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'four isolated physical Decks need at least twenty certified Normal Monsters');
const FIXTURE_MONSTERS=NORMALS.slice(0,5);
assert.equal(new Set(FIXTURE_MONSTERS.map(entry=>entry.id)).size,5);

function member(seat){return 'm304-seat-'+seat;}
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
  throw new Error('M304 physical card missing from seat '+seat+': '+id);
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
async function rejectInactivePartner(record,actor,partner,index){
  const forged=interaction(record,partner,index,'m304-mirror-force-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'the inactive physical Trap owner must be rejected before acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'a rejected partner action must not mutate the persisted duel');
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the Mirror Force response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const pass=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m304-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M304 Seat '+seat,cards:deck(seat===3?[MIRROR_FORCE]:[])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m304-mirror-force-discord'});
  state.core.turn=3;
  assert.equal(tag.tagDecisionMember(state).id,member(0),'seat 0 must be the active attacking representative');
  const trapCard=takePhysical(state,3,MIRROR_FORCE);
  const trap={...trapCard,setTurn:0,faceUp:false};
  state.core.players[1].backrow.push(trap);
  const attacker=deploy(state,0,FIXTURE_MONSTERS[0].id,'atk');
  const partnerAttacker=deploy(state,2,FIXTURE_MONSTERS[1].id,'atk');
  const defendingTarget=deploy(state,1,FIXTURE_MONSTERS[2].id,'def');
  const defendingAttacker=deploy(state,3,FIXTURE_MONSTERS[3].id,'atk');
  const defendingPosition=deploy(state,1,FIXTURE_MONSTERS[4].id,'def');
  const before=inventory(state);
  assert.match(trap.uid,/^m3:/,'the Set Trap retains inactive teammate seat 3 physical ownership');
  assert.match(attacker.uid,/^m0:/);
  assert.match(partnerAttacker.uid,/^m2:/);
  assert.match(defendingTarget.uid,/^m1:/);
  assert.match(defendingAttacker.uid,/^m3:/);
  assert.match(defendingPosition.uid,/^m1:/);
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicBefore.includes(MIRROR_FORCE),'the Set Trap identity must remain private');
  assert.ok(!publicBefore.includes(trap.uid),'the Set Trap physical UID must remain private');
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m304-mirror-force',guild='m304-guild',channel='m304-channel';
  const members=ids.map((id,seat)=>({id,name:'M304 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {attacker,partnerAttacker,defendingTarget,defendingAttacker,defendingPosition,trap,before,record:store.getTag(id)};
}
test('active defender activates inactive partner-owned Mirror Force through Discord and destroys only opposing Attack Position monsters',async()=>{
  const fixture=setup();
  let current=fixture.record;
  const battleIndex=tag.tagActions(current.state,member(0)).findIndex(action=>action.kind==='battle');
  assert.ok(battleIndex>=0,'the active attacking representative must enter the Battle Phase');
  current=await submit(current,member(0),battleIndex,'m304-enter-battle');
  current=await settleResponses(current,'battle-window');
  const attackIndex=tag.tagActions(current.state,member(0)).findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.defendingTarget.uid
  );
  assert.ok(attackIndex>=0,'the active attacker must be able to declare the fixture attack');
  current=await submit(current,member(0),attackIndex,'m304-declare-attack');
  assert.equal(current.state.core.phase,'response','attack declaration opens the Mirror Force response window');
  assert.equal(tag.tagDecisionMember(current.state).id,member(1),
    'the active defending representative receives the response');
  assert.deepEqual(tag.tagActions(current.state,member(3)),[],
    'the inactive physical owner of Mirror Force cannot execute the response');
  assert.deepEqual(tag.tagActions(current.state,member(2)),[],
    'the inactive attacking teammate cannot execute the response');
  const trapIndex=tag.tagActions(current.state,member(1)).findIndex(action=>
    action.kind==='trap'&&action.card===fixture.trap.uid
  );
  assert.ok(trapIndex>=0,'the active defender sees partner-owned Mirror Force in the private Discord menu');
  await rejectInactivePartner(current,member(1),member(3),trapIndex);
  current=await submit(current,member(1),trapIndex,'m304-activate-mirror-force');
  current=await settleResponses(current,'resolve-mirror-force');
  const state=current.state;
  assert.deepEqual(state.core.players[0].monsters.map(card=>card.uid),[],
    'both opposing Attack Position monsters across seats 0 and 2 are destroyed');
  assert.deepEqual(state.core.players[1].monsters.map(card=>card.uid).sort(),
    [fixture.defendingTarget.uid,fixture.defendingPosition.uid,fixture.defendingAttacker.uid].sort(),
    'Mirror Force preserves both defending-team monsters, including its own Attack Position monster');
  for(const card of [fixture.attacker,fixture.partnerAttacker]){
    assert.ok(state.core.players[0].grave.some(entry=>entry.uid===card.uid),
      'the destroyed opposing monster enters its own team shared Graveyard');
  }
  assert.ok(state.core.players[1].grave.some(entry=>entry.uid===fixture.trap.uid),
    'the activated Trap enters the defending team shared Graveyard');
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
