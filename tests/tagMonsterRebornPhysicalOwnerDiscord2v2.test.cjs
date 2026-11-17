'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m324-monster-reborn-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M324 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const MONSTER_REBORN='83764718';
const DARK_HOLE='53129443';
const TARGETS=[
  {id:'91152256',name:'Celtic Guardian',seat:2,ownerTeam:0},
  {id:'46986414',name:'Dark Magician',seat:3,ownerTeam:1}
];
assert.equal(getPlayableCard(MONSTER_REBORN)?.englishName,'Monster Reborn');
assert.equal(getEffect(MONSTER_REBORN)?.kind,'monsterReborn');
assert.equal(getCardStatus(MONSTER_REBORN)?.stage,'certified');
assert.equal(getPlayableCard(DARK_HOLE)?.englishName,'Dark Hole');
assert.equal(getEffect(DARK_HOLE)?.kind,'darkHole');
assert.equal(getCardStatus(DARK_HOLE)?.stage,'certified');
for(const target of TARGETS)assert.equal(getPlayableCard(target.id)?.englishName,target.name);
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20);
function member(seat){return 'm324-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20);
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
  throw new Error('M324 physical card missing from seat '+seat+': '+id);
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
  }
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
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for seat '+seat);
  }
}
function assertPublicPayload(record){
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(record.state)){
    assert.ok(!rendered.includes(card.uid),'public payload leaked UID '+card.uid);
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
  assert.ok(menu,'the active physical representative must receive a private Discord menu');
  assert.ok(menu.options.some(option=>option.value===String(index)));
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
async function rejectInactive(record,index){
  const forged=interaction(record,member(2),index,'m324-forged',member(0));
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
function register(state,targetSeat){
  const id='m324-monster-reborn-seat-'+targetSeat;
  const ids=[0,1,2,3].map(member);
  const members=ids.map((id,seat)=>({id,name:'M324 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m324-guild','m324-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(targetSpec){
  const ids=[0,1,2,3].map(member);
  const required=ids.map((id,seat)=>[
    ...(seat===0?[MONSTER_REBORN,DARK_HOLE]:[]),
    ...(seat===targetSpec.seat?[targetSpec.id]:[])
  ]);
  const players=ids.map((id,seat)=>({id,name:'M324 Seat '+seat,cards:deck(required[seat])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m324-monster-reborn-'+targetSpec.seat});
  state.core.turn=3;
  const reborn=takePhysical(state,0,MONSTER_REBORN);
  const darkHole=takePhysical(state,0,DARK_HOLE);
  holder(state,0).hand.push(reborn,darkHole);
  const target=takePhysical(state,targetSpec.seat,targetSpec.id);
  state.core.players[targetSpec.ownerTeam].grave.push({id:target.id,uid:target.uid});
  assert.match(reborn.uid,/^m0:/);
  assert.match(darkHole.uid,/^m0:/);
  assert.ok(target.uid.startsWith('m'+targetSpec.seat+':'));
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const hands=new Map([0,1,2,3].map(seat=>[seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)]));
  const decks=new Map([0,1,2,3].map(seat=>[seat,holder(state,seat).deck.map(card=>card.uid)]));
  return {reborn,darkHole,target,before,hands,decks,targetSpec,record:register(state,targetSpec.seat)};
}
async function activate(record,actor,cardUid,predicate,requestId){
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='spell'&&action.card===cardUid&&predicate(action));
  assert.ok(index>=0,'the active representative must receive the intended Spell action');
  await rejectInactive(record,index);
  return submit(record,actor,index,requestId);
}
async function assertFinalOwnership(fixture,current){
  const state=current.state,ownerTeam=fixture.targetSpec.ownerTeam;
  assert.deepEqual(state.core.players.map(player=>player.monsters.length),[0,0],
    'Dark Hole must clear both shared Monster Zones after the revived monster is destroyed');
  assert.ok(state.core.players[ownerTeam].grave.some(card=>card.uid===fixture.target.uid),
    'the revived monster must return to its original team Graveyard: '+fixture.target.uid);
  assert.ok(!state.core.players[1-ownerTeam].grave.some(card=>card.uid===fixture.target.uid),
    'the controller must not steal the original owner team Graveyard destination');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.reborn.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.darkHole.uid));
  for(const seat of [0,1,2,3]){
    const expected=fixture.hands.get(seat).filter(uid=>!(seat===0&&(uid===fixture.reborn.uid||uid===fixture.darkHole.uid)));
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),expected,
      'Monster Reborn/Dark Hole must not mutate private hand '+seat);
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),fixture.decks.get(seat),
      'Monster Reborn/Dark Hole must not mutate physical Deck '+seat);
  }
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}

for(const targetSpec of TARGETS){
  test('Monster Reborn revives a '+targetSpec.name+' from '+(targetSpec.ownerTeam===0?'the inactive allied partner':'the opposing team')+' Graveyard and preserves its original owner through Dark Hole in Discord 2v2',async()=>{
    const fixture=setup(targetSpec);
    const actor=member(0);
    const current=await activate(fixture.record,actor,fixture.reborn.uid,
      action=>action.target===fixture.target.uid&&action.position==='atk',
      'm324-reborn-'+targetSpec.seat);
    const revived=current.state.core.players[0].monsters.find(monster=>monster.uid===fixture.target.uid);
    assert.ok(revived,'the selected physical monster must enter the shared allied field');
    assert.equal(revived.owner,targetSpec.ownerTeam,'control changes must not rewrite original team ownership');
    assert.equal(revived.position,'atk');
    assert.ok(!current.state.core.players[targetSpec.ownerTeam].grave.some(card=>card.uid===fixture.target.uid));
    assert.ok(current.state.core.players[0].grave.some(card=>card.uid===fixture.reborn.uid));
    assert.equal(current.state.core.players[1].monsters.length,0);
    assertRules(current.state);
    assertPrivateHands(current.state);
    assertPublicPayload(current);
    const destroyed=await activate(current,actor,fixture.darkHole.uid,
      ()=>true,'m324-dark-hole-'+targetSpec.seat);
    await assertFinalOwnership(fixture,destroyed);
  });
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
