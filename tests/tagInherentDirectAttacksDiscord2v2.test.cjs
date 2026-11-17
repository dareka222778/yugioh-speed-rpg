'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m285-direct-attack-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M285 test diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const DIRECT_ATTACKERS=[
  {id:'12472242',name:'Leghul',atk:300},
  {id:'21347810',name:'Rainbow Flower',atk:400},
  {id:'58861941',name:'Ooguchi',atk:300},
  {id:'32809211',name:'Jinzo #7',atk:500},
  {id:'02792265',name:'Servant of Catabolism',atk:700},
  {id:'59290628',name:'Nightmare Horse',atk:500}
];
const DIRECT_IDS=DIRECT_ATTACKERS.map(card=>card.id);
const normalIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!DIRECT_IDS.includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense))
  .slice(0,14).map(entry=>entry.id);
assert.equal(normalIds.length,14,'the 2v2 fixture needs fourteen distinct certified Normal Monsters');
const POOL=[...DIRECT_IDS,...normalIds];
assert.equal(POOL.length,20);
assert.equal(new Set(POOL).size,20);

for(const entry of DIRECT_ATTACKERS){
  assert.equal(getPlayableCard(entry.id)?.englishName,entry.name);
  assert.equal(getPlayableCard(entry.id)?.atk,entry.atk);
  assert.equal(getCardStatus(entry.id)?.stage,'certified');
  assert.deepEqual(getMonsterEffect(entry.id),{
    trigger:'continuous',operation:{kind:'directAttack'}
  },entry.name+' must use the audited directAttack operation');
  assert.equal(getEffect(entry.id)?.kind,'monsterEffect');
}

function member(seat){return 'm285-seat-'+seat;}
function deck(){return [...POOL];}
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
  throw new Error('M285 physical card missing from seat '+seat+': '+id);
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
function interaction(record,userId,index,requestId){
  const calls=[];
  return {
    id:requestId,guildId:record.guild,user:{id:userId},
    customId:'tag:act:'+record.id+':'+record.revision+':'+userId,
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
  assert.ok(menu,'the real private Discord panel must expose the active seat action menu');
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
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the direct-attack response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0);
    current=await submit(current,actor,pass,'m285-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(sourceId,seed){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M285 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  const actor=ids[0];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const before=inventory(state);
  const source=deploy(state,2,sourceId);
  const enemyActive=deploy(state,1,normalIds[0]);
  const enemyPartner=deploy(state,3,normalIds[1]);
  assert.match(source.uid,/^m2:/);
  assert.match(enemyActive.uid,/^m1:/);
  assert.match(enemyPartner.uid,/^m3:/);
  assert.equal(tag.tagActions(state,member(2)).length,0,'the inactive physical partner receives no action projection');
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m285-'+seed,guild='m285-guild',channel='m285-channel';
  const members=ids.map((id,seat)=>({id,name:'M285 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor,before,source,enemyActive,enemyPartner,record:store.getTag(id)};
}
function assertFinal(fixture,state){
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
async function enterBattle(fixture){
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0);
  const current=await submit(fixture.record,fixture.actor,index,'m285-'+fixture.id+'-battle');
  return settleResponses(current,fixture.id+'-battle');
}
async function attackDirect(fixture,record,suffix){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.source.uid&&action.target===undefined
  );
  assert.ok(index>=0,'the private Discord menu must offer the inherent direct attack');
  const current=await submit(record,fixture.actor,index,'m285-'+suffix+'-direct');
  return settleResponses(current,suffix+'-resolve');
}
for(const entry of DIRECT_ATTACKERS){
  test(entry.name+' declares an inherent direct attack through Discord while both opposing seats control monsters',async()=>{
    const fixture=setup(entry.id,'direct-'+entry.id);
    const ownBefore=fixture.record.state.core.players[0].lp;
    const opposingBefore=fixture.record.state.core.players[1].lp;
    const inBattle=await enterBattle(fixture);
    const current=await attackDirect(fixture,inBattle,entry.id);
    assert.equal(current.state.core.players[0].lp,ownBefore);
    assert.equal(current.state.core.players[1].lp,opposingBefore-entry.atk);
    assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid));
    assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===fixture.enemyActive.uid));
    assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===fixture.enemyPartner.uid));
    assertFinal(fixture,current.state);
  });
}
test('a Normal Monster cannot use the direct-attack option while either opposing physical seat controls a monster',async()=>{
  const fixture=setup(normalIds[2],'normal-direct-control');
  const inBattle=await enterBattle(fixture);
  const actions=tag.tagActions(inBattle.state,fixture.actor);
  assert.ok(!actions.some(action=>action.kind==='attack'&&action.card===fixture.source.uid&&action.target===undefined));
  assert.ok(actions.some(action=>action.kind==='attack'&&action.card===fixture.source.uid&&action.target===fixture.enemyActive.uid),
    'the Normal Monster still receives a targeted attack option');
  assertFinal(fixture,inBattle.state);
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
