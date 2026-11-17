'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m299-waboku-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M299 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const WABOKU='12607053';
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'four isolated physical Decks need at least twenty certified Normal Monsters');
const attackerEntry=NORMALS.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const targetEntry=NORMALS.reduce((best,current)=>current.card.atk<best.card.atk?current:best);
assert.notEqual(attackerEntry.id,targetEntry.id,'the battle fixture needs distinct attacker and defender identities');
assert.ok(attackerEntry.card.atk>targetEntry.card.atk,'the unprotected attack must destroy the defender and inflict damage');
assert.equal(getPlayableCard(WABOKU)?.englishName,'Waboku');
assert.equal(getPlayableCard(WABOKU)?.kind,'trap');
assert.equal(getCardStatus(WABOKU)?.stage,'certified');
assert.equal(getEffect(WABOKU)?.kind,'waboku');

function member(seat){return 'm299-seat-'+seat;}
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
  throw new Error('M299 physical card missing from seat '+seat+': '+id);
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
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m299-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'the inactive physical partner must be rejected before acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'a rejected partner action must not mutate the persisted duel');
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the Waboku response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m299-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario){
  const ids=[0,1,2,3].map(member);
  const required=[WABOKU,attackerEntry.id,targetEntry.id];
  const players=ids.map((id,seat)=>({id,name:'M299 Seat '+seat,cards:deck(seat===2?required:[attackerEntry.id,targetEntry.id])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m299-'+scenario});
  state.core.turn=3;
  const actor=ids[0];
  assert.equal(tag.tagDecisionMember(state).id,actor,'seat 0 must be the active representative before the turn passes');
  const targetCard=takePhysical(state,2,targetEntry.id);
  const attackerCard=takePhysical(state,1,attackerEntry.id);
  const trapCard=takePhysical(state,2,WABOKU);
  const target={...targetCard,owner:0,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  const attacker={...attackerCard,owner:1,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  const trap={...trapCard,setTurn:0,faceUp:false};
  state.core.players[0].monsters.push(target);
  state.core.players[1].monsters.push(attacker);
  state.core.players[0].backrow.push(trap);
  const before=inventory(state);
  assert.match(target.uid,/^m2:/,'the protected monster retains inactive teammate seat 2 ownership');
  assert.match(attacker.uid,/^m1:/,'the attacker retains physical seat 1 ownership');
  assert.match(trap.uid,/^m2:/,'Waboku retains inactive teammate seat 2 ownership');
  assert.equal(getCardStatus(WABOKU)?.stage,'certified');
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m299-'+scenario,guild='m299-guild',channel='m299-channel';
  const members=ids.map((id,seat)=>({id,name:'M299 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor,target,attacker,trap,before,record:store.getTag(id)};
}
test('active defender activates partner-owned Waboku through Discord and protects the shared team',async()=>{
  const fixture=setup('partner-owned-trap');
  assert.equal(fixture.record.state.core.players[0].backrow[0].faceUp,false);
  assert.equal(tag.tagActions(fixture.record.state,fixture.actor).some(action=>
    action.kind==='trap'&&action.card===fixture.trap.uid
  ),false,'Waboku must not be activatable before an attack response window');
  let current=fixture.record;
  const endIndex=tag.tagActions(current.state,member(0)).findIndex(action=>action.kind==='end');
  assert.ok(endIndex>=0,'the active representative must be able to end the Main Phase');
  current=await submit(current,member(0),endIndex,'m299-end-main');
  assert.equal(tag.tagDecisionMember(current.state).id,member(1),'seat 1 becomes the active opposing representative');
  const battleIndex=tag.tagActions(current.state,member(1)).findIndex(action=>action.kind==='battle');
  assert.ok(battleIndex>=0,'the opposing representative must be able to enter the Battle Phase');
  current=await submit(current,member(1),battleIndex,'m299-enter-battle');
  const attackIndex=tag.tagActions(current.state,member(1)).findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.target.uid
  );
  assert.ok(attackIndex>=0,'the stronger opponent must be able to attack the weaker partner-owned monster');
  current=await submit(current,member(1),attackIndex,'m299-declare-attack');
  assert.equal(current.state.core.phase,'response','the attack must open a real Trap response window');
  assert.equal(tag.tagDecisionMember(current.state).id,member(0),
    'the active physical representative of the defending team controls the response');
  const actions=tag.tagActions(current.state,member(0));
  const wabokuIndex=actions.findIndex(action=>action.kind==='trap'&&action.card===fixture.trap.uid);
  assert.ok(wabokuIndex>=0,'the active teammate must see partner-owned Waboku in the private Discord menu');
  await rejectInactivePartner(current,member(0),member(2),wabokuIndex,'partner-owned-waboku');
  current=await submit(current,member(0),wabokuIndex,'m299-activate-waboku');
  current=await settleResponses(current,'resolve-waboku');
  const state=current.state;
  assert.equal(state.core.players[0].lp,4000,'Waboku prevents battle damage to the defending team');
  assert.equal(state.core.players[1].lp,4000,'the attacking team does not receive unrelated LP changes');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.target.uid),
    'Waboku also prevents the partner-owned defender from being destroyed by battle');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===fixture.attacker.uid),
    'the attacking monster remains on its shared field');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.trap.uid),
    'the activated partner-owned Waboku enters the shared Graveyard with its physical UID');
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
