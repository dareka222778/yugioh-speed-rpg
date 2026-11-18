'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m269-forced-defense-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const MONSTERS=['78658564','73698349'];
for(const id of MONSTERS){
  const card=getPlayableCard(id);
  const effect=getMonsterEffect(id);
  assert.ok(card,'forced-Defense monster must be enabled: '+id);
  assert.equal(effect?.trigger,'continuous');
  assert.equal(effect?.operation.kind,'endBattleDefense');
  assert.equal(getEffect(id)?.kind,'monsterEffect');
}
assert.equal(getPlayableCard('78658564')?.atk,2300);
assert.equal(getPlayableCard('73698349')?.atk,2200);

const normal=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!MONSTERS.includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);
const POOL=[...MONSTERS,...normalIds];
assert.equal(POOL.length,10);
function member(seat){return 'm269-seat-'+seat;}
function deck(){return Array.from({length:20},(_,index)=>POOL[index%POOL.length]);}
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
  throw new Error('M269 physical card missing from seat '+seat+': '+id);
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
function interaction(record,actor,index,requestId){
  const calls=[];
  return {
    id:requestId,guildId:record.guild,user:{id:actor},
    customId:'tag:act:'+record.id+':'+record.revision+':'+actor,
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
  const menu=components.find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu,'the real private Discord panel must expose the action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the menu must contain the legal action index '+index);
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
    assert.ok(guard<30,'the Discord response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m269-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(id,seed){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M269 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  assert.equal(tag.tagDecisionMember(state).id,ids[0]);
  const before=inventory(state);
  const physical=takePhysical(state,2,id);
  const source={...physical,owner:0,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[0].monsters.push(source);
  assert.match(source.uid,/^m2:/,'the monster must retain inactive partner seat 2 physical ownership');
  assert.equal(source.owner,0);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const sessionId='m269-forced-'+id+'-'+seed,guild='m269-guild',channel='m269-channel';
  const members=ids.map((id,seat)=>({id,name:'M269 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(sessionId,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,sessionId,ids,before,source,record:store.getTag(sessionId)};
}
async function enterBattle(record,suffix){
  const actor=tag.tagDecisionMember(record.state).id;
  const index=tag.tagActions(record.state,actor).findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active teammate must be able to enter the Battle Phase');
  return settleResponses(await submit(record,actor,index,'m269-'+suffix+'-battle'),suffix);
}
async function attackDirectly(record,source,suffix){
  const actor=tag.tagDecisionMember(record.state).id;
  const index=tag.tagActions(record.state,actor).findIndex(action=>
    action.kind==='attack'&&action.card===source.uid&&action.target===undefined
  );
  assert.ok(index>=0,'the active teammate must be able to attack directly with the partner-owned monster');
  return settleResponses(await submit(record,actor,index,'m269-'+suffix+'-attack'),suffix);
}
async function endTurn(record,suffix){
  const actor=tag.tagDecisionMember(record.state).id;
  const index=tag.tagActions(record.state,actor).findIndex(action=>action.kind==='end');
  assert.ok(index>=0,'the active physical teammate must receive an End action');
  return settleResponses(await submit(record,actor,index,'m269-'+suffix+'-end'),suffix);
}
function liveSource(record,uid){
  return record.state.core.players[0].monsters.find(card=>card.uid===uid);
}
function positionIndex(record,mode){
  const actor=tag.tagDecisionMember(record.state).id;
  return tag.tagActions(record.state,actor).findIndex(action=>
    action.kind==='position'&&action.card===record.state.core.players[0].monsters[0]?.uid&&action.mode===mode
  );
}
function assertPublicNoUids(state){
  const payload=tagPublicMessage(state);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(state))assert.ok(!rendered.includes(card.uid),'public Discord payload leaked UID '+card.uid);
}

for(const id of MONSTERS){
  const name=getPlayableCard(id).englishName;
  test(name+' moves to Defense through the Discord End action only after attacking',async()=>{
    const fixture=setup(id,'attacked');
    let current=await enterBattle(fixture.record,'attacked-'+id);
    current=await attackDirectly(current,fixture.source,'attacked-'+id);
    assert.equal(current.state.core.phase,'battle');
    assert.equal(liveSource(current,fixture.source.uid).position,'atk',
      'the automatic change waits until the Battle Phase boundary');
    current=await endTurn(current,'attacked-'+id);
    const resolved=liveSource(current,fixture.source.uid);
    assert.ok(resolved);
    assert.equal(resolved.position,'def');
    assert.equal(resolved.changed,3);
    assert.equal(resolved.positionLockedThrough,5);
    assert.equal(current.state.core.turn,4);
    assertRules(current.state);
    assertPrivateHands(current.state);
    assertPublicNoUids(current.state);
    assertConserved(current.state,fixture.before);
    assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
  });

  test(name+' does not move to Defense when it did not attack in the Battle Phase',async()=>{
    const fixture=setup(id,'not-attacked');
    let current=await enterBattle(fixture.record,'not-attacked-'+id);
    current=await endTurn(current,'not-attacked-'+id);
    const resolved=liveSource(current,fixture.source.uid);
    assert.ok(resolved);
    assert.equal(resolved.position,'atk');
    assert.equal(resolved.positionLockedThrough,undefined);
    assertRules(current.state);
    assertConserved(current.state,fixture.before);
    assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  });
}

test('Goblin Attack Force position lock expires only after the next controller-team turn ends',async()=>{
  const fixture=setup('78658564','lock-window');
  let current=await enterBattle(fixture.record,'lock-window');
  current=await attackDirectly(current,fixture.source,'lock-window');
  current=await endTurn(current,'lock-window');
  assert.equal(current.state.core.turn,4);
  assert.equal(liveSource(current,fixture.source.uid).position,'def');
  assert.equal(liveSource(current,fixture.source.uid).positionLockedThrough,5);

  current=await endTurn(current,'lock-window-opponent');
  assert.equal(current.state.core.turn,5);
  const actor=tag.tagDecisionMember(current.state).id;
  assert.equal(actor,fixture.ids[0]);
  assert.equal(positionIndex(current,'atk'),-1,
    'the active teammate must not receive a manual change-to-Attack action while the lock is active');
  const lockedPanel=tagPrivateMessage(current,actor);
  validateDiscordPayload(lockedPanel);

  current=await endTurn(current,'lock-window-controller');
  assert.equal(current.state.core.turn,6);
  current=await endTurn(current,'lock-window-opponent-2');
  assert.equal(current.state.core.turn,7);
  const unlocked=positionIndex(current,'atk');
  assert.ok(unlocked>=0,'the position action returns after the controller team next turn has ended');
  current=await submit(current,tag.tagDecisionMember(current.state).id,unlocked,'m269-unlock-position');
  const resolved=liveSource(current,fixture.source.uid);
  assert.equal(resolved.position,'atk');
  assertConserved(current.state,fixture.before);
  assertRules(current.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
