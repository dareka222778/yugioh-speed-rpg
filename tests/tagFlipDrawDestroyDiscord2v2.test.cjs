'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m347-flip-effects-'));
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

const SKELENGEL='60694662';
const MAN_EATER_BUG='54652250';
const SAFE_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&Number.isInteger(card.defense)&&card.level<=4;
});
assert.ok(SAFE_NORMALS.length>=20,'four physical Decks require twenty distinct certified Normal Monsters');
assert.equal(getPlayableCard(SKELENGEL)?.englishName,'Skelengel');
assert.equal(getCardStatus(SKELENGEL)?.stage,'certified');
assert.equal(getEffect(SKELENGEL)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(SKELENGEL),{
  trigger:'flip',
  operation:{kind:'draw',count:1}
});
assert.equal(getPlayableCard(MAN_EATER_BUG)?.englishName,'Man-Eater Bug');
assert.equal(getCardStatus(MAN_EATER_BUG)?.stage,'certified');
assert.equal(getEffect(MAN_EATER_BUG)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(MAN_EATER_BUG),{
  trigger:'flip',
  operation:{kind:'destroy',target:'anyMonster'}
});

const NORMALS=SAFE_NORMALS.map(id=>({id,card:getPlayableCard(id)}));
const DRAW_ID=NORMALS[0].id;
const ALLY=NORMALS.find(entry=>entry.id!==DRAW_ID);
const TARGET=NORMALS.find(entry=>entry.id!==DRAW_ID&&entry.id!==ALLY.id);
assert.ok(ALLY&&TARGET,'Man-Eater Bug needs distinct allied and opposing Normal Monster identities');

function member(seat){return 'm347-seat-'+seat;}
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
  throw new Error('M347 physical card missing from seat '+seat+': '+id);
}
function ensureDeckTop(state,seat,id){
  const physical=holder(state,seat);
  let index=physical.hand.findIndex(card=>card.id===id);
  if(index>=0){
    const [card]=physical.hand.splice(index,1);
    physical.deck.unshift(card);
    return card;
  }
  index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'physical Deck must contain '+id+' for seat '+seat);
  const [card]=physical.deck.splice(index,1);
  physical.deck.unshift(card);
  return card;
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
    assert.ok((team.extra??[]).length<=5,'Extra Deck remains capped at five');
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
  assert.equal(cards.length,before.size,'flip resolution must conserve every physical card');
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
  assert.ok(menu,'the active physical representative must receive the private Discord action menu');
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
    current=await submit(current,actor,pass,'m347-'+suffix+'-pass-'+guard);
  }
  return current;
}
function register(state,key){
  const id='m347-'+key+'-'+Date.now();
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M347 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m347-guild','m347-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(key,sourceId,{targetId,allyId,drawId}={}){
  const required=[[],[],[],[]];
  required[0].push(sourceId);
  if(targetId)required[1].push(targetId);
  if(allyId)required[2].push(allyId);
  if(drawId)required[2].push(drawId);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M347 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:2,seed:'m347-'+key});
  state.core.turn=3;
  assert.deepEqual(state.active,[2,3],'seats 2 and 3 must be the active team representatives');
  const source=placeFaceDown(state,0,sourceId);
  const ally=allyId?deploy(state,2,allyId):null;
  const target=targetId?deploy(state,1,targetId):null;
  const drawRef=drawId?ensureDeckTop(state,2,drawId):null;
  assert.match(source.uid,/^m0:/,'the flip source must remain physically owned by inactive partner seat 0');
  if(ally)assert.match(ally.uid,/^m2:/);
  if(target)assert.match(target.uid,/^m1:/);
  if(drawRef)assert.match(drawRef.uid,/^m2:/,'the deterministic draw must come from active representative seat 2');
  assert.equal(tag.tagDecisionMember(state).id,member(2));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const record=register(state,key);
  assertPublicPayload(record);
  return {key,source,ally,target,drawRef,before,record};
}
async function flipSource(fixture,record){
  const actor=member(2);
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='position'&&action.card===fixture.source.uid&&action.mode==='flip'
  );
  assert.ok(index>=0,'the active representative must receive the partner-owned Flip Summon action');
  const panel=tagPrivateMessage(record,member(0));
  validateDiscordPayload(panel);
  const partnerRows=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  assert.ok(!partnerRows.some(row=>row.custom_id?.startsWith('tag:act:')),
    'the inactive physical owner must not receive the active representative action menu');
  const forged=interaction(record,member(0),index,'m347-'+fixture.key+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'inactive partner actions must be rejected before Discord acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
  return submit(record,actor,index,'m347-'+fixture.key+'-flip');
}

test('Skelengel draws from the active physical representative Deck when the partner-owned Flip effect resolves in Discord 2v2',async()=>{
  const fixture=setup('skelengel',SKELENGEL,{drawId:DRAW_ID});
  const activeDeckBefore=holder(fixture.record.state,2).deck.length;
  const partnerDeckBefore=holder(fixture.record.state,0).deck.map(card=>card.uid);
  let current=await flipSource(fixture,fixture.record);
  current=await settleResponses(current,'skelengel');
  assert.equal(current.state.core.phase,'main','mandatory Skelengel draw resolves before the Main Phase resumes');
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.faceUp),
    'the partner-owned Skelengel remains face-up on the shared team field');
  assert.ok(tag.tagMemberHand(current.state,member(2)).some(card=>card.uid===fixture.drawRef.uid&&card.id===DRAW_ID),
    'the active representative receives the top card of their own physical Deck');
  assert.ok(!tag.tagMemberHand(current.state,member(0)).some(card=>card.uid===fixture.drawRef.uid),
    'the inactive partner must not receive a card drawn by the active representative');
  assert.equal(holder(current.state,2).deck.length,activeDeckBefore-1);
  assert.deepEqual(holder(current.state,0).deck.map(card=>card.uid),partnerDeckBefore,
    'the inactive partner physical Deck must remain unchanged');
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});

test('Man-Eater Bug exposes both teams shared field targets and destroys the selected opposing physical card through Discord 2v2',async()=>{
  const fixture=setup('man-eater-bug',MAN_EATER_BUG,{targetId:TARGET.id,allyId:ALLY.id});
  let current=await flipSource(fixture,fixture.record);
  current=await settleResponses(current,'man-eater-flip');
  assert.equal(current.state.core.phase,'choice');
  assert.equal(current.state.core.choice.source,'monsterTarget');
  assert.equal(tag.tagDecisionMember(current.state).id,member(2),
    'the active representative of the source team must receive the mandatory FLIP target choice');
  const actor=member(2);
  const actions=tag.tagActions(current.state,actor);
  const targetIndex=actions.findIndex(action=>action.kind==='choose'&&action.target===fixture.target.uid);
  assert.ok(targetIndex>=0,'the opponent monster owned by inactive seat 1 must be a legal target');
  assert.ok(actions.some(action=>action.kind==='choose'&&action.target===fixture.ally.uid),
    'Man-Eater Bug may also target a monster on its own shared team field');
  current=await submit(current,actor,targetIndex,'m347-man-eater-target');
  current=await settleResponses(current,'man-eater-target');
  assert.equal(current.state.core.phase,'main','Man-Eater Bug resolves and returns to the Main Phase');
  assert.ok(current.state.core.players[1].grave.some(card=>card.uid===fixture.target.uid&&card.id===TARGET.id),
    'the destroyed opposing card must enter the opposing shared Graveyard with its physical UID');
  assert.ok(!current.state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.faceUp),
    'the partner-owned Man-Eater Bug remains face-up on the shared field');
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.ally.uid),
    'the unselected allied monster remains on the field');
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
