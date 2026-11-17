'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m282-mystic-tomato-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M282 test diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const MYSTIC_TOMATO='83011277';
const AXE_RAIDER='48305365';
const SANGAN='26202165';
const CANNON_SOLDIER='11384280';
const REQUIRED=[MYSTIC_TOMATO,AXE_RAIDER,SANGAN,CANNON_SOLDIER];
const fillers=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!REQUIRED.includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense)&&
    (entry.card.attribute!=='DARK'||entry.card.atk>1500));
const fillerIds=fillers.slice(0,20).map(entry=>entry.id);

test('M282 certified Mystic Tomato recruiter and physical Deck fixtures',()=>{
  assert.equal(getPlayableCard(MYSTIC_TOMATO)?.englishName,'Mystic Tomato');
  assert.equal(getPlayableCard(MYSTIC_TOMATO)?.attribute,'DARK');
  assert.equal(getPlayableCard(MYSTIC_TOMATO)?.atk,1400);
  assert.equal(getCardStatus(MYSTIC_TOMATO)?.stage,'certified');
  assert.equal(getEffect(MYSTIC_TOMATO)?.kind,'monsterEffect');
  assert.deepEqual(getMonsterEffect(MYSTIC_TOMATO),{
    trigger:'onBattleDestroyed',
    operation:{kind:'specialSummon',attribute:'DARK',maximumAtk:1500}
  });
  assert.equal(getPlayableCard(AXE_RAIDER)?.englishName,'Axe Raider');
  assert.equal(getPlayableCard(AXE_RAIDER)?.atk,1700);
  assert.equal(getPlayableCard(SANGAN)?.attribute,'DARK');
  assert.equal(getPlayableCard(SANGAN)?.atk,1000);
  assert.equal(getPlayableCard(CANNON_SOLDIER)?.attribute,'DARK');
  assert.equal(getPlayableCard(CANNON_SOLDIER)?.atk,1400);
  assert.ok(fillerIds.length>=20,'the four isolated physical Decks need twenty ineligible Normal Monster fillers');
});

function member(seat){return 'm282-seat-'+seat;}
function deckFor(seat,includeActiveTarget){
  const special=seat===0?[CANNON_SOLDIER]:seat===2?[MYSTIC_TOMATO,...(includeOwnerTarget?[SANGAN]:[])]:seat===3?[AXE_RAIDER]:[];
  const ids=[...special,...fillerIds.slice(0,20-special.length)];
  assert.equal(ids.length,20,'each physical participant must have a 20-card Deck');
  assert.equal(new Set(ids).size,20,'each physical Deck must have unique card identities');
  return ids;
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
  throw new Error('M282 physical card missing from seat '+seat+': '+id);
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
    current=await submit(current,actor,pass,'m282-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario,includeOwnerTarget){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M282 Seat '+seat,cards:deckFor(seat,includeOwnerTarget)}));
  const state=tag.createTagDuel(players,{classic:true,first:1,seed:'m282-'+scenario});
  state.core.turn=3;
  const actor=ids[1];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const tomato=deploy(state,2,MYSTIC_TOMATO,'atk');
  const attacker=deploy(state,3,AXE_RAIDER,'atk');
  const ownerCandidate=state.reserves[2].deck.find(card=>card.id===SANGAN);
  const teammateCandidate=state.core.players[0].deck.find(card=>card.id===CANNON_SOLDIER);
  assert.ok(teammateCandidate,'the active teammate physical Deck deliberately contains a different eligible DARK target');
  if(includeOwnerTarget)assert.ok(ownerCandidate,'the Tomato physical owner Deck contains Sangan');
  else assert.equal(ownerCandidate,undefined,'the Tomato physical owner Deck deliberately has no eligible DARK target');
  const before=inventory(state);
  assert.match(tomato.uid,/^m2:/);
  assert.match(attacker.uid,/^m3:/);
  assert.match(partnerCandidate.uid,/^m2:/);
  if(activeCandidate)assert.match(activeCandidate.uid,/^m0:/);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m282-'+scenario,guild='m282-guild',channel='m282-channel';
  const members=ids.map((id,seat)=>({id,name:'M282 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor,before,tomato,attacker,activeCandidate,partnerCandidate,record:store.getTag(id)};
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
  assert.ok(index>=0,'the active opponent must see the Battle Phase action in Discord');
  const current=await submit(fixture.record,fixture.actor,index,'m282-'+fixture.id+'-battle');
  return settleResponses(current,fixture.id+'-battle');
}
async function attackTomato(fixture,record,suffix){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.tomato.uid
  );
  assert.ok(index>=0,'the active opponent must see the partner-owned Axe Raider attack in Discord');
  const current=await submit(record,fixture.actor,index,'m282-'+suffix+'-attack');
  return settleResponses(current,suffix+'-resolve');
}
async function battleAndResolve(fixture,suffix){
  const inBattle=await enterBattle(fixture);
  return attackTomato(fixture,inBattle,suffix);
}
async function chooseTomatoTrigger(fixture,record,suffix){
  assert.equal(record.state.core.phase,'choice','a battle-destroyed Tomato with a legal target opens its optional trigger');
  assert.equal(record.state.core.choice?.source,'triggerOptional');
  const actor=tag.tagDecisionMember(record.state).id;
  assert.equal(actor,member(0),'the active teammate, not the inactive physical owner, controls the team response');
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='choose'&&action.target===fixture.tomato.uid);
  assert.ok(index>=0,'the private Discord panel must offer the Tomato optional trigger');
  return submit(record,actor,index,'m282-'+suffix+'-activate');
}
async function chooseRecruit(fixture,record,suffix){
  assert.equal(record.state.core.phase,'choice');
  assert.equal(record.state.core.choice?.source,'monsterRecruit');
  const actor=tag.tagDecisionMember(record.state).id;
  assert.equal(actor,member(0));
  const actions=tag.tagActions(record.state,actor);
  const activeIndex=actions.findIndex(action=>action.kind==='choose'&&action.target===fixture.activeCandidate.uid);
  assert.ok(activeIndex>=0,'the recruit menu must expose Sangan from the active representative physical Deck');
  assert.ok(!actions.some(action=>action.kind==='choose'&&action.target===fixture.partnerCandidate.uid),
    'the recruit menu must not expose Cannon Soldier from the inactive partner private Deck');
  return submit(record,actor,activeIndex,'m282-'+suffix+'-recruit');
}

test('battle-destroyed partner-owned Mystic Tomato recruits from the active representative physical Deck',async()=>{
  const fixture=setup('active-representative-deck-positive',true);
  const ownBefore=fixture.record.state.core.players[0].lp;
  const opposingBefore=fixture.record.state.core.players[1].lp;
  let current=await battleAndResolve(fixture,'active-representative-deck-positive');
  assert.equal(current.state.core.players[0].lp,ownBefore-300);
  assert.equal(current.state.core.players[1].lp,opposingBefore);
  assert.ok(current.state.core.players[0].grave.some(card=>card.uid===fixture.tomato.uid));
  current=await chooseTomatoTrigger(fixture,current,'active-representative-deck-positive');
  current=await chooseRecruit(fixture,current,'active-representative-deck-positive');
  const summoned=current.state.core.players[0].monsters.find(card=>card.uid===fixture.activeCandidate.uid);
  assert.ok(summoned,'Sangan must enter the shared team field');
  assert.equal(summoned.id,SANGAN);
  assert.equal(summoned.position,'atk');
  assert.equal(summoned.faceUp,true);
  assert.match(summoned.uid,/^m0:/,'the recruited card retains active representative physical seat 0');
  assert.ok(current.state.reserves[2].deck.some(card=>card.uid===fixture.partnerCandidate.uid),
    'the inactive partner Cannon Soldier remains in its own physical Deck');
  assert.ok(!current.state.core.players[0].deck.some(card=>card.uid===fixture.activeCandidate.uid));
  assertFinal(fixture,current.state);
});

test('Tomato cannot borrow an eligible DARK monster from the inactive partner when the active representative Deck has none',async()=>{
  const fixture=setup('active-representative-deck-negative',false);
  const ownBefore=fixture.record.state.core.players[0].lp;
  const opposingBefore=fixture.record.state.core.players[1].lp;
  const current=await battleAndResolve(fixture,'active-representative-deck-negative');
  assert.equal(current.state.core.players[0].lp,ownBefore-300);
  assert.equal(current.state.core.players[1].lp,opposingBefore);
  assert.equal(current.state.core.phase,'battle');
  assert.equal(current.state.core.choice,undefined,'no legal target in the active representative Deck means no optional recruiter choice');
  assert.ok(current.state.core.players[0].grave.some(card=>card.uid===fixture.tomato.uid));
  assert.ok(current.state.reserves[2].deck.some(card=>card.uid===fixture.partnerCandidate.uid),
    'the inactive partner Deck remains untouched and inaccessible to this effect');
  assert.ok(!current.state.core.players[0].monsters.some(card=>card.id===CANNON_SOLDIER));
  assertFinal(fixture,current.state);
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
