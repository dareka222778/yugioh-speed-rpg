'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m307-fairy-king-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const engine=require('../dist/duelEngine');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const TRUESDALE='45425051';
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
const PLANTS=NORMALS.filter(entry=>entry.card.race==='Plant');
const NON_PLANTS=NORMALS.filter(entry=>entry.card.race!=='Plant');
let MATCH;
for(const plant of PLANTS){
  const attacker=NON_PLANTS.find(entry=>entry.card.atk>plant.card.atk&&entry.card.atk<plant.card.atk+500);
  if(attacker){MATCH={plant,attacker};break;}
}
assert.ok(MATCH,'the certified Normal pool must contain a Plant and a non-Plant with ATK between its base and +500');
const CONTROL=NON_PLANTS.find(entry=>entry.id!==MATCH.attacker.id);
assert.ok(CONTROL,'a separate non-Plant control monster is required');
assert.equal(getPlayableCard(TRUESDALE)?.englishName,'Fairy King Truesdale');
assert.equal(getCardStatus(TRUESDALE)?.stage,'certified');
assert.equal(getEffect(TRUESDALE)?.kind,'monsterEffect');
assert.equal(getMonsterEffect(TRUESDALE)?.operation.kind,'continuous');
assert.deepEqual(getMonsterEffect(TRUESDALE)?.operation.rules,[{
  kind:'modifier',
  filter:{controller:'source',races:['Plant'],sourcePosition:'def'},
  atk:500,
  def:500
}]);

function member(seat){return 'm307-seat-'+seat;}
function deck(required=[],includeTruesdale=false){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  if(includeTruesdale)ids.unshift(TRUESDALE);
  const result=[...new Set(ids)].slice(0,20);
  assert.equal(result.length,20,'each physical member must start with a legal 20-card Main Deck');
  for(const id of required)assert.ok(result.includes(id),'required physical card missing from deck: '+id);
  if(includeTruesdale)assert.ok(result.includes(TRUESDALE));
  return result;
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
  throw new Error('M307 physical card missing from seat '+seat+': '+id);
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
    assert.ok(team.monsters.length<=3);
    assert.ok(team.backrow.length<=3);
    assert.ok((team.extra??[]).length<=5);
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
  assert.equal(cards.length,before.size,'battle resolution must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
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
    assert.ok(guard<40,'the response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m307-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario){
  const required=[[],[],[],[]];
  required[0].push(TRUESDALE,CONTROL.id);
  required[1].push(MATCH.attacker.id);
  required[2].push(MATCH.plant.id);
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({
    id,name:'M307 Seat '+seat,cards:deck(required[seat],seat===0)
  }));
  const state=tag.createTagDuel(players,{
    classic:true,first:0,seed:'m307-truesdale-'+scenario.id
  });
  state.core.turn=3;
  // The fixture represents a previously summoned Fairy King; this suite tests its continuous rule, not its tribute summon.
  const source=placeMonster(state,0,TRUESDALE,scenario.sourcePosition);
  const plant=placeMonster(state,2,MATCH.plant.id,'atk');
  const control=placeMonster(state,0,CONTROL.id,'atk');
  const attacker=placeMonster(state,1,MATCH.attacker.id,'atk');
  assert.match(source.uid,/^m0:/);
  assert.match(plant.uid,/^m2:/);
  assert.match(control.uid,/^m0:/);
  assert.match(attacker.uid,/^m1:/);
  assert.equal(source.owner,0);
  assert.equal(plant.owner,0);
  assert.equal(attacker.owner,1);
  assertRules(state);
  assertPrivateHands(state);
  const expectedBonus=scenario.sourcePosition==='def'?500:0;
  assert.equal(engine.atk(plant,state.core),MATCH.plant.card.atk+expectedBonus);
  assert.equal(engine.def(plant,state.core),MATCH.plant.card.defense+expectedBonus);
  assert.equal(engine.atk(control,state.core),CONTROL.card.atk,
    'the non-Plant control must not receive the Plant modifier');
  assert.equal(engine.def(control,state.core),CONTROL.card.defense);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const beforeLP=state.core.players.map(team=>team.lp);
  const id='m307-truesdale-'+scenario.id;
  const guild='m307-guild',channel='m307-channel';
  const members=ids.map((id,seat)=>({id,name:'M307 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,ids,before,beforeLP,source,plant,control,attacker,record:store.getTag(id),scenario};
}
async function endTurn(record){
  const actions=tag.tagActions(record.state,member(0));
  const index=actions.findIndex(action=>action.kind==='end');
  assert.ok(index>=0,'the source owner representative must receive the End Phase action');
  const current=await submit(record,member(0),index,'m307-'+record.id+'-end');
  return settleResponses(current,'end');
}
async function enterBattle(record){
  const actions=tag.tagActions(record.state,member(1));
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the opposing active teammate must receive the Battle Phase action');
  const current=await submit(record,member(1),index,'m307-'+record.id+'-battle');
  return settleResponses(current,'battle');
}
async function resolveScenario(fixture){
  let current=await endTurn(fixture.record);
  assert.equal(tag.tagDecisionMember(current.state).id,member(1));
  current=await enterBattle(current);
  const actions=tag.tagActions(current.state,member(1));
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.plant.uid
  );
  assert.ok(index>=0,'the Discord menu must expose the attack against the partner-owned Plant');
  assert.deepEqual(tag.tagActions(current.state,member(3)),[],
    'the inactive physical partner cannot submit the active teammate attack');
  const forged=interaction(current,member(3),index,'m307-'+fixture.scenario.id+'-forged',member(1));
  const unchanged=JSON.stringify(current.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(current.id).revision,current.revision);
  assert.equal(JSON.stringify(store.getTag(current.id).state),unchanged);
  current=await submit(current,member(1),index,'m307-'+fixture.scenario.id+'-attack');
  return settleResponses(current,'attack');
}
function assertOutcome(fixture,current){
  const teams=current.state.core.players;
  const sourceDef=fixture.scenario.sourcePosition==='def';
  if(sourceDef){
    assert.ok(teams[0].monsters.some(card=>card.uid===fixture.plant.uid&&card.id===MATCH.plant.id),
      'the partner-owned Plant must win with Fairy King Truesdale in Defense');
    assert.ok(teams[1].grave.some(card=>card.uid===fixture.attacker.uid&&card.id===MATCH.attacker.id),
      'the attacker between base ATK and boosted ATK must be destroyed');
    assert.equal(fixture.beforeLP[1]-teams[1].lp,
      MATCH.plant.card.atk+500-MATCH.attacker.card.atk);
    assert.equal(teams[0].lp,fixture.beforeLP[0]);
  }else{
    assert.ok(teams[0].grave.some(card=>card.uid===fixture.plant.uid&&card.id===MATCH.plant.id),
      'the Plant must lose when Fairy King Truesdale is not in Defense');
    assert.ok(teams[1].monsters.some(card=>card.uid===fixture.attacker.uid&&card.id===MATCH.attacker.id));
    assert.equal(fixture.beforeLP[0]-teams[0].lp,
      MATCH.attacker.card.atk-MATCH.plant.card.atk);
    assert.equal(teams[1].lp,fixture.beforeLP[1]);
  }
  assert.ok(teams[0].monsters.some(card=>card.uid===fixture.source.uid&&card.position===fixture.scenario.sourcePosition),
    'Fairy King Truesdale must remain in its original position');
  assert.ok(teams[0].monsters.some(card=>card.uid===fixture.control.uid&&card.id===CONTROL.id));
  assertPublicPayload(current);
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
}
function assertPublicPayload(record){
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(record.state)){
    assert.ok(!rendered.includes(card.uid),'public Discord payload leaked physical UID '+card.uid);
  }
}
const SCENARIOS=[
  {id:'defense-position-buffs-partner-plant',sourcePosition:'def'},
  {id:'attack-position-disables-buff',sourcePosition:'atk'}
];
for(const scenario of SCENARIOS){
  test('Fairy King Truesdale Discord 2v2: '+scenario.id,async()=>{
    const fixture=setup(scenario);
    const current=await resolveScenario(fixture);
    assertOutcome(fixture,current);
  });
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
