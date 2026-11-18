'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m266-newdoria-discord-'));
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

const NEWDORIA='04335645';
const DARK_MAGICIAN='46986414';
const SUMMONED_SKULL='70781052';
const CELTIC_GUARDIAN='91152256';
assert.equal(getPlayableCard(NEWDORIA)?.englishName,'Newdoria');
assert.equal(getPlayableCard(NEWDORIA)?.atk,1200);
assert.equal(getEffect(NEWDORIA)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(NEWDORIA)?.operation,{
  kind:'singleCard',
  rule:{from:'monsters',controller:'both',action:'destroy',kind:'monster'}
});
assert.equal(getPlayableCard(DARK_MAGICIAN)?.atk,2500);
assert.equal(getPlayableCard(SUMMONED_SKULL)?.atk,2500);
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.defense,1200);

const CORE=[NEWDORIA,DARK_MAGICIAN,SUMMONED_SKULL,CELTIC_GUARDIAN];
const normal=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!CORE.includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the Discord fixture needs eight certified Normal Monsters outside its core cards');
const normalIds=normal.slice(0,8).map(entry=>entry.id);
const POOL=[...CORE,...normalIds];
assert.equal(POOL.length,12);
function member(seat){return 'm266-seat-'+seat;}
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
  throw new Error('M266 physical card missing from seat '+seat+': '+id);
}
function placeMonster(state,seat,id,faceUp=true,position='atk'){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,
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
  assert.equal(cards.length,before.size,'Newdoria resolution must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function interaction(record,actor,index,requestId,owner=actor){
  const calls=[];
  return {
    id:requestId,guildId:record.guild,user:{id:actor},
    customId:'tag:act:'+record.id+':'+record.revision+':'+owner,
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
  const page=Math.floor(index/20);
  const panel=tagPrivateMessage(record,actor,page);
  validateDiscordPayload(panel);
  const components=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  const menu=components.find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu,'the actual private Discord panel must expose the action menu');
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
    assert.ok(guard<40,'the battle and mandatory trigger response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m266-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(suffix){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M266 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:2,seed:'m266-newdoria-'+suffix});
  state.core.turn=3;
  assert.deepEqual(state.active,[2,3],'the fixture rotates to physical seats 2 and 3');
  const before=inventory(state);

  // Newdoria belongs physically to inactive allied seat 0. Seat 2 controls
  // the shared field and must be able to declare its attack.
  const source=placeMonster(state,0,NEWDORIA,true,'atk');
  const ally=placeMonster(state,2,SUMMONED_SKULL,true,'atk');
  const hidden=placeMonster(state,1,CELTIC_GUARDIAN,false,'def');
  const attacker=placeMonster(state,3,DARK_MAGICIAN,true,'atk');
  assert.match(source.uid,/^m0:/);
  assert.match(ally.uid,/^m2:/);
  assert.match(hidden.uid,/^m1:/);
  assert.match(attacker.uid,/^m3:/);
  assertRules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertPrivateHands(state);

  const id='m266-newdoria-'+suffix,guild='m266-guild',channel='m266-channel';
  const members=ids.map((id,seat)=>({id,name:'M266 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,guild,ids,before,source,ally,hidden,attacker,record:store.getTag(id)};
}
async function openBattleAndTrigger(fixture,suffix){
  let current=fixture.record;
  const actor=fixture.ids[2];
  assert.equal(tag.tagDecisionMember(current.state).id,actor);
  const battle=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='battle');
  assert.ok(battle>=0,'active teammate must be able to enter the Battle Phase');
  current=await submit(current,actor,battle,'m266-'+suffix+'-battle');
  current=await settleResponses(current,suffix);

  const attack=tag.tagActions(current.state,actor).findIndex(action=>
    action.kind==='attack'&&action.card===fixture.source.uid&&action.target===fixture.attacker.uid
  );
  assert.ok(attack>=0,'active teammate must attack using the inactive partner physical Newdoria');
  current=await submit(current,actor,attack,'m266-'+suffix+'-attack');
  current=await settleResponses(current,suffix);

  assert.equal(current.state.core.phase,'choice','battle destruction must open Newdoria mandatory target selection');
  assert.ok(current.state.core.players[0].grave.some(card=>card.uid===fixture.source.uid&&card.id===NEWDORIA));
  assert.equal(current.state.core.players[0].lp,2700,'the Newdoria team receives 1300 battle damage');
  assert.equal(current.state.core.players[1].lp,4000,'the defending team takes no battle damage');
  assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===fixture.attacker.uid));
  assert.equal(tag.tagDecisionMember(current.state).id,actor,
    'the active allied physical seat resolves the trigger, not the inactive card owner');
  return {...fixture,record:current};
}
function choiceIndex(state,targetUid){
  const actor=tag.tagDecisionMember(state).id;
  const actions=tag.tagActions(state,actor);
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target===targetUid);
  assert.ok(index>=0,'the mandatory Discord choice must offer target UID '+targetUid);
  return index;
}
function assertMenuOffers(record,actor,index,hidden){
  const panel=tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(panel);
  const rows=panel.components.map(row=>row.toJSON());
  const components=rows.flatMap(row=>row.components||[]);
  const menu=components.find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu,'the actual private Discord panel must contain the mandatory target menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the real Discord select menu must expose the legal target action');
  if(hidden){
    const serialized=JSON.stringify(menu);
    assert.ok(!serialized.includes(CELTIC_GUARDIAN),'the face-down target identity must not appear in the menu');
    assert.ok(!serialized.includes('Celtic Guardian'),'the face-down target name must remain hidden');
  }
  return panel;
}
function assertNoPublicHiddenIdentity(state){
  const panel=tagPublicMessage(state);
  validateDiscordPayload(panel);
  const serialized=JSON.stringify(panel);
  assert.ok(!serialized.includes(CELTIC_GUARDIAN),'the public Discord field must not reveal the face-down card ID');
  assert.ok(!serialized.includes('Celtic Guardian'),'the public Discord field must not reveal the face-down card name');
  for(const card of tag.tagInventory(state))assert.ok(!serialized.includes(card.uid),'public Discord payload leaked physical UID '+card.uid);
}

for(const scenario of [
  {name:'ally',target:'ally',expectedTeam:0},
  {name:'opposing-face-down',target:'hidden',expectedTeam:1}
]){
  test('Newdoria mandatory target selection is private and owner-safe through Discord handlers ('+scenario.name+')',async()=>{
    const fixture=await openBattleAndTrigger(setup(scenario.name),scenario.name);
    const {id,ids,before,source,ally,hidden,attacker}=fixture;
    let current=fixture.record;
    const selected=scenario.target==='ally'?ally:hidden;
    const survivor=scenario.target==='ally'?hidden:ally;
    const index=choiceIndex(current.state,selected.uid);
    assertMenuOffers(current,ids[2],index,selected===hidden);
    assert.equal(tag.tagActions(current.state,ids[0]).length,0,
      'the inactive physical partner must not receive the private choice actions');
    const inactivePanel=tagPrivateMessage(current,ids[0]);
    validateDiscordPayload(inactivePanel);
    assert.ok(!inactivePanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
      .some(component=>(component.custom_id||'').startsWith('tag:act:')));

    const publicBefore=tag.publicTagDuel(current.state);
    const publicJson=JSON.stringify(publicBefore);
    assert.ok(!publicJson.includes(source.uid));
    assert.ok(!publicJson.includes(hidden.uid));
    if(selected===hidden)assertNoPublicHiddenIdentity(current.state);

    const forged=interaction(current,ids[0],index,'m266-forged-inactive-partner',ids[2]);
    const unchanged=JSON.stringify(current.state);
    await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
    assert.deepEqual(forged.calls,[],'forged inactive-partner interaction must be rejected before defer');
    assert.equal(store.getTag(id).revision,current.revision);
    assert.equal(JSON.stringify(store.getTag(id).state),unchanged);

    current=await submit(current,ids[2],index,'m266-newdoria-choice-'+scenario.name);
    assert.ok(current.state.core.players[scenario.expectedTeam].grave.some(card=>
      card.uid===selected.uid&&card.id===selected.id
    ),'selected physical card must enter its team shared Graveyard');
    assert.ok(!current.state.core.players.some(team=>team.monsters.some(card=>card.uid===selected.uid)));
    assert.ok(current.state.core.players[survivor.owner].monsters.some(card=>card.uid===survivor.uid),
      'unselected monster must remain on the shared field');
    assert.ok(current.state.core.players[0].grave.some(card=>card.uid===source.uid&&card.id===NEWDORIA));
    assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===attacker.uid));
    const publicAfter=tagPublicMessage(current.state);
    validateDiscordPayload(publicAfter);
    const rendered=JSON.stringify(publicAfter);
    assert.ok(!rendered.includes(source.uid),'public Discord payload must not expose Newdoria physical UID');
    assert.ok(!rendered.includes(selected.uid),'public Discord payload must not expose selected physical UID');
    assertConserved(current.state,before);
    assertPrivateHands(current.state);
    assertRules(current.state);
    assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
    assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
  });
}

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
