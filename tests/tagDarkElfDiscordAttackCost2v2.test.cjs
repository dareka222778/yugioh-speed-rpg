'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m341-dark-elf-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const DARK_ELF='21417692';
const CELTIC_GUARDIAN='91152256';
const BLUE_EYES='89631139';
const DARK_MAGICIAN='46986414';
const MYSTICAL_ELF='15025844';
const FIXED=[DARK_ELF,CELTIC_GUARDIAN,BLUE_EYES,DARK_MAGICIAN,MYSTICAL_ELF];
const FILLERS=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!FIXED.includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense))
  .slice(0,15)
  .map(entry=>entry.id);
const POOL=[...FIXED,...FILLERS];
assert.equal(POOL.length,20,'M341 requires four legal 20-card physical Decks');
assert.equal(new Set(POOL).size,20,'M341 physical Decks must not duplicate card identities');

assert.equal(getPlayableCard(DARK_ELF)?.englishName,'Dark Elf');
assert.equal(getPlayableCard(DARK_ELF)?.atk,2000);
assert.equal(getCardStatus(DARK_ELF)?.stage,'certified');
assert.equal(getEffect(DARK_ELF)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(DARK_ELF),{
  trigger:'continuous',
  operation:{kind:'continuous',rules:[{
    kind:'combat',filter:{selfOnly:true},rule:{kind:'attackLP',amount:1000}
  }]}
});
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);

function member(seat){return 'm341-seat-'+seat;}
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
  throw new Error('M341 physical card missing from seat '+seat+': '+id);
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
    assert.ok((team.extra??[]).length<=5);
  }
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute 80 cards');
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
function assertPublic(record,expectedLP){
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const embed=payload.embeds[0].toJSON();
  assert.ok((embed.fields??[]).some(field=>field.name.includes(expectedLP+' PV')),
    'the public Discord panel must render the shared team LP total '+expectedLP);
  for(const card of tag.tagInventory(record.state)){
    assert.ok(!JSON.stringify(payload).includes(card.uid),'public payload leaked physical UID '+card.uid);
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
  assert.ok(menu,'the active representative must receive a private Discord action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private menu must expose the legal action index '+index);
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
    const pass=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the active physical responder must receive a legal Pass action');
    current=await submit(current,actor,pass,'m341-'+suffix+'-pass-'+guard);
  }
  return current;
}
function register(state,id){
  const ids=[0,1,2,3].map(member);
  const members=ids.map((id,seat)=>({id,name:'M341 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m341-guild','m341-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(lp,scenario){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M341 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m341-dark-elf-'+scenario});
  state.core.turn=3;
  state.core.players[0].lp=lp;
  state.core.players[1].lp=4000;
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  const source=deploy(state,2,DARK_ELF);
  const target=deploy(state,3,CELTIC_GUARDIAN);
  assert.match(source.uid,/^m2:/,'Dark Elf must retain inactive partner physical ownership');
  assert.match(target.uid,/^m3:/,'the opposing target must retain physical seat 3 ownership');
  assert.equal(source.owner,0);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const id='m341-'+scenario;
  const record=register(state,id);
  assertPublic(record,lp);
  return {id,source,target,before,record};
}
async function enterBattle(record,actor,suffix){
  const battle=tag.tagActions(record.state,actor).findIndex(action=>action.kind==='battle');
  assert.ok(battle>=0,'the active representative must receive the Battle Phase action');
  record=await submit(record,actor,battle,'m341-'+suffix+'-battle');
  return settleResponses(record,suffix+'-battle');
}
async function rejectInactivePartner(record,actor,partner,index,suffix){
  assert.deepEqual(tag.tagActions(record.state,partner),[],
    'the inactive physical partner cannot submit the shared-field attack');
  const forged=interaction(record,partner,index,'m341-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}

test('active teammate pays Dark Elf 1000 LP before resolving an attack with the partner-owned monster',async()=>{
  const fixture=setup(2500,'sufficient-lp');
  let record=await enterBattle(fixture.record,member(0),fixture.id);
  const actions=tag.tagActions(record.state,member(0));
  const attack=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.source.uid&&action.target===fixture.target.uid
  );
  assert.ok(attack>=0,'the active representative must receive the partner-owned Dark Elf attack action');
  await rejectInactivePartner(record,member(0),member(2),attack,fixture.id);

  const beforeOppLP=record.state.core.players[1].lp;
  record=await submit(record,member(0),attack,fixture.id+'-attack');
  assert.equal(record.state.core.players[0].lp,1500,
    'the 1000 LP Dark Elf cost is paid by the shared team at declaration, before responses');
  assert.equal(record.state.core.players[1].lp,beforeOppLP);
  record=await settleResponses(record,fixture.id+'-resolve');
  assert.equal(record.state.core.players[0].lp,1500);
  assert.equal(record.state.core.players[1].lp,beforeOppLP-600,
    '2000 ATK versus Celtic Guardian 1400 ATK causes 600 battle damage');
  assert.ok(record.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid));
  assert.ok(record.state.core.players[1].grave.some(card=>card.uid===fixture.target.uid));
  assertConserved(record.state,fixture.before);
  assertPrivateHands(record.state);
  assertRules(record.state);
  assertPublic(record,1500);
  assert.doesNotThrow(()=>tag.assertTagDuel(record.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(record.state))));
});

test('Dark Elf is absent from the Discord attack menu when the shared team has exactly 1000 LP',async()=>{
  const fixture=setup(1000,'exact-cost');
  const record=await enterBattle(fixture.record,member(0),fixture.id);
  const attacks=tag.tagActions(record.state,member(0)).filter(action=>
    action.kind==='attack'&&action.card===fixture.source.uid
  );
  assert.deepEqual(attacks,[],
    'the team must have more LP than the 1000 LP attack cost; exactly 1000 is insufficient');
  assert.deepEqual(tag.tagActions(record.state,member(2)),[]);
  assert.equal(record.state.core.players[0].lp,1000,'no LP is paid when no legal attack is offered');
  assert.ok(record.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid));
  assert.ok(record.state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  assertConserved(record.state,fixture.before);
  assertPrivateHands(record.state);
  assertRules(record.state);
  assertPublic(record,1000);
  assert.doesNotThrow(()=>tag.assertTagDuel(record.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(record.state))));
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
