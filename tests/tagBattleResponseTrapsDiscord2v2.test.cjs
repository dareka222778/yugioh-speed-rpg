'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m327-battle-response-traps-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M327-M329 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');
const {rulesFor}=require('../dist/rulesProfile');

const SAKURETSU='56120475';
const MAGIC_CYLINDER='62279055';
const NEGATE_ATTACK='14315573';
const TRAPS=[
  {id:SAKURETSU,name:'Sakuretsu Armor',slug:'sakuretsu',kind:'sakuretsuArmor'},
  {id:MAGIC_CYLINDER,name:'Magic Cylinder',slug:'magic-cylinder',kind:'attackResponse'},
  {id:NEGATE_ATTACK,name:'Negate Attack',slug:'negate-attack',kind:'attackResponse'}
];
for(const card of TRAPS){
  assert.equal(getPlayableCard(card.id)?.englishName,card.name,card.name+' must be playable');
  assert.equal(getPlayableCard(card.id)?.kind,'trap');
  assert.equal(getCardStatus(card.id)?.stage,'certified');
  assert.equal(getEffect(card.id)?.kind,card.kind);
  const activation=getActivationModel(getEffect(card.id));
  assert.equal(activation?.window,'attackDeclared');
  assert.equal(activation?.opponentOnly,true);
  if(card.id===SAKURETSU)assert.equal(activation?.speed,2);
  if(card.id===MAGIC_CYLINDER){
    assert.equal(activation?.speed,2);
    assert.equal(getEffect(card.id)?.reflectAttack,true);
    assert.equal(getEffect(card.id)?.endBattle,false);
  }
  if(card.id===NEGATE_ATTACK){
    assert.equal(activation?.speed,3);
    assert.equal(getEffect(card.id)?.reflectAttack,false);
    assert.equal(getEffect(card.id)?.endBattle,true);
  }
}
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&entry.card.atk>0&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'four isolated physical Decks need at least twenty certified Normal Monsters');
const sorted=[...NORMALS].sort((a,b)=>b.card.atk-a.card.atk);
const attackerEntry=sorted[0];
const targetEntry=sorted[sorted.length-1];
const attackerAllyEntry=sorted.find(entry=>![attackerEntry.id,targetEntry.id].includes(entry.id));
const defenderAllyEntry=sorted.find(entry=>![attackerEntry.id,targetEntry.id,attackerAllyEntry.id].includes(entry.id));
assert.ok(attackerEntry.card.atk>targetEntry.card.atk,'the unopposed attack must produce positive battle damage');
assert.ok(attackerAllyEntry&&defenderAllyEntry,'the four-seat fixture needs distinct physical monster identities');

function member(seat){return 'm327-seat-'+seat;}
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
  throw new Error('M327-M329 physical card missing from seat '+seat+': '+id);
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
    assert.ok(team.monsters.length<=3,'each team shares three Monster Zones');
    assert.ok(team.backrow.length<=3,'each team shares three Spell/Trap Zones');
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
    'the private Discord menu must expose legal action index '+index);
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
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m327-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'a rejected inactive partner action must not mutate the persisted duel');
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the active physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m327-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(card,first,scenario){
  const ids=[0,1,2,3].map(member);
  const required=[card.id,attackerEntry.id,targetEntry.id,attackerAllyEntry.id,defenderAllyEntry.id];
  const players=ids.map((id,seat)=>({id,name:'M327 Seat '+seat,cards:deck(required)}));
  const state=tag.createTagDuel(players,{classic:true,first,seed:'m327-'+scenario});
  state.core.turn=3;
  const attackerSeat=first;
  const defenderSeat=1-first;
  assert.equal(tag.tagDecisionMember(state).id,member(attackerSeat),
    'the requested physical seat must begin as the active attacker');
  const attackerPartnerSeat=attackerSeat===0?2:3;
  const defenderPartnerSeat=defenderSeat===0?2:3;
  const attacker=deploy(state,attackerSeat,attackerEntry.id);
  const attackerAlly=deploy(state,attackerPartnerSeat,attackerAllyEntry.id,'atk');
  const target=deploy(state,defenderSeat,targetEntry.id,'atk');
  const defenderAlly=deploy(state,defenderPartnerSeat,defenderAllyEntry.id,'def');
  const trapCard=takePhysical(state,2,card.id);
  const trap={...trapCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(trap);
  const before=inventory(state);
  assert.match(attacker.uid,new RegExp('^m'+attackerSeat+':'));
  assert.match(target.uid,new RegExp('^m'+defenderSeat+':'));
  assert.match(trap.uid,/^m2:/,'the set Trap retains inactive physical seat 2 ownership');
  assertRules(state);
  assertPrivateHands(state);
  assert.ok(!JSON.stringify(tag.publicTagDuel(state)).includes(card.id),
    'the Set Trap identity must remain private in the public duel state');
  assert.ok(!JSON.stringify(tag.publicTagDuel(state)).includes(trap.uid),
    'the Set Trap UID must remain private in the public duel state');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m327-'+scenario,guild='m327-guild',channel='m327-channel';
  const members=ids.map((id,seat)=>({id,name:'M327 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,card,attackerSeat,defenderSeat,attacker,target,attackerAlly,defenderAlly,trap,before,record:store.getTag(id)};
}
async function enterBattle(fixture){
  const actions=tag.tagActions(fixture.record.state,member(fixture.attackerSeat));
  const index=actions.findIndex(action=>action.kind==='battle');
  assert.ok(index>=0,'the active attacker must receive the Battle Phase action');
  const current=await submit(fixture.record,member(fixture.attackerSeat),index,fixture.id+'-battle');
  return settleResponses(current,fixture.id+'-battle-window');
}
async function declareAttack(fixture,record){
  const actions=tag.tagActions(record.state,member(fixture.attackerSeat));
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.attacker.uid&&action.target===fixture.target.uid
  );
  assert.ok(index>=0,'the active attacker must see the target in the private Discord menu');
  return submit(record,member(fixture.attackerSeat),index,fixture.id+'-attack');
}
function assertFinalState(fixture,record,mode){
  const state=record.state;
  const attackingTeam=state.core.players[fixture.attackerSeat%2];
  const defendingTeam=state.core.players[fixture.defenderSeat%2];
  assert.ok(defendingTeam.monsters.some(card=>card.uid===fixture.target.uid),
    'the declared target survives all three attack-response Traps');
  assert.ok(attackingTeam.monsters.some(card=>card.uid===fixture.attackerAlly.uid),
    'the attacking teammate monster remains on the shared field');
  assert.ok(defendingTeam.monsters.some(card=>card.uid===fixture.defenderAlly.uid),
    'the defending teammate monster remains on the shared field');
  assert.ok(defendingTeam.grave.some(card=>card.uid===fixture.trap.uid),
    'the activated partner-owned Trap enters the defending team Graveyard');
  if(mode==='sakuretsu'){
    assert.ok(attackingTeam.grave.some(card=>card.uid===fixture.attacker.uid),
      'Sakuretsu destroys the exact attacking instance before damage calculation');
    assert.ok(!attackingTeam.monsters.some(card=>card.uid===fixture.attacker.uid));
    assert.equal(attackingTeam.lp,4000);
    assert.equal(defendingTeam.lp,4000);
  }else if(mode==='magic-cylinder'){
    assert.ok(attackingTeam.monsters.some(card=>card.uid===fixture.attacker.uid),
      'Magic Cylinder negates the attack without destroying the attacker');
    assert.equal(attackingTeam.lp,4000-attackerEntry.card.atk,
      'Magic Cylinder reflects exactly the attacking monster current ATK to its team');
    assert.equal(defendingTeam.lp,4000,'the defending team receives no battle damage');
  }else{
    assert.ok(attackingTeam.monsters.some(card=>card.uid===fixture.attacker.uid),
      'Negate Attack leaves the attacking monster on the field');
    assert.equal(attackingTeam.lp,4000);
    assert.equal(defendingTeam.lp,4000);
    assert.notEqual(state.core.phase,'battle','Negate Attack ends the Battle Phase');
  }
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
async function runPositive(card,mode){
  const fixture=setup(card,1,card.slug+'-partner-owned');
  let current=await enterBattle(fixture);
  current=await declareAttack(fixture,current);
  assert.equal(current.state.core.phase,'response','the attack must open a real Trap response window');
  assert.equal(tag.tagDecisionMember(current.state).id,member(fixture.defenderSeat),
    'the active physical defender controls the response');
  const actions=tag.tagActions(current.state,member(fixture.defenderSeat));
  const index=actions.findIndex(action=>
    action.kind==='trap'&&action.card===fixture.trap.uid&&action.target===fixture.attacker.uid
  );
  assert.ok(index>=0,card.name+' must appear as a legal response in the active defender private menu');
  await rejectInactivePartner(current,member(fixture.defenderSeat),member(2),index,card.slug);
  current=await submit(current,member(fixture.defenderSeat),index,fixture.id+'-activate-'+card.slug);
  current=await settleResponses(current,card.slug+'-resolve');
  assertFinalState(fixture,current,mode);
}
async function runNegative(card){
  const fixture=setup(card,0,card.slug+'-own-team-attack');
  let current=await enterBattle(fixture);
  current=await declareAttack(fixture,current);
  assert.equal(current.state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(current.state).id,member(fixture.defenderSeat));
  const actions=tag.tagActions(current.state,member(fixture.defenderSeat));
  assert.ok(!actions.some(action=>action.kind==='trap'&&action.card===fixture.trap.uid),
    card.name+' cannot be activated by the team whose own monster declared the attack');
  current=await settleResponses(current,card.slug+'-negative-window');
  const state=current.state;
  const attackingTeam=state.core.players[0];
  const defendingTeam=state.core.players[1];
  assert.ok(attackingTeam.monsters.some(monster=>monster.uid===fixture.attacker.uid));
  assert.ok(attackingTeam.monsters.some(monster=>monster.uid===fixture.attackerAlly.uid));
  assert.ok(attackingTeam.backrow.some(backrow=>backrow.uid===fixture.trap.uid&&!backrow.faceUp),
    'the unused partner-owned Set Trap remains hidden on the attacker's team');
  assert.ok(defendingTeam.grave.some(card=>card.uid===fixture.target.uid),
    'without a legal response the declared attack resolves normally');
  assert.ok(defendingTeam.monsters.some(monster=>monster.uid===fixture.defenderAlly.uid));
  assert.equal(attackingTeam.lp,4000);
  assert.equal(defendingTeam.lp,4000-(attackerEntry.card.atk-targetEntry.card.atk));
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
for(const card of TRAPS){
  const mode=card.id===SAKURETSU?'sakuretsu':card.id===MAGIC_CYLINDER?'magic-cylinder':'negate-attack';
  test(card.name+': active defender activates partner-owned Set Trap through Discord 2v2',()=>runPositive(card,mode));
  test(card.name+': opponent-only policy rejects a Set Trap on the attacking team',()=>runNegative(card));
}
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
