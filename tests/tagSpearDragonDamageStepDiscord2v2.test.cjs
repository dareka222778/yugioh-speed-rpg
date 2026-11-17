'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m281-spear-dragon-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M281 test diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const SPEAR_DRAGON='31553716';
const CELTIC_GUARDIAN='91152256';
const SWORDSMAN_OF_LANDSTAR='03573512';
const MYSTICAL_ELF='15025844';
const REQUIRED=[SPEAR_DRAGON,CELTIC_GUARDIAN,SWORDSMAN_OF_LANDSTAR,MYSTICAL_ELF];
const fillers=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!REQUIRED.includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.level)&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
const fillerIds=fillers.slice(0,16).map(entry=>entry.id);
const POOL=[...REQUIRED,...fillerIds];

test('M281 certified Spear Dragon definition and legal fixture preflight',()=>{
  assert.equal(getPlayableCard(SPEAR_DRAGON)?.englishName,'Spear Dragon');
  assert.equal(getPlayableCard(SPEAR_DRAGON)?.level,4);
  assert.equal(getPlayableCard(SPEAR_DRAGON)?.atk,1900);
  assert.equal(getCardStatus(SPEAR_DRAGON)?.stage,'certified');
  assert.equal(getEffect(SPEAR_DRAGON)?.kind,'monsterEffect');
  assert.equal(getMonsterEffect(SPEAR_DRAGON)?.trigger,'continuous');
  assert.equal(getMonsterEffect(SPEAR_DRAGON)?.operation.kind,'endDamageDefensePiercing');
  assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.defense,1200);
  assert.equal(getPlayableCard(SWORDSMAN_OF_LANDSTAR)?.atk,500);
  assert.equal(getPlayableCard(MYSTICAL_ELF)?.defense,2000);
  assert.ok(fillerIds.length>=16,'the isolated 2v2 fixture needs sixteen certified Normal Monster fillers');
  assert.equal(POOL.length,20);
  assert.equal(new Set(POOL).size,20);
});

function member(seat){return 'm281-seat-'+seat;}
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
  throw new Error('M281 physical card missing from seat '+seat+': '+id);
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
    assert.ok(team.monsters.length<=3,'each shared team field has only three Monster Zones');
    assert.ok(team.backrow.length<=3,'each shared team field has only three Spell/Trap Zones');
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
  assert.ok(menu,'the real private Discord panel must expose the active seat action menu');
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
    assert.ok(guard<40,'the battle response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m281-'+suffix+'-pass-'+guard);
  }
  return current;
}
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m281-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[],'forged inactive-partner action must be rejected before defer');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'rejected partner action must not mutate the persisted duel');
}
function setup(scenario,targetId,targetPosition,secondTarget){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M281 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m281-'+scenario});
  state.core.turn=3;
  const actor=ids[0];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const source=deploy(state,2,SPEAR_DRAGON,'atk');
  const target=deploy(state,3,targetId,targetPosition);
  const second=secondTarget?deploy(state,1,secondTarget.id,secondTarget.position):null;
  const before=inventory(state);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m281-'+scenario,guild='m281-guild',channel='m281-channel';
  const members=ids.map((id,seat)=>({id,name:'M281 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor,before,source,target,second,record:store.getTag(id)};
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
  assert.ok(index>=0,'the active teammate must see the Battle Phase action in Discord');
  const current=await submit(fixture.record,fixture.actor,index,'m281-'+fixture.id+'-battle');
  return settleResponses(current,fixture.id+'-battle');
}
async function attack(fixture,record,suffix){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.source.uid&&action.target===fixture.target.uid
  );
  assert.ok(index>=0,'the Discord action list must expose the partner-owned Spear Dragon and opposing target');
  await rejectInactivePartner(record,fixture.actor,member(2),index,suffix);
  const current=await submit(record,fixture.actor,index,'m281-'+suffix+'-attack');
  return settleResponses(current,suffix+'-resolve');
}
async function playBattle(fixture,suffix){
  const inBattle=await enterBattle(fixture);
  return attack(fixture,inBattle,suffix);
}

test('Spear Dragon pierces lower Defense and changes to Defense immediately after the Damage Step',async()=>{
  const fixture=setup('piercing-and-damage-step-position',CELTIC_GUARDIAN,'def',{
    id:SWORDSMAN_OF_LANDSTAR,position:'atk'
  });
  assert.match(fixture.source.uid,/^m2:/);
  assert.match(fixture.target.uid,/^m3:/);
  assert.match(fixture.second.uid,/^m1:/);
  const ownBefore=fixture.record.state.core.players[0].lp;
  const opposingBefore=fixture.record.state.core.players[1].lp;
  const current=await playBattle(fixture,'piercing-and-damage-step-position');
  assert.equal(current.state.core.players[0].lp,ownBefore);
  assert.equal(current.state.core.players[1].lp,opposingBefore-(1900-1200));
  const sourceAfter=current.state.core.players[0].monsters.find(card=>card.uid===fixture.source.uid);
  assert.equal(sourceAfter?.position,'def','Spear Dragon must switch during the Damage Step, not at Battle Phase end');
  assert.ok(current.state.core.players[1].grave.some(card=>card.uid===fixture.target.uid),
    'Spear Dragon destroys the lower-DEF target while inflicting piercing damage');
  assert.ok(!current.state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===fixture.second.uid),
    'the second target remains available, proving the Battle Phase did not end');
  assert.ok(!tag.tagActions(current.state,fixture.actor).some(action=>
    action.kind==='attack'&&action.card===fixture.source.uid
  ),'a Spear Dragon already changed to Defense cannot declare a second attack');
  assertFinal(fixture,current.state);
});

test('Spear Dragon does not pierce when the Defense monster has at least its ATK in DEF, but still changes position',async()=>{
  const fixture=setup('no-piercing-high-defense',MYSTICAL_ELF,'def');
  const ownBefore=fixture.record.state.core.players[0].lp;
  const opposingBefore=fixture.record.state.core.players[1].lp;
  const current=await playBattle(fixture,'no-piercing-high-defense');
  assert.equal(current.state.core.players[0].lp,ownBefore-(2000-1900));
  assert.equal(current.state.core.players[1].lp,opposingBefore);
  const sourceAfter=current.state.core.players[0].monsters.find(card=>card.uid===fixture.source.uid);
  assert.equal(sourceAfter?.position,'def');
  assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  assert.ok(!current.state.core.players[1].grave.some(card=>card.uid===fixture.target.uid));
  assertFinal(fixture,current.state);
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
