'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m338-battle-bounce-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M338 diagnostic] '+name+'\\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const BLUE_EYES='89631139';
const WALL_OF_ILLUSION='13945283';
const KELBEK='54878498';
const NORMAL_CONTROL='91152256';
const attackerInfo=getPlayableCard(BLUE_EYES);
assert.equal(attackerInfo?.englishName,'Blue-Eyes White Dragon');
assert.equal(attackerInfo?.monsterType,'normal');
assert.equal(attackerInfo?.atk,3000);
assert.ok(tag.tagNormalCardIds.includes(BLUE_EYES),'Blue-Eyes must be a certified playable Normal Monster');
for(const id of [BLUE_EYES,WALL_OF_ILLUSION,KELBEK])assert.equal(getCardStatus(id)?.stage,'certified');
assert.equal(getMonsterEffect(WALL_OF_ILLUSION)?.operation.kind,'battleBounceAttacker');
assert.equal(getMonsterEffect(KELBEK)?.operation.kind,'battleBounceAttacker');

function member(seat){return 'm338-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...tag.tagNormalCardIds])];
  assert.ok(ids.length>=20,'each physical Deck must contain twenty distinct certified Normal Monsters');
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
  throw new Error('M338 physical card missing from seat '+seat+': '+id);
}
function deploy(state,seat,id,position){
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
    assert.ok(team.monsters.length<=3,'each team shares three Monster Zones');
    assert.ok(team.backrow.length<=3,'each team shares three Spell/Trap Zones');
  }
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra||[]).length<=5);
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
  assert.ok(menu,'the active physical representative must receive a private Discord menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private menu must expose legal action index '+index);
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
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the battle response and Damage Step windows must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the active physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m338-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(defenderId,scenario){
  const ids=[0,1,2,3].map(member);
  const required=[BLUE_EYES,WALL_OF_ILLUSION,KELBEK,defenderId];
  const players=ids.map((id,seat)=>({id,name:'M338 Seat '+seat,cards:deck(required)}));
  const state=tag.createTagDuel(players,{classic:true,first:1,seed:'m338-'+scenario});
  state.core.turn=3;
  state.core.phase='battle';
  assert.equal(tag.tagDecisionMember(state).id,member(1),'seat 1 must be the active attacker');
  const defender=deploy(state,0,defenderId,'def');
  const attacker=deploy(state,1,BLUE_EYES,'atk');
  assert.match(defender.uid,/^m0:/,'the defending monster retains inactive physical seat 0 ownership');
  assert.match(attacker.uid,/^m1:/,'the attacker retains active physical seat 1 ownership');
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const id='m338-'+scenario;
  const members=ids.map((id,seat)=>({id,name:'M338 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m338-guild','m338-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {record:store.getTag(id),attacker,defender,before,defenderId};
}
async function battle(record,attacker,defender,suffix){
  const actions=tag.tagActions(record.state,member(1));
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===defender.uid
  );
  assert.ok(index>=0,'the active attacker must receive the target-specific Discord attack action');
  let current=await submit(record,member(1),index,'m338-'+suffix+'-attack');
  assert.equal(current.state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(current.state).id,member(2),
    'the active defender is seat 2 although the defending monster belongs physically to inactive seat 0');
  current=await settleResponses(current,suffix);
  assert.equal(current.state.core.phase,'battle');
  return current;
}
for(const [name,id,defense] of [
  ['Wall of Illusion',WALL_OF_ILLUSION,1850],
  ['Kelbek',KELBEK,1800]
]){
  test(name+' returns the attacking monster to its physical owner hand after damage calculation even when the defender is destroyed',async()=>{
    const fixture=setup(id,name.toLowerCase().replaceAll(' ','-'));
    assert.equal(getPlayableCard(id)?.englishName,name);
    assert.equal(getPlayableCard(id)?.defense,defense);
    let current=await battle(fixture.record,fixture.attacker,fixture.defender,name.toLowerCase().replaceAll(' ','-'));
    const state=current.state;
    assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.defender.uid),
      'the high-ATK attacker destroys the face-up Defense Position source');
    assert.ok(!state.core.players[1].monsters.some(card=>card.uid===fixture.attacker.uid),
      'the attacker leaves the shared field after the battle');
    assert.ok(tag.tagMemberHand(state,member(1)).some(card=>card.uid===fixture.attacker.uid),
      'the attacker returns to its physical owner seat 1 hand');
    assert.ok(!tag.tagMemberHand(state,member(3)).some(card=>card.uid===fixture.attacker.uid),
      'the attacker must not be transferred to the inactive teammate hand');
    assert.ok(!state.core.players[1].grave.some(card=>card.uid===fixture.attacker.uid),
      'the bounced attacker does not enter the team Graveyard');
    assert.equal(state.core.players[0].lp,4000,'attacking a Defense Position monster causes no battle damage');
    assert.equal(state.core.players[1].lp,4000);
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


test('a certified Normal Monster does not inherit the battle-bounce operation',async()=>{
  const fixture=setup(NORMAL_CONTROL,'normal-control');
  assert.equal(getPlayableCard(NORMAL_CONTROL)?.englishName,'Celtic Guardian');
  assert.equal(getMonsterEffect(NORMAL_CONTROL),undefined);
  const current=await battle(fixture.record,fixture.attacker,fixture.defender,'normal-control');
  const state=current.state;
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.defender.uid),
    'the Normal Monster is destroyed by the 3000 ATK attacker');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===fixture.attacker.uid),
    'the attacker remains on the shared field without a battle-bounce effect');
  assert.ok(!tag.tagMemberHand(state,member(1)).some(card=>card.uid===fixture.attacker.uid));
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});
