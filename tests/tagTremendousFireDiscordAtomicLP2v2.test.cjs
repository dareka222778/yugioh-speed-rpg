'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m313-tremendous-fire-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M313 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const TREMENDOUS_FIRE='46918794';
assert.equal(getPlayableCard(TREMENDOUS_FIRE)?.englishName,'Tremendous Fire');
assert.equal(getCardStatus(TREMENDOUS_FIRE)?.stage,'certified');
assert.equal(getEffect(TREMENDOUS_FIRE)?.kind,'sequence');
assert.deepEqual(getEffect(TREMENDOUS_FIRE)?.operations,[{
  kind:'damage',
  recipients:[
    {player:'opponent',amount:1000},
    {player:'self',amount:500}
  ]
}]);
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'four physical Decks need at least twenty certified Normal Monster fillers');

function member(seat){return 'm313-seat-'+seat;}
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
  throw new Error('M313 physical card missing from seat '+seat);
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
    assert.ok(!rendered.includes(card.uid),'public Discord payload leaked UID '+card.uid);
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
  assert.ok(menu,'the active representative must receive a private Discord menu');
  assert.ok(menu.options.some(option=>option.value===String(index)));
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1,'the public duel message must refresh after resolution');
  return store.getTag(record.id);
}
async function rejectInactive(record,index,suffix){
  const forged=interaction(record,member(2),index,'m313-'+suffix+'-forged',member(0));
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'inactive partner must be rejected before ACK');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
function setup(lp,id){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({
    id,name:'M313 Seat '+seat,cards:deck(seat===0?[TREMENDOUS_FIRE]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m313-'+id});
  state.core.turn=3;
  state.core.players[0].lp=lp[0];
  state.core.players[1].lp=lp[1];
  const spell=takePhysical(state,0,TREMENDOUS_FIRE);
  holder(state,0).hand.push(spell);
  assert.match(spell.uid,/^m0:/);
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const hands=new Map([0,1,2,3].map(seat=>[seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)]));
  const decks=new Map([0,1,2,3].map(seat=>[seat,holder(state,seat).deck.map(card=>card.uid)]));
  const sessionMembers=ids.map((id,seat)=>({id,name:'M313 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m313-guild','m313-channel',null,0,Date.now(),'playing',JSON.stringify(sessionMembers),JSON.stringify(state),'classic-loan');
  return {spell,before,hands,decks,record:store.getTag(id)};
}
async function resolve(lp,id,expected,phase,winner){
  const fixture=setup(lp,id);
  const actions=tag.tagActions(fixture.record.state,member(0));
  const index=actions.findIndex(action=>action.kind==='spell'&&action.card===fixture.spell.uid);
  assert.ok(index>=0,'the active seat must receive the Tremendous Fire action');
  assert.deepEqual(tag.tagActions(fixture.record.state,member(2)),[],
    'the inactive partner cannot activate a Spell from the active physical hand');
  await rejectInactive(fixture.record,index,id);
  const current=await submit(fixture.record,member(0),index,'m313-'+id+'-activate');
  const state=current.state;
  assert.deepEqual(state.core.players.map(player=>player.lp),expected,
    'both teams must receive their complete damage amounts before the victory check');
  assert.equal(state.core.phase,phase);
  assert.equal(state.core.winner,winner);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.spell.uid),
    'the resolving Spell enters the shared Graveyard with its original physical UID');
  for(const seat of [0,1,2,3]){
    const expectedHand=fixture.hands.get(seat).filter(uid=>!(seat===0&&uid===fixture.spell.uid));
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),expectedHand,
      'only the active physical hand loses Tremendous Fire');
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),fixture.decks.get(seat),
      'Tremendous Fire must not mutate physical Deck '+seat);
  }
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
  return state;
}

test('Tremendous Fire resolves both team damage values through the Discord Spell menu',async()=>{
  await resolve([4000,4000],'m313-normal',[3500,3000],'main',null);
});
test('Tremendous Fire produces a draw when both teams reach zero in the same Discord resolution',async()=>{
  const state=await resolve([500,1000],'m313-simultaneous-tie',[0,0],'finished',null);
  assert.equal(state.core.winner,null,'simultaneous defeat must not become a false sequential winner');
});
test('Tremendous Fire awards victory to the team that survives the grouped Discord damage',async()=>{
  const state=await resolve([501,1000],'m313-survivor',[1,0],'finished',stateTeam0());
  function stateTeam0(){return state?.core?.players?.[0]?.id??'tag-team-0';}
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});