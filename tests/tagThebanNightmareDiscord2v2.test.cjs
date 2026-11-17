'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m340-theban-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const engine=require('../dist/duelEngine');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const THEBAN='51838385';
const SANCTUARY='56433456';
const TOLL='82003859';
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense)&&entry.card.level<=4);
const TARGET=NORMALS.filter(entry=>entry.card.atk<=1000).sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(TARGET,'M340 needs a certified Normal Monster with at most 1000 ATK as a deterministic battle target');
const NORMAL_FILLERS=NORMALS.filter(entry=>entry.id!==TARGET.id).map(entry=>entry.id);

assert.equal(getPlayableCard(THEBAN)?.englishName,'Theban Nightmare');
assert.equal(getPlayableCard(THEBAN)?.atk,1500);
assert.equal(getCardStatus(THEBAN)?.stage,'certified');
assert.equal(getEffect(THEBAN)?.kind,'monsterEffect');
assert.equal(getMonsterEffect(THEBAN)?.trigger,'continuous');
assert.deepEqual(getMonsterEffect(THEBAN)?.operation.rules,[{
  kind:'modifier',
  filter:{selfOnly:true,emptySourceHand:true,emptySourceBackrow:true},
  atk:1500,
  def:0
}]);
assert.equal(getPlayableCard(SANCTUARY)?.field,true,
  'the Field Zone fixture must use a real Field Spell, not a backrow substitute');
assert.equal(getPlayableCard(TOLL)?.kind,'spell');
assert.ok(NORMAL_FILLERS.length>=16,'the four physical Decks need enough distinct certified Normal Monsters');

function member(seat){return 'm340-seat-'+seat;}
function deck(){
  const ids=[...new Set([THEBAN,SANCTUARY,TOLL,TARGET.id,...NORMAL_FILLERS])];
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
  throw new Error('M340 physical card missing from seat '+seat+': '+id);
}
function emptyPhysicalHand(state,seat){
  const physical=holder(state,seat);
  physical.deck.push(...physical.hand);
  physical.hand=[];
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
    assert.ok((team.extra??[]).length<=5,'Extra Deck must remain capped at five');
  }
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical card UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'battle resolution must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function assertPublicATK(record,expected){
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const embed=payload.embeds[0].toJSON();
  assert.ok((embed.fields??[]).some(field=>
    field.value.includes('Pesadelo de Theban • ATQ '+expected)
  ),'the public Discord duel panel must render Theban Nightmare at '+expected+' ATK');
  for(const card of tag.tagInventory(record.state)){
    assert.ok(!JSON.stringify(payload).includes(card.uid),'public Discord payload leaked physical UID '+card.uid);
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
    'the Discord menu must expose legal action index '+index);
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1,'the committed action must refresh the public Discord panel');
  return store.getTag(record.id);
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the Discord response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const pass=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal Pass action');
    current=await submit(current,actor,pass,'m340-'+suffix+'-pass-'+guard);
  }
  return current;
}
function register(state,id){
  const ids=[0,1,2,3].map(member);
  const members=ids.map((id,seat)=>({id,name:'M340 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m340-guild','m340-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function persist(record){
  database.db.prepare('UPDATE tag_sessions SET state=?,revision=revision+1,updated=? WHERE id=?')
    .run(JSON.stringify(record.state),Date.now(),record.id);
  return store.getTag(record.id);
}
function setup(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M340 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m340-theban-empty-zones-discord'});
  state.core.turn=3;
  assert.equal(tag.tagDecisionMember(state).id,member(0),
    'seat 0 must be the active representative for team 0');
  for(const seat of [0,1,2,3])emptyPhysicalHand(state,seat);

  // Theban is physically owned by inactive partner seat 2, but belongs to the shared team field.
  const source=deploy(state,2,THEBAN,'atk');
  const target=deploy(state,1,TARGET.id,'atk');
  const fieldCard=takePhysical(state,0,SANCTUARY);
  state.core.players[0].field={...fieldCard,setTurn:0,faceUp:true,resolved:true};

  assert.match(source.uid,/^m2:/,'Theban must preserve physical ownership by seat 2');
  assert.match(target.uid,/^m1:/,'the opposing target must preserve physical ownership by seat 1');
  assert.equal(source.owner,0);
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assert.equal(state.core.players[0].backrow.length,0);
  assert.equal(state.core.players[0].hand.length,0);
  assert.equal(state.reserves[2].hand.length,0);
  assert.equal(engine.atk(source,state.core),3000,
    'an occupied Field Zone does not count as a Spell/Trap Zone for Theban Nightmare');
  assert.equal(engine.def(source,state.core),500);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const id='m340-theban-'+Date.now();
  const record=register(state,id);
  assertPublicATK(record,3000);
  return {id,source,target,before,record};
}

test('partner-owned Theban Nightmare keeps its 1500 ATK bonus in Discord 2v2 only while the active team hand and shared backrow are empty',async()=>{
  const fixture=setup();
  let {record}=fixture;

  // A face-down card still occupies the shared Spell/Trap Zone and removes the bonus.
  const setSpell=takePhysical(record.state,0,TOLL);
  record.state.core.players[0].backrow.push({...setSpell,setTurn:0,faceUp:false});
  assert.equal(engine.atk(fixture.source,record.state.core),1500,
    'a Set card in the shared backrow disables Theban even while hidden');
  const removed=record.state.core.players[0].backrow.pop();
  record.state.core.players[0].grave.push(removed);
  assert.equal(engine.atk(fixture.source,record.state.core),3000,
    'removing the only backrow card restores the bonus');

  // A card in the active representative's physical hand removes the bonus.
  const handCard=takePhysical(record.state,0,TARGET.id);
  record.state.core.players[0].hand.push(handCard);
  assert.equal(engine.atk(fixture.source,record.state.core),1500,
    'the active representative hand is part of the source controller condition');
  record.state.core.players[0].hand.pop();
  record.state.core.players[0].deck.push(handCard);
  assert.equal(engine.atk(fixture.source,record.state.core),3000);

  assertRules(record.state);
  assertPrivateHands(record.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(record.state));
  record=persist(record);
  assertPublicATK(record,3000);

  // The active teammate, not the inactive physical owner, enters Battle Phase and attacks.
  const actor=member(0);
  let actions=tag.tagActions(record.state,actor);
  const battle=actions.findIndex(action=>action.kind==='battle');
  assert.ok(battle>=0,'the active representative must receive the Battle Phase action');
  record=await submit(record,actor,battle,fixture.id+'-battle');
  record=await settleResponses(record,'battle');

  actions=tag.tagActions(record.state,actor);
  const attack=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.source.uid&&action.target===fixture.target.uid
  );
  assert.ok(attack>=0,'the active representative must be able to attack with the partner-owned Theban');
  assert.deepEqual(tag.tagActions(record.state,member(2)),[],
    'the inactive physical owner cannot issue the attack while the partner represents the team');

  const forged=interaction(record,member(2),attack,fixture.id+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'the inactive partner action must be rejected before defer');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);

  const beforeOppLP=record.state.core.players[1].lp;
  record=await submit(record,actor,attack,fixture.id+'-attack');
  record=await settleResponses(record,'attack');
  assert.equal(record.state.core.players[1].lp,beforeOppLP-(3000-TARGET.card.atk),
    'the 3000-ATK Theban applies exact battle damage to the shared opposing team');
  assert.ok(record.state.core.players[1].grave.some(card=>card.uid===fixture.target.uid),
    'the destroyed opposing monster enters the shared Graveyard with its physical UID');
  assert.ok(record.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid),
    'the partner-owned Theban remains on the shared team field');
  assertPublicATK(record,3000);
  assertConserved(record.state,fixture.before);
  assertPrivateHands(record.state);
  assertRules(record.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(record.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(record.state))));
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
