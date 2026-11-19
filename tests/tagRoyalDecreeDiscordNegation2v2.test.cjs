'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m337-royal-decree-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M337 diagnostic] '+name+'\\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');
const {rulesFor}=require('../dist/rulesProfile');

const ROYAL_DECREE='51452091';
const SAKURETSU_ARMOR='56120475';
const decree=getEffect(ROYAL_DECREE);
assert.equal(getPlayableCard(ROYAL_DECREE)?.englishName,'Royal Decree');
assert.equal(getPlayableCard(ROYAL_DECREE)?.kind,'trap');
assert.equal(getCardStatus(ROYAL_DECREE)?.stage,'certified');
assert.equal(decree?.kind,'continuous');
assert.deepEqual(decree?.rules,[{kind:'negateTraps'}]);
assert.equal(getActivationModel(decree)?.speed,2);
assert.equal(getActivationModel(decree)?.window,'free');
assert.equal(getPlayableCard(SAKURETSU_ARMOR)?.englishName,'Sakuretsu Armor');
assert.equal(getEffect(SAKURETSU_ARMOR)?.kind,'sakuretsuArmor');

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense)&&entry.card.level<=4);
const ATTACKER=NORMALS.filter(entry=>entry.card.atk>=1500).sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(ATTACKER,'the Discord battle fixture needs a certified Level 4 Normal Monster with at least 1500 ATK');

function member(seat){return 'm337-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20,'each physical Deck must contain twenty distinct certified cards');
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
  throw new Error('M337 physical card missing from seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,attackCount:0,atkBoost:0,defBoost:0};
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
    assert.ok(team.monsters.length<=3,'each team shares three Monster Zones');
    assert.ok(team.backrow.length<=3,'each team shares three Spell/Trap Zones');
  }
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra||[]).length<=5);
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
function assertHidden(publicState,card){
  assert.ok(!publicState.includes(card.id),'a Set Trap identity must remain hidden');
  assert.ok(!publicState.includes(card.uid),'a Set Trap UID must remain hidden');
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
  assert.ok(menu,'the active physical representative must receive a private Discord menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private menu must expose legal action index '+index);
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
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the response chain and Damage Step windows must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the active physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m337-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setupBattle(activeDecree,scenario){
  const ids=[0,1,2,3].map(member);
  const required=[ROYAL_DECREE,SAKURETSU_ARMOR,ATTACKER.id];
  const players=ids.map((id,seat)=>({id,name:'M337 Seat '+seat,cards:deck(required)}));
  const state=tag.createTagDuel(players,{classic:true,first:1,seed:'m337-'+scenario});
  state.core.turn=3;
  state.core.phase='battle';
  assert.equal(tag.tagDecisionMember(state).id,member(1),'seat 1 must be the active attacker');
  const decreeCard=takePhysical(state,0,ROYAL_DECREE);
  const sakuretsuCard=takePhysical(state,0,SAKURETSU_ARMOR);
  const royal={...decreeCard,faceUp:activeDecree,resolved:activeDecree,setTurn:0};
  const sakuretsu={...sakuretsuCard,faceUp:false,setTurn:0};
  state.core.players[0].backrow.push(royal,sakuretsu);
  const attacker=deploy(state,1,ATTACKER.id);
  assert.match(royal.uid,/^m0:/,'Royal Decree retains inactive physical seat 0 ownership');
  assert.match(sakuretsu.uid,/^m0:/,'Sakuretsu Armor retains inactive physical seat 0 ownership');
  assert.match(attacker.uid,/^m1:/,'the attacker retains active physical seat 1 ownership');
  assertRules(state);
  assertPrivateHands(state);
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  assertHidden(publicState,sakuretsu);
  if(!activeDecree)assertHidden(publicState,royal);
  else assert.ok(publicState.includes(ROYAL_DECREE),'the active Continuous Trap is publicly visible');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m337-'+scenario;
  const members=ids.map((id,seat)=>({id,name:'M337 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m337-guild','m337-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {record:store.getTag(id),royal,sakuretsu,attacker,before:inventory(state)};
}
function setupActivation(){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M337 Seat '+seat,cards:deck([ROYAL_DECREE])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m337-activate-partner-decree'});
  state.core.turn=3;
  state.core.phase='main';
  const card=takePhysical(state,2,ROYAL_DECREE);
  const royal={...card,faceUp:false,setTurn:0};
  state.core.players[0].backrow.push(royal);
  assert.match(royal.uid,/^m2:/,'the Set Continuous Trap retains inactive physical seat 2 ownership');
  assertRules(state);
  assertPrivateHands(state);
  assertHidden(JSON.stringify(tag.publicTagDuel(state)),royal);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m337-activate-partner-decree';
  const members=ids.map((id,seat)=>({id,name:'M337 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m337-guild','m337-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {record:store.getTag(id),royal,before:inventory(state)};
}

test('active teammate activates partner-owned Royal Decree through the private Discord menu',async()=>{
  const fixture=setupActivation();
  const actions=tag.tagActions(fixture.record.state,member(0));
  const index=actions.findIndex(action=>action.kind==='trap'&&action.card===fixture.royal.uid);
  assert.ok(index>=0,'the active teammate must be offered the partner-owned Set Royal Decree');
  assert.equal(tag.tagActions(fixture.record.state,member(2)).length,0,
    'the inactive physical owner cannot activate the shared Set Trap');
  let current=await submit(fixture.record,member(0),index,'m337-activate-royal-decree');
  assert.equal(current.state.core.phase,'response');
  current=await settleResponses(current,'activate-royal-decree');
  const resolved=current.state.core.players[0].backrow.find(card=>card.uid===fixture.royal.uid);
  assert.ok(resolved?.faceUp&&resolved.resolved,
    'Royal Decree becomes an active continuous source after its Discord response window');
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertConserved(current.state,fixture.before);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
});

test('face-up Royal Decree permits a partner-owned Sakuretsu activation but negates its effect',async()=>{
  const fixture=setupBattle(true,'active-decree');
  let current=fixture.record;
  const attacks=tag.tagActions(current.state,member(1));
  const attackIndex=attacks.findIndex(action=>action.kind==='attack'&&action.card===fixture.attacker.uid&&!action.target);
  assert.ok(attackIndex>=0,'the active attacker must receive a direct attack action');
  current=await submit(current,member(1),attackIndex,'m337-active-decree-direct-attack');
  assert.equal(current.state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(current.state).id,member(2),
    'the active defender is seat 2 although both Traps belong to inactive seat 0');
  assert.equal(tag.tagActions(current.state,member(0)).length,0,
    'the inactive physical Trap owner cannot answer for the active teammate');
  const responses=tag.tagActions(current.state,member(2));
  const sakuretsuIndex=responses.findIndex(action=>
    action.kind==='trap'&&action.card===fixture.sakuretsu.uid&&action.target===fixture.attacker.uid
  );
  assert.ok(sakuretsuIndex>=0,
    'Royal Decree negates Trap effects, not their activation: partner-owned Sakuretsu remains selectable');
  current=await submit(current,member(2),sakuretsuIndex,'m337-activate-sakuretsu-under-decree');
  current=await settleResponses(current,'active-decree-chain');
  assert.equal(current.state.core.phase,'battle');
  assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===fixture.attacker.uid),
    'the attacker survives because Royal Decree negates Sakuretsu Armor');
  assert.ok(current.state.core.players[0].grave.some(card=>card.uid===fixture.sakuretsu.uid),
    'the activated Trap still leaves the field and enters the shared Graveyard');
  assert.ok(current.state.core.players[0].backrow.some(card=>card.uid===fixture.royal.uid&&card.faceUp&&card.resolved),
    'Royal Decree remains face-up and continuously active');
  assert.equal(current.state.core.players[0].lp,4000-ATTACKER.card.atk,
    'the attack continues after the Trap effect is negated');
  assert.equal(current.state.core.players[1].lp,4000);
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
});

test('face-down Royal Decree does not negate partner-owned Sakuretsu Armor',async()=>{
  const fixture=setupBattle(false,'set-decree');
  let current=fixture.record;
  const attacks=tag.tagActions(current.state,member(1));
  const attackIndex=attacks.findIndex(action=>action.kind==='attack'&&action.card===fixture.attacker.uid&&!action.target);
  assert.ok(attackIndex>=0);
  current=await submit(current,member(1),attackIndex,'m337-set-decree-direct-attack');
  assert.equal(current.state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(current.state).id,member(2));
  const responses=tag.tagActions(current.state,member(2));
  const sakuretsuIndex=responses.findIndex(action=>
    action.kind==='trap'&&action.card===fixture.sakuretsu.uid&&action.target===fixture.attacker.uid
  );
  assert.ok(sakuretsuIndex>=0,'the active defender can select the partner-owned Set Sakuretsu');
  current=await submit(current,member(2),sakuretsuIndex,'m337-activate-sakuretsu-with-set-decree');
  current=await settleResponses(current,'set-decree-chain');
  assert.equal(current.state.core.phase,'battle');
  assert.ok(!current.state.core.players[1].monsters.some(card=>card.uid===fixture.attacker.uid),
    'without face-up Royal Decree, Sakuretsu Armor destroys the attacker');
  assert.ok(current.state.core.players[1].grave.some(card=>card.uid===fixture.attacker.uid));
  assert.ok(current.state.core.players[0].grave.some(card=>card.uid===fixture.sakuretsu.uid));
  assert.ok(current.state.core.players[0].backrow.some(card=>card.uid===fixture.royal.uid&&!card.faceUp),
    'the unused Royal Decree remains Set and has no continuous effect');
  assert.equal(current.state.core.players[0].lp,4000,
    'the destroyed attacker deals no direct battle damage');
  assert.equal(current.state.core.players[1].lp,4000);
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
