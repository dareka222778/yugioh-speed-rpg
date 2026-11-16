'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m279-puppeteer-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M279 test diagnostic] '+name+'\\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const PUPPETEER='54098121';
const SUMMONED='91152256';
const MONSTER_REBORN='83764718';

const normalIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>id!==SUMMONED)
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense))
  .slice(0,8).map(entry=>entry.id);
const POOL=[PUPPETEER,MONSTER_REBORN,SUMMONED,...normalIds];
assert.ok(normalIds.length===8,'the isolated fixture needs eight certified Normal Monsters');
assert.equal(new Set(POOL).size,POOL.length);

test('M279 card and rules preflight',()=>{
  assert.equal(getPlayableCard(PUPPETEER)?.englishName,'Mysterious Puppeteer');
  assert.equal(getPlayableCard(PUPPETEER)?.kind,'monster');
  assert.equal(getCardStatus(PUPPETEER)?.stage,'certified');
  assert.deepEqual(getMonsterEffect(PUPPETEER),{
    trigger:'onOtherSummon',
    operation:{kind:'heal',amount:500}
  });
  assert.equal(getPlayableCard(SUMMONED)?.monsterType,'normal');
  assert.equal(getCardStatus(SUMMONED)?.stage,'certified');
  assert.equal(getEffect(MONSTER_REBORN)?.kind,'monsterReborn');
  assert.equal(POOL.length,11);
});

function member(seat){return 'm279-seat-'+seat;}
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
  throw new Error('M279 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const card=takePhysical(state,seat,id);
  holder(state,seat).hand.push(card);
  return card;
}
function placePuppeteer(state,seat){
  const card=takePhysical(state,seat,PUPPETEER);
  const monster={...card,owner:0,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[0].monsters.push(monster);
  return monster;
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
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function assertPublicPayload(state){
  const payload=tagPublicMessage(state);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(state)){
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
    assert.ok(guard<40,'the summon response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m279-'+suffix+'-pass-'+guard);
  }
  return current;
}
async function rejectInactivePartner(record,actor,partner,index,suffix){
  assert.deepEqual(tag.tagActions(record.state,partner),[],
    'the inactive physical partner cannot receive the active teammate action menu');
  const forged=interaction(record,partner,index,'m279-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[],'forged partner action must be rejected before defer');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'rejected partner action must not mutate the persisted duel');
}
function setup({first,sourceSeat,summonedSeat,source=true,prepare,scenario}){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M279 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first,seed:'m279-'+scenario});
  state.core.turn=3;
  const actor=ids[first];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const prepared=prepare?prepare(state):{};
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m279-'+scenario,guild='m279-guild',channel='m279-channel';
  const members=ids.map((id,seat)=>({id,name:'M279 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor,before,...prepared,record:store.getTag(id)};
}
async function normalSummon(fixture,summoned,suffix){
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='summon'&&action.card===summoned.uid&&action.position==='atk'
  );
  assert.ok(index>=0,'the active physical seat must see the Normal Summon action in Discord');
  const partner=fixture.actor===member(0)?member(2):member(3);
  await rejectInactivePartner(fixture.record,fixture.actor,partner,index,suffix);
  const current=await submit(fixture.record,fixture.actor,index,'m279-'+suffix+'-summon');
  return settleResponses(current,suffix+'-resolve');
}
function assertFinal(fixture,state){
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}

test('partner-owned Mysterious Puppeteer heals its team after the active teammate Normal Summons',async()=>{
  const fixture=setup({
    first:0,sourceSeat:2,summonedSeat:0,scenario:'active-teammate-normal',
    prepare:state=>({source:placePuppeteer(state,2),summoned:ensureInHand(state,0,SUMMONED)})
  });
  assert.match(fixture.source.uid,/^m2:/);
  assert.match(fixture.summoned.uid,/^m0:/);
  const ownBefore=fixture.record.state.core.players[0].lp;
  const oppBefore=fixture.record.state.core.players[1].lp;
  const current=await normalSummon(fixture,fixture.summoned,'active-teammate-normal');
  assert.equal(current.state.core.players[0].lp,ownBefore+500);
  assert.equal(current.state.core.players[1].lp,oppBefore);
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid));
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.summoned.uid));
  assertFinal(fixture,current.state);
});

test('partner-owned Mysterious Puppeteer heals its team after an opponent Normal Summons',async()=>{
  const fixture=setup({
    first:1,sourceSeat:0,summonedSeat:1,scenario:'opponent-normal',
    prepare:state=>({source:placePuppeteer(state,0),summoned:ensureInHand(state,1,SUMMONED)})
  });
  assert.match(fixture.source.uid,/^m0:/);
  assert.match(fixture.summoned.uid,/^m1:/);
  assert.equal(fixture.record.state.active[0],2);
  assert.equal(fixture.record.state.active[1],1);
  const ownBefore=fixture.record.state.core.players[0].lp;
  const oppBefore=fixture.record.state.core.players[1].lp;
  const current=await normalSummon(fixture,fixture.summoned,'opponent-normal');
  assert.equal(current.state.core.players[0].lp,ownBefore+500);
  assert.equal(current.state.core.players[1].lp,oppBefore);
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid));
  assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===fixture.summoned.uid));
  assert.deepEqual(tag.tagActions(current.state,member(0)),[]);
  assert.deepEqual(tag.tagActions(current.state,member(2)),[]);
  assertFinal(fixture,current.state);
});

test('Mysterious Puppeteer does not trigger on an opponent Monster Reborn Special Summon',async()=>{
  const fixture=setup({
    first:1,sourceSeat:0,summonedSeat:1,scenario:'special-summon-negative',
    prepare:state=>{
      const source=placePuppeteer(state,0);
      const revived=takePhysical(state,1,SUMMONED);
      state.core.players[1].grave.push(revived);
      const reborn=ensureInHand(state,1,MONSTER_REBORN);
      return {source,revived,reborn};
    }
  });
  const ownBefore=fixture.record.state.core.players[0].lp;
  const oppBefore=fixture.record.state.core.players[1].lp;
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='spell'&&action.card===fixture.reborn.uid&&action.target===fixture.revived.uid
  );
  assert.ok(index>=0,'the active opposing seat must see Monster Reborn targeting the shared Graveyard card');
  const current=await submit(fixture.record,fixture.actor,index,'m279-special-summon-reborn');
  const resolved=await settleResponses(current,'special-summon-negative');
  assert.equal(resolved.state.core.players[0].lp,ownBefore);
  assert.equal(resolved.state.core.players[1].lp,oppBefore);
  assert.ok(resolved.state.core.players[1].monsters.some(card=>card.uid===fixture.revived.uid));
  assert.ok(resolved.state.core.players[1].grave.some(card=>card.uid===fixture.reborn.uid));
  assertFinal(fixture,resolved.state);
});

test('Mysterious Puppeteer does not trigger on its own Normal Summon',async()=>{
  const fixture=setup({
    first:0,sourceSeat:0,summonedSeat:0,source:false,scenario:'self-normal-negative',
    prepare:state=>({summoned:ensureInHand(state,0,PUPPETEER)})
  });
  const ownBefore=fixture.record.state.core.players[0].lp;
  const oppBefore=fixture.record.state.core.players[1].lp;
  const current=await normalSummon(fixture,fixture.summoned,'self-normal-negative');
  assert.equal(current.state.core.players[0].lp,ownBefore);
  assert.equal(current.state.core.players[1].lp,oppBefore);
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.summoned.uid));
  assertFinal(fixture,current.state);
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
