'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m270-battle-bounce-discord-'));
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

const CASES=[
  {name:'Wall of Illusion',defender:'13945283',attacker:'46986414',attackerName:'Dark Magician',atk:2500},
  {name:'Kelbek',defender:'54878498',attacker:'89631139',attackerName:'Blue-Eyes White Dragon',atk:3000}
];
const NORMAL=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!CASES.some(entry=>entry.defender===id||entry.attacker===id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense))
  .slice(0,8).map(entry=>entry.id);
assert.equal(NORMAL.length,8);
for(const entry of CASES){
  assert.equal(getPlayableCard(entry.defender)?.englishName,entry.name);
  assert.equal(getMonsterEffect(entry.defender)?.trigger,'continuous');
  assert.equal(getMonsterEffect(entry.defender)?.operation.kind,'battleBounceAttacker');
  assert.equal(getEffect(entry.defender)?.kind,'monsterEffect');
  assert.equal(getPlayableCard(entry.attacker)?.englishName,entry.attackerName);
  assert.equal(getPlayableCard(entry.attacker)?.atk,entry.atk);
}
const POOL=[...new Set([...CASES.flatMap(x=>[x.defender,x.attacker]),...NORMAL])];
assert.equal(POOL.length,12);
function member(seat){return 'm270-seat-'+seat;}
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
  throw new Error('M270 physical card missing from seat '+seat+': '+id);
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
    assert.ok(guard<30,'the battle response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m270-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(entry){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M270 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:3,seed:'m270-'+entry.defender});
  state.core.turn=3;
  assert.equal(tag.tagDecisionMember(state).id,ids[3]);
  const before=inventory(state);
  // Defender is physically owned by inactive allied seat 2; attacker is
  // physically owned by inactive attacking-team seat 1. Seat 3 controls attack.
  const physicalDefender=takePhysical(state,2,entry.defender);
  const defender={...physicalDefender,owner:0,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[0].monsters.push(defender);
  const attacker=takePhysical(state,1,entry.attacker);
  const attacking={...attacker,owner:1,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[1].monsters.push(attacking);
  assert.match(defender.uid,/^m2:/);
  assert.match(attacking.uid,/^m1:/);
  assert.equal(defender.owner,0);
  assert.equal(attacking.owner,1);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m270-bounce-'+entry.defender,guild='m270-guild',channel='m270-channel';
  const members=ids.map((id,seat)=>({id,name:'M270 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,ids,before,defender,attacking,record:store.getTag(id)};
}
for(const entry of CASES){
  test(entry.name+' returns the partner-owned attacking monster to its physical owner hand through Discord, even when the defender is destroyed',async()=>{
    const fixture=setup(entry);
    let current=fixture.record;
    const actor=fixture.ids[3];
    const battle=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='battle');
    assert.ok(battle>=0,'active seat 3 must enter the Battle Phase');
    current=await submit(current,actor,battle,'m270-'+entry.defender+'-battle');
    current=await settleResponses(current,entry.defender);
    const attack=tag.tagActions(current.state,actor).findIndex(action=>
      action.kind==='attack'&&action.card===fixture.attacking.uid&&action.target===fixture.defender.uid
    );
    assert.ok(attack>=0,'active seat 3 must attack with its inactive partner seat 1 monster');
    current=await submit(current,actor,attack,'m270-'+entry.defender+'-attack');
    current=await settleResponses(current,entry.defender);

    const team0=current.state.core.players[0],team1=current.state.core.players[1];
    assert.ok(team0.grave.some(card=>card.uid===fixture.defender.uid&&card.id===entry.defender),
      'the defending card may be destroyed by the stronger attack');
    assert.ok(!team0.monsters.some(card=>card.uid===fixture.defender.uid));
    assert.ok(!team1.monsters.some(card=>card.uid===fixture.attacking.uid),
      'the attacker must leave the shared field after the battle');
    assert.ok(tag.tagMemberHand(current.state,fixture.ids[1]).some(card=>
      card.uid===fixture.attacking.uid&&card.id===entry.attacker
    ),'the bounced attacker must return to its physical owner seat 1 hand');
    assert.ok(!tag.tagMemberHand(current.state,fixture.ids[3]).some(card=>card.uid===fixture.attacking.uid),
      'the active partner must not inherit the other physical player hand');
    assertPublicPayload(current.state,fixture);
    assertConserved(current.state,fixture.before);
    assertPrivateHands(current.state);
    assertRules(current.state);
    assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
  });
}
function assertPublicPayload(state,fixture){
  const payload=tagPublicMessage(state);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(state))assert.ok(!rendered.includes(card.uid),'public Discord payload leaked UID '+card.uid);
  assert.ok(!rendered.includes(fixture.attacking.uid));
  assert.ok(!rendered.includes(fixture.defender.uid));
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
