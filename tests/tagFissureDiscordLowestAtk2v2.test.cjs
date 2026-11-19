'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m301-fissure-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M301 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const FISSURE='66788016';
assert.equal(getPlayableCard(FISSURE)?.kind,'spell','Fissure must be an enabled Spell');
assert.equal(getEffect(FISSURE)?.kind,'fissure');
assert.equal(getCardStatus(FISSURE)?.stage,'certified');
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense))
  .sort((a,b)=>a.card.atk-b.card.atk||a.id.localeCompare(b.id));
assert.ok(NORMALS.length>=20,'four isolated physical Decks need at least twenty certified Normal Monsters');
const low=NORMALS[0];
const middle=NORMALS.find(entry=>entry.card.atk>low.card.atk);
const high=NORMALS.find(entry=>entry.card.atk>(middle?.card.atk??low.card.atk));
assert.ok(middle&&high,'the fixture needs three distinct ATK values');
assert.ok(low.card.atk<middle.card.atk&&middle.card.atk<high.card.atk);

function member(seat){return 'm301-seat-'+seat;}
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
  throw new Error('M301 physical card missing from seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
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
    'the private Discord menu must expose the legal Fissure action');
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
async function rejectInactivePartner(record,actor,partner,index){
  const forged=interaction(record,partner,index,'m301-fissure-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'the inactive physical partner must be rejected before acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'a rejected partner action must not mutate the persisted duel');
}
function setup(){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M301 Seat '+seat,cards:deck(seat===0?[FISSURE]:[])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m301-fissure-discord-lowest-atk'});
  const fissure=takePhysical(state,0,FISSURE);
  holder(state,0).hand.push(fissure);
  const friendlyLow=deploy(state,2,low.id);
  const opponentHigh=deploy(state,1,high.id);
  const opponentMiddle=deploy(state,3,middle.id);
  state.core.turn=3;
  assert.equal(tag.tagDecisionMember(state).id,member(0),'seat 0 must be the active Main Phase representative');
  const before=inventory(state);
  assert.match(friendlyLow.uid,/^m2:/);
  assert.match(opponentHigh.uid,/^m1:/);
  assert.match(opponentMiddle.uid,/^m3:/);
  assert.match(fissure.uid,/^m0:/,'Fissure retains active physical seat 0 ownership');
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m301-fissure',guild='m301-guild',channel='m301-channel';
  const members=ids.map((id,seat)=>({id,name:'M301 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {friendlyLow,opponentHigh,opponentMiddle,fissure,before,record:store.getTag(id)};
}
test('Fissure uses the active Discord Spell menu and destroys the lowest-ATK monster across both opposing physical seats',async()=>{
  const fixture=setup();
  const actor=member(0);
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>action.kind==='spell'&&action.card===fixture.fissure.uid);
  assert.ok(index>=0,'the active seat must receive the legal Fissure Spell action');
  assert.deepEqual(tag.tagActions(fixture.record.state,member(2)),[],
    'the inactive physical partner cannot execute the Main Phase Spell');
  await rejectInactivePartner(fixture.record,actor,member(2),index);
  const current=await submit(fixture.record,actor,index,'m301-fissure-activate');
  const state=current.state;
  assert.equal(state.core.phase,'main','Fissure resolves without opening an unrelated response phase');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.friendlyLow.uid),
    'Fissure ignores a lower-ATK monster controlled by the activating team');
  assert.deepEqual(state.core.players[1].monsters.map(card=>card.uid),[fixture.opponentHigh.uid],
    'the higher-ATK opponent monster survives');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.opponentMiddle.uid),
    'the lowest-ATK monster across the opposing team is destroyed');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.fissure.uid),
    'the resolved Spell enters the activating team shared Graveyard');
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,4000]);
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
