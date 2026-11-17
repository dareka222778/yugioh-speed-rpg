'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m319-maha-vailo-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const engine=require('../dist/duelEngine');
const {rulesFor}=require('../dist/rulesProfile');

const MAHA_VAILO='93013676';
const BOOK_OF_SECRET_ARTS='91595718';
assert.equal(getPlayableCard(MAHA_VAILO)?.englishName,'Maha Vailo');
assert.equal(getPlayableCard(MAHA_VAILO)?.atk,1550);
assert.equal(getPlayableCard(MAHA_VAILO)?.defense,1400);
assert.equal(getCardStatus(MAHA_VAILO)?.stage,'certified');
assert.equal(getMonsterEffect(MAHA_VAILO)?.trigger,'continuous');
assert.equal(getEffect(BOOK_OF_SECRET_ARTS)?.kind,'equip');
assert.deepEqual(getEffect(BOOK_OF_SECRET_ARTS)?.races,['Spellcaster']);
assert.equal(getEffect(BOOK_OF_SECRET_ARTS)?.atk,300);
assert.equal(getEffect(BOOK_OF_SECRET_ARTS)?.def,300);
assert.equal(getCardStatus(BOOK_OF_SECRET_ARTS)?.stage,'certified');

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'M319 requires at least twenty certified Normal Monsters for four legal Decks');

function member(seat){return 'm319-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20,'each physical Main Deck must contain at least twenty unique cards');
  const result=ids.slice(0,20);
  for(const id of required)assert.ok(result.includes(id),'required card missing from physical Deck: '+id);
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
  throw new Error('M319 physical card missing from seat '+seat+': '+id);
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
  assert.equal(map.size,80,'all 80 physical card UIDs must be unique');
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
  return payload;
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
async function submitAction(record,actor,index,requestId){
  const panel=tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(panel);
  const components=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  const menu=components.find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu,'the active physical representative must receive a private Discord action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),'the selected action must be present in the private menu');
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit'],'Discord interaction must be acknowledged exactly once before editing');
  assert.ok(refreshes>=1,'the shared public field must be refreshed after the committed action');
  return store.getTag(record.id);
}
async function rejectInactive(record,index){
  const forged=interaction(record,member(2),index,'m319-forged-inactive',member(0));
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'the inactive partner must be rejected before Discord acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
async function settle(record,prefix){
  for(let guard=0;record.state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
    const actor=tag.tagDecisionMember(record.state).id;
    const index=tag.tagActions(record.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(index>=0,'the current physical responder must receive a legal Pass action');
    record=await submitAction(record,actor,index,prefix+'-pass-'+guard);
  }
  return record;
}
function register(state){
  const id='m319-maha-vailo';
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M319 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m319-guild','m319-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M319 Seat '+seat,
    cards:deck(seat===0||seat===1?[BOOK_OF_SECRET_ARTS]:seat===2?[MAHA_VAILO]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m319-maha-vailo-cross-team-equips'});
  state.core.turn=3;
  const mahaPhysical=takePhysical(state,2,MAHA_VAILO);
  const maha={id:mahaPhysical.id,uid:mahaPhysical.uid,owner:0,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[0].monsters.push(maha);
  const ownEquip=takePhysical(state,0,BOOK_OF_SECRET_ARTS);
  holder(state,0).hand.push(ownEquip);
  const opponentEquip=takePhysical(state,1,BOOK_OF_SECRET_ARTS);
  holder(state,1).hand.push(opponentEquip);
  assert.ok(maha.uid.startsWith('m2:'),'Maha Vailo must retain seat 2 physical ownership');
  assert.ok(ownEquip.uid.startsWith('m0:'),'the first Equip Spell must retain seat 0 physical ownership');
  assert.ok(opponentEquip.uid.startsWith('m1:'),'the second Equip Spell must retain seat 1 physical ownership');
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  return {maha,ownEquip,opponentEquip,before,record:register(state)};
}

function equipIndex(record,actor,spell,maha){
  return tag.tagActions(record.state,actor).findIndex(action=>
    action.kind==='spell'&&action.card===spell.uid&&action.target===maha.uid
  );
}
async function activateEquip(record,actor,spell,maha,suffix){
  const index=equipIndex(record,actor,spell,maha);
  assert.ok(index>=0,'the active player must receive an Equip Spell action for the eligible shared-field Spellcaster');
  if(actor===member(0))await rejectInactive(record,index);
  record=await submitAction(record,actor,index,'m319-'+suffix+'-equip');
  return settle(record,'m319-'+suffix);
}
async function endTurn(record,actor){
  const index=tag.tagActions(record.state,actor).findIndex(action=>action.kind==='end');
  assert.ok(index>=0,'the active representative must receive End Phase through the private Discord menu');
  return submitAction(record,actor,index,'m319-end-turn');
}
function test(name,fn){
  nodeTest(name,async(...args)=>{
    try{return await fn(...args);}
    catch(error){console.error('[M319 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}
  });
}

test('Maha Vailo counts Equip Spells controlled by both teams through real Discord action menus',async()=>{
  const fixture=setup();
  let record=fixture.record;
  assert.equal(engine.atk(fixture.maha,record.state.core),1550,'Maha Vailo starts at its printed ATK');
  record=await activateEquip(record,member(0),fixture.ownEquip,fixture.maha,'blue');
  const firstAttached=record.state.core.players[0].backrow.find(card=>card.uid===fixture.ownEquip.uid);
  assert.ok(firstAttached,'the active teammate Equip Spell must remain in the blue shared backrow');
  assert.equal(firstAttached.equippedTo,fixture.maha.uid);
  let live=record.state.core.players[0].monsters.find(card=>card.uid===fixture.maha.uid);
  assert.equal(engine.atk(live,record.state.core),2350,
    'one Book of Secret Arts gives +300 and Maha Vailo counts one Equip Spell for +500');
  assert.equal(engine.def(live,record.state.core),1700);
  assertPrivateHands(record.state);
  assertRules(record.state);

  record=await endTurn(record,member(0));
  assert.equal(tag.tagDecisionMember(record.state).id,member(1),
    'the opposing physical seat must become active after the End Phase');
  record=await activateEquip(record,member(1),fixture.opponentEquip,fixture.maha,'red');
  const secondAttached=record.state.core.players[1].backrow.find(card=>card.uid===fixture.opponentEquip.uid);
  assert.ok(secondAttached,'the opponent-owned Equip Spell remains in its physical controller backrow');
  assert.equal(secondAttached.equippedTo,fixture.maha.uid,
    'an Equip Spell may attach to an eligible monster on the opposing shared field');

  live=record.state.core.players[0].monsters.find(card=>card.uid===fixture.maha.uid);
  assert.equal(engine.atk(live,record.state.core),3150,
    'Maha Vailo counts both team-owned Equip Spells: 1550 + 600 Book bonuses + 1000 count bonus');
  assert.equal(engine.def(live,record.state.core),2000,
    'both Book of Secret Arts cards contribute their +300 DEF to the Spellcaster');
  assert.ok(record.state.core.players[0].backrow.some(card=>card.uid===fixture.ownEquip.uid&&card.equippedTo===fixture.maha.uid));
  assert.ok(record.state.core.players[1].backrow.some(card=>card.uid===fixture.opponentEquip.uid&&card.equippedTo===fixture.maha.uid));
  const payload=assertPublicPayload(record);
  assert.ok(JSON.stringify(payload.embeds[0].toJSON()).includes('ATQ 3150'),
    'the public Discord field must render the calculated Maha Vailo ATK');
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
