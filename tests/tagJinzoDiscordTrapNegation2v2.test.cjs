'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m287-jinzo-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M287 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const JINZO='77585513';
const SAKURETSU_ARMOR='56120475';
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense));
const attackerEntry=NORMALS.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const targetEntry=NORMALS.filter(entry=>entry.id!==attackerEntry.id)
  .reduce((best,current)=>current.card.atk<best.card.atk?current:best);
const FILLERS=NORMALS.map(entry=>entry.id).filter(id=>![attackerEntry.id,targetEntry.id].includes(id));
assert.ok(FILLERS.length>=20,'four isolated Decks need twenty certified Normal Monster fillers');
assert.ok(attackerEntry.card.atk>targetEntry.card.atk,'the attack must produce positive battle damage if unopposed');
assert.equal(getPlayableCard(JINZO)?.englishName,'Jinzo');
assert.equal(getCardStatus(JINZO)?.stage,'certified');
assert.equal(getEffect(JINZO)?.kind,'monsterEffect');
assert.equal(getMonsterEffect(JINZO)?.trigger,'continuous');
assert.equal(getMonsterEffect(JINZO)?.operation.kind,'negateTraps');
assert.equal(getPlayableCard(SAKURETSU_ARMOR)?.kind,'trap');
assert.equal(getEffect(SAKURETSU_ARMOR)?.kind,'sakuretsuArmor');

function member(seat){return 'm287-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...FILLERS])];
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
  throw new Error('M287 physical card missing from seat '+seat+': '+id);
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
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique');
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
  assert.ok(menu,'the active physical responder must receive a real private Discord menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private Discord menu must expose the legal response index '+index);
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
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m287-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'the inactive physical Trap owner must be rejected before acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the Trap response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m287-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario,jinzoFaceUp){
  const required=[JINZO,SAKURETSU_ARMOR,attackerEntry.id,targetEntry.id];
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M287 Seat '+seat,cards:deck(required)}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m287-'+scenario});
  state.core.turn=3;
  const actor=ids[0];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  const jinzoCard=takePhysical(state,2,JINZO);
  const jinzo={...jinzoCard,owner:0,position:jinzoFaceUp?'atk':'def',faceUp:jinzoFaceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,setTurn:0};
  state.core.players[0].monsters.push(jinzo);
  const attacker=deploy(state,0,attackerEntry.id);
  const target=deploy(state,1,targetEntry.id);
  const trapCard=takePhysical(state,3,SAKURETSU_ARMOR);
  const trap={...trapCard,setTurn:0,faceUp:false};
  state.core.players[1].backrow.push(trap);
  const before=inventory(state);
  assert.match(jinzo.uid,/^m2:/,'Jinzo retains inactive physical seat 2 ownership');
  assert.match(attacker.uid,/^m0:/);
  assert.match(target.uid,/^m1:/);
  assert.match(trap.uid,/^m3:/,'the set Trap retains inactive physical seat 3 ownership');
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m287-'+scenario,guild='m287-guild',channel='m287-channel';
  const members=ids.map((id,seat)=>({id,name:'M287 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor,jinzo,attacker,target,trap,before,record:store.getTag(id),jinzoFaceUp};
}
async function enterBattle(fixture){
  const actions=tag.tagActions(fixture.record.state,fixture.actor);
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0);
  const current=await submit(fixture.record,fixture.actor,index,fixture.id+'-battle');
  return settleResponses(current,fixture.id+'-battle');
}
async function declareAttack(fixture,record){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.target.uid
  );
  assert.ok(index>=0,'the active physical attacker must see the target in the Discord action menu');
  return submit(record,fixture.actor,index,fixture.id+'-attack');
}
function assertFinal(fixture,record,trapActivated){
  const state=record.state;
  assert.equal(state.core.players[0].lp,4000);
  if(trapActivated){
    assert.equal(state.core.players[1].lp,4000,'Sakuretsu Armor resolves before battle damage');
    assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.attacker.uid),
      'the Trap destroys the attacking monster before damage calculation');
    assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.trap.uid),
      'the activated Trap enters the defending team shared Graveyard');
    assert.ok(state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid),
      'the defending target remains on the field');
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.jinzo.uid&&card.faceUp===false),
      'the face-down Jinzo remains on the shared field without applying its continuous effect');
  }else{
    assert.equal(state.core.players[1].lp,4000-(attackerEntry.card.atk-targetEntry.card.atk),
      'without a Trap response, ordinary battle damage reaches the defending shared LP');
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.attacker.uid));
    assert.ok(state.core.players[1].grave.some(card=>card.uid===fixture.target.uid),
      'the unopposed battle destroys the target normally');
    assert.ok(state.core.players[1].backrow.some(card=>card.uid===fixture.trap.uid&&!card.faceUp),
      'face-up Jinzo keeps the Trap set and unused');
    assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.jinzo.uid&&card.faceUp===true),
      'Jinzo remains face-up and continuously negates Trap activations');
  }
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
test('face-up Jinzo removes the opponent Trap action from the real Discord response menu',async()=>{
  const fixture=setup('jinzo-face-up',true);
  let current=await enterBattle(fixture);
  current=await declareAttack(fixture,current);
  if(current.state.core.phase==='response'){
    const actor=tag.tagDecisionMember(current.state).id;
    assert.equal(actor,member(1),'the active physical defender receives response priority');
    const actions=tag.tagActions(current.state,actor);
    assert.ok(!actions.some(action=>action.kind==='trap'&&action.card===fixture.trap.uid),
      'Jinzo suppresses the set Trap action for the opposing team');
    const panel=tagPrivateMessage(current,actor);
    validateDiscordPayload(panel);
    const components=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
    const menu=components.find(component=>component.custom_id==='tag:act:'+current.id+':'+current.revision+':'+actor);
    if(menu)assert.ok(!menu.options.some(option=>option.value===String(actions.findIndex(action=>action.kind==='trap'&&action.card===fixture.trap.uid))));
  }
  current=await settleResponses(current,'jinzo-face-up');
  assertFinal(fixture,current,false);
});
test('face-down Jinzo no longer negates Trap activation; active defender uses Sakuretsu through Discord',async()=>{
  const fixture=setup('jinzo-face-down',false);
  let current=await enterBattle(fixture);
  current=await declareAttack(fixture,current);
  assert.equal(current.state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(current.state).id,member(1));
  const actions=tag.tagActions(current.state,member(1));
  const index=actions.findIndex(action=>
    action.kind==='trap'&&action.card===fixture.trap.uid&&action.target===fixture.attacker.uid
  );
  assert.ok(index>=0,'the private Discord menu must expose Sakuretsu Armor while Jinzo is face-down');
  await rejectInactivePartner(current,member(1),member(3),index,'jinzo-face-down');
  current=await submit(current,member(1),index,'m287-jinzo-face-down-activate');
  current=await settleResponses(current,'jinzo-face-down-resolve');
  assertFinal(fixture,current,true);
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
