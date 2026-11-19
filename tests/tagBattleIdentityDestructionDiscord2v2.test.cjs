'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m283-battle-identity-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M283 test diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const RYU_KOKKI='57281778';
const GETSU_FUHMA='21887179';
const KARAKURI_SPIDER='45688586';
const DARK_MAGICIAN='46986414';
const SUMMONED_SKULL='70781052';
const CELTIC_GUARDIAN='91152256';
const CORE=[RYU_KOKKI,GETSU_FUHMA,KARAKURI_SPIDER,DARK_MAGICIAN,SUMMONED_SKULL,CELTIC_GUARDIAN];

test('M283 certified identity-destruction definitions and card filters',()=>{
  assert.deepEqual(getMonsterEffect(RYU_KOKKI)?.operation,{
    kind:'battleDestroyByIdentity',races:['Warrior','Spellcaster']
  });
  assert.deepEqual(getMonsterEffect(GETSU_FUHMA)?.operation,{
    kind:'battleDestroyByIdentity',races:['Fiend','Zombie']
  });
  assert.deepEqual(getMonsterEffect(KARAKURI_SPIDER)?.operation,{
    kind:'battleDestroyByIdentity',attributes:['DARK'],attackingOnly:true
  });
  for(const id of [RYU_KOKKI,GETSU_FUHMA,KARAKURI_SPIDER]){
    assert.equal(getCardStatus(id)?.stage,'certified');
    assert.equal(getEffect(id)?.kind,'monsterEffect');
    assert.equal(getMonsterEffect(id)?.trigger,'continuous');
  }
  assert.equal(getPlayableCard(RYU_KOKKI)?.atk,2400);
  assert.equal(getPlayableCard(GETSU_FUHMA)?.atk,1700);
  assert.equal(getPlayableCard(KARAKURI_SPIDER)?.atk,400);
  assert.equal(getPlayableCard(DARK_MAGICIAN)?.race,'Spellcaster');
  assert.equal(getPlayableCard(DARK_MAGICIAN)?.atk,2500);
  assert.equal(getPlayableCard(SUMMONED_SKULL)?.race,'Fiend');
  assert.equal(getPlayableCard(SUMMONED_SKULL)?.atk,2500);
  assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.attribute,'EARTH');
  assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.atk,1400);
});

const fillerIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>!CORE.includes(id))
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense))
  .slice(0,14).map(entry=>entry.id);
const POOL=[...CORE,...fillerIds];
assert.equal(POOL.length,20,'each physical participant must receive a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'each physical Deck must use distinct identities');

const CASES=[
  {source:RYU_KOKKI,target:DARK_MAGICIAN,match:true,name:'Ryu Kokki destroys a Spellcaster even when battle destroys the source'},
  {source:RYU_KOKKI,target:SUMMONED_SKULL,match:false,name:'Ryu Kokki leaves a Fiend outside its Warrior/Spellcaster filter'},
  {source:GETSU_FUHMA,target:SUMMONED_SKULL,match:true,name:'Getsu Fuhma destroys a Fiend even when battle destroys the source'},
  {source:GETSU_FUHMA,target:DARK_MAGICIAN,match:false,name:'Getsu Fuhma leaves a Spellcaster outside its Fiend/Zombie filter'},
  {source:KARAKURI_SPIDER,target:SUMMONED_SKULL,match:true,name:'Karakuri Spider destroys a DARK monster when it attacks'},
  {source:KARAKURI_SPIDER,target:CELTIC_GUARDIAN,match:false,name:'Karakuri Spider leaves an EARTH monster outside its DARK filter'}
];

function member(seat){return 'm283-seat-'+seat;}
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
  throw new Error('M283 physical card missing from seat '+seat+': '+id);
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
    current=await submit(current,actor,pass,'m283-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario,sourceId,targetId){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M283 Seat '+seat,cards:deck()}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m283-'+scenario});
  state.core.turn=3;
  const actor=ids[0];
  assert.equal(tag.tagDecisionMember(state).id,actor);
  assert.equal(tag.tagActions(state,member(2)).length,0,
    'the inactive physical partner must not receive active actions');
  const source=deploy(state,2,sourceId);
  const target=deploy(state,3,targetId);
  const before=inventory(state);
  assert.match(source.uid,/^m2:/);
  assert.match(target.uid,/^m3:/);
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const id='m283-'+scenario,guild='m283-guild',channel='m283-channel';
  const members=ids.map((id,seat)=>({id,name:'M283 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {id,actor,before,source,target,record:store.getTag(id)};
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
  const current=await submit(fixture.record,fixture.actor,index,'m283-'+fixture.id+'-battle');
  return settleResponses(current,fixture.id+'-battle');
}
async function attack(fixture,record,suffix){
  const actions=tag.tagActions(record.state,fixture.actor);
  const index=actions.findIndex(action=>
    action.kind==='attack'&&action.card===fixture.source.uid&&action.target===fixture.target.uid
  );
  assert.ok(index>=0,'the active teammate must receive the partner-owned attacker action');
  const current=await submit(record,fixture.actor,index,'m283-'+suffix+'-attack');
  return settleResponses(current,suffix+'-resolve');
}
async function playBattle(fixture,suffix){
  const inBattle=await enterBattle(fixture);
  return attack(fixture,inBattle,suffix);
}

for(const scenario of CASES){
  test(scenario.name+' resolves through the real offline Discord 2v2 handler',async()=>{
    const fixture=setup(scenario.name.replace(/[^a-z0-9]+/gi,'-'),scenario.source,scenario.target);
    const ownBefore=fixture.record.state.core.players[0].lp;
    const opposingBefore=fixture.record.state.core.players[1].lp;
    const sourceCard=getPlayableCard(scenario.source);
    const targetCard=getPlayableCard(scenario.target);
    const expectedBattleDamage=Math.max(0,targetCard.atk-sourceCard.atk);
    const current=await playBattle(fixture,scenario.source+'-'+scenario.target);
    assert.equal(current.state.core.players[0].lp,ownBefore-expectedBattleDamage,
      'only ordinary battle damage is applied to the attacking shared team');
    assert.equal(current.state.core.players[1].lp,opposingBefore,
      'the defending shared team does not receive battle damage');
    assert.ok(current.state.core.players[0].grave.some(card=>card.uid===fixture.source.uid&&card.id===scenario.source),
      'the losing source enters its own shared Graveyard with the physical UID');
    if(scenario.match){
      assert.ok(current.state.core.players[1].grave.some(card=>card.uid===fixture.target.uid&&card.id===scenario.target),
        'the identity-matched target is destroyed into its own shared Graveyard');
      assert.ok(!current.state.core.players.some(team=>team.monsters.some(card=>card.uid===fixture.target.uid)));
    }else{
      assert.ok(current.state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid&&card.id===scenario.target),
        'a non-matching identity survives after the source loses battle');
      assert.ok(!current.state.core.players[1].grave.some(card=>card.uid===fixture.target.uid));
    }
    assertFinal(fixture,current.state);
  });
}

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
