'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m365-guard-bounce-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getCardStatus,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const GUARD='37101832';
const CELTIC_GUARDIAN='91152256';
const BLUE_EYES='89631139';
const guard=getPlayableCard(GUARD);
assert.equal(guard?.englishName,"Gravekeeper's Guard");
assert.equal(getCardStatus(GUARD)?.stage,'certified');
assert.equal(getEffect(GUARD)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(GUARD),{
  trigger:'flip',
  operation:{kind:'bounce',target:'opponentMonster'}
});
assert.equal(getPlayableCard(CELTIC_GUARDIAN)?.englishName,'Celtic Guardian');
assert.equal(getPlayableCard(BLUE_EYES)?.englishName,'Blue-Eyes White Dragon');

const SAFE_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&Number.isInteger(card.defense)&&card.level<=4;
});
assert.ok(SAFE_NORMALS.length>=20,'four physical Decks require twenty distinct certified Normal Monsters');

function member(seat){return 'm365-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...SAFE_NORMALS])];
  assert.ok(ids.length>=20,'each physical Main Deck must contain at least twenty distinct cards');
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
  throw new Error('M365 physical card missing from seat '+seat+': '+id);
}
function placeFaceDown(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'def',faceUp:false,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,setTurn:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra??[]).length<=5);
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical twenty-card Decks must contribute exactly eighty cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'the Flip bounce must conserve all physical cards');
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
  assert.ok(menu,'the active representative must receive the private Discord action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private Discord menu must expose legal action index '+index);
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1,'the committed action must refresh the public Discord panel');
  return store.getTag(record.id);
}
async function settleResponses(record,suffix){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the Discord response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const pass=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal Pass action');
    current=await submit(current,actor,pass,'m365-'+suffix+'-pass-'+guard);
  }
  return current;
}
function register(state,key){
  const id='m365-'+key+'-'+Date.now();
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M365 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m365-guild','m365-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(key,{includeOpponent=true}={}){
  const required=[[],[],[],[]];
  required[0].push(GUARD);
  if(includeOpponent)required[1].push(CELTIC_GUARDIAN);
  required[2].push(BLUE_EYES);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M365 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:2,seed:'m365-'+key});
  state.core.turn=3;
  assert.deepEqual(state.active,[2,3],'seats 2 and 3 must be the active team representatives');
  const source=placeFaceDown(state,0,GUARD);
  const ally=deploy(state,2,BLUE_EYES);
  const target=includeOpponent?deploy(state,1,CELTIC_GUARDIAN):null;
  assert.match(source.uid,/^m0:/,'the Flip source must remain physically owned by inactive allied seat 0');
  assert.match(ally.uid,/^m2:/,'the allied control monster must retain active seat 2 ownership');
  if(target)assert.match(target.uid,/^m1:/,'the opposing target must remain physically owned by inactive seat 1');
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const record=register(state,key);
  assertPublicPayload(record);
  return {key,source,ally,target,before,record};
}
async function flipGuard(fixture){
  const actor=member(2);
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='position'&&action.card===fixture.source.uid&&action.mode==='flip'
  );
  assert.ok(index>=0,'the active representative must receive the partner-owned Flip Summon action');
  const partnerPanel=tagPrivateMessage(fixture.record,member(0));
  validateDiscordPayload(partnerPanel);
  const partnerRows=partnerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  assert.ok(!partnerRows.some(row=>row.custom_id?.startsWith('tag:act:')),
    'the inactive physical owner must not receive the active representative action menu');
  const forged=interaction(fixture.record,member(0),index,'m365-'+fixture.key+'-forged',actor);
  const unchanged=JSON.stringify(fixture.record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'inactive partner actions must be rejected before acknowledgement');
  assert.equal(store.getTag(fixture.record.id).revision,fixture.record.revision);
  assert.equal(JSON.stringify(store.getTag(fixture.record.id).state),unchanged);
  return submit(fixture.record,actor,index,'m365-'+fixture.key+'-flip');
}
function assertStable(fixture,record){
  assertConserved(record.state,fixture.before);
  assertPrivateHands(record.state);
  assertRules(record.state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(record.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(record.state))));
}

test("Gravekeeper's Guard cannot target an allied monster when no opposing monster exists",async()=>{
  const fixture=setup('no-opponent', {includeOpponent:false});
  let current=await flipGuard(fixture);
  current=await settleResponses(current,'no-opponent');
  assert.equal(current.state.core.phase,'main','the mandatory Flip effect with no opposing target must finish without opening a choice');
  assert.equal(current.state.core.choice,undefined,'no target-selection UI may be opened without an opposing monster');
  assert.deepEqual(current.state.active,[2,3],'resolving the no-target Flip must not rotate physical representatives');
  assert.equal(current.state.core.current,0,'the team turn must remain unchanged');
  assert.equal(current.state.core.turn,3,'the turn number must remain unchanged');
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.ally.uid),
    'an allied monster must remain on the shared field');
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.faceUp),
    'the Guard still completes its Flip Summon');
  assert.ok(tag.tagMemberHand(current.state,member(2)).every(card=>card.uid!==fixture.ally.uid),
    'no allied card may be moved to a hand');
  assertStable(fixture,current);
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
