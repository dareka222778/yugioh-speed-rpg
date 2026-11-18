'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m366-guard-owner-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getCardStatus,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const GUARD='37101832';
const BLUE_EYES='89631139';
const AXE_RAIDER='48305365';
const ULTIMATE='23995348';
assert.equal(getPlayableCard(GUARD)?.englishName,"Gravekeeper's Guard");
assert.equal(getCardStatus(GUARD)?.stage,'certified');
assert.equal(getEffect(GUARD)?.kind,'monsterEffect');
assert.deepEqual(getMonsterEffect(GUARD),{
  trigger:'flip',
  operation:{kind:'bounce',target:'opponentMonster'}
});
assert.equal(getPlayableCard(BLUE_EYES)?.englishName,'Blue-Eyes White Dragon');
assert.equal(getPlayableCard(AXE_RAIDER)?.englishName,'Axe Raider');
assert.equal(getPlayableCard(ULTIMATE)?.englishName,'Blue-Eyes Ultimate Dragon');
assert.equal(getCardStatus(ULTIMATE)?.stage,'certified');
assert.equal(getPlayableCard(ULTIMATE)?.monsterType,'fusion');

const SAFE_NORMALS=[...new Set(tag.tagNormalCardIds)].filter(id=>{
  const card=getPlayableCard(id);
  return card?.kind==='monster'&&card.monsterType==='normal'&&
    Number.isInteger(card.atk)&&Number.isInteger(card.defense)&&card.level<=4;
});
assert.ok(SAFE_NORMALS.length>=20,'four physical Decks require twenty distinct certified Normal Monsters');

function member(seat){return 'm366-seat-'+seat;}
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
  throw new Error('M366 physical card missing from seat '+seat+': '+id);
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
function deployExtra(state,seat,id){
  const physical=holder(state,seat);
  const index=physical.extra.findIndex(card=>card.id===id);
  assert.ok(index>=0,'Fusion must begin in the physical owner Extra Deck');
  const card=physical.extra.splice(index,1)[0];
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
    assert.ok(team.monsters.length<=3,'each team shares three Monster Zones');
    assert.ok(team.backrow.length<=3,'each team shares three Spell/Trap Zones');
  }
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra??[]).length<=5);
}
function inventory(state,expected=80){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,expected,'inventory must include every physical Main/Extra Deck card exactly once');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,expected,'all physical UIDs must be unique');
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
async function settleResponses(record){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<40,'the Discord response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const pass=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current physical responder must receive a legal Pass action');
    current=await submit(current,actor,pass,'m366-pass-'+guard);
  }
  return current;
}
function register(state,id='m366-guard-owner'){
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M366 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m366-guild','m366-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(){
  const required=[[],[],[],[]];
  required[0].push(AXE_RAIDER);
  required[2].push(GUARD);
  required[3].push(BLUE_EYES);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M366 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m366-gravekeepers-guard-owner'});
  state.core.turn=3;
  assert.deepEqual(state.active,[0,1],'seats 0 and 1 must be the active representatives');
  assert.equal(state.core.resolverVersion,'engine-v9','the test must exercise the current pinned resolver');
  const ally=deploy(state,0,AXE_RAIDER);
  const source=placeFaceDown(state,2,GUARD);
  const target=deploy(state,3,BLUE_EYES);
  assert.match(source.uid,/^m2:/,'the Flip source must retain inactive allied physical seat 2 ownership');
  assert.match(target.uid,/^m3:/,'the target must retain inactive opposing physical seat 3 ownership');
  assert.equal(target.owner,1,'the public field controller is team 1 while physical ownership remains seat 3 in the UID');
  assert.match(ally.uid,/^m0:/,'the allied control monster must retain active seat 0 ownership');
  assert.equal(tag.tagDecisionMember(state).id,member(0),'active ally seat 0 must execute the Flip Summon');
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const record=register(state);
  assertPublicPayload(record);
  return {ally,source,target,before,record};
}

test("Gravekeeper's Guard returns a bounced monster to its inactive physical owner's hand",async()=>{
  const fixture=setup();
  const flipActions=tag.tagActions(fixture.record.state,member(0));
  const flipIndex=flipActions.findIndex(action=>
    action.kind==='position'&&action.card===fixture.source.uid&&action.mode==='flip'
  );
  assert.ok(flipIndex>=0,'the active representative must receive the partner-owned Flip Summon action');
  const partnerPanel=tagPrivateMessage(fixture.record,member(2));
  validateDiscordPayload(partnerPanel);
  const partnerRows=partnerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  assert.ok(!partnerRows.some(row=>row.custom_id?.startsWith('tag:act:')),
    'the inactive physical source owner must not receive the active representative action menu');
  const forged=interaction(fixture.record,member(2),flipIndex,'m366-forged',member(0));
  const unchanged=JSON.stringify(fixture.record.state);
  await assert.rejects(
    handleTagComponent(forged,async()=>{},()=>{}),
    /Abra sua própria mão no campo\./
  );
  assert.deepEqual(forged.calls,[],'the inactive partner must be rejected before acknowledgement');
  assert.equal(store.getTag(fixture.record.id).revision,fixture.record.revision);
  assert.equal(JSON.stringify(store.getTag(fixture.record.id).state),unchanged);

  let current=await submit(fixture.record,member(0),flipIndex,'m366-flip');
  assert.equal(current.state.core.phase,'choice','the mandatory Flip effect must open its opponent-target choice');
  assert.equal(current.state.core.choice?.source,'triggerTarget');
  assert.ok(current.state.core.choice.targets.includes(fixture.target.uid),
    'the inactive opposing partner monster must be a legal bounce target');
  assert.ok(!current.state.core.choice.targets.includes(fixture.ally.uid),
    'the effect must not offer a monster controlled by the activating team');
  const chooseActions=tag.tagActions(current.state,member(0));
  const targetIndex=chooseActions.findIndex(action=>
    action.kind==='choose'&&action.target===fixture.target.uid
  );
  assert.ok(targetIndex>=0,'the active representative must receive the exact opposing target in its private Discord menu');
  current=await submit(current,member(0),targetIndex,'m366-select-opponent');

  current=await settleResponses(current);
  assert.equal(current.state.core.phase,'main','the Flip effect and its response window must resolve');
  assert.deepEqual(current.state.active,[0,1],'resolving a Flip trigger must not rotate either active representative');
  assert.deepEqual(current.state.core.teamRotation.active,[0,1],'the engine rotation must still identify seats 0 and 1 as active');
  assert.equal(tag.tagDecisionMember(current.state).id,member(0),'the same active representative must retain the turn');
  assert.ok(!current.state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid),
    'the selected opposing monster must leave the shared field');
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.ally.uid),
    'the allied monster must remain on the shared field');
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.faceUp),
    'Gravekeeper’s Guard must remain face-up after its effect resolves');

  assert.ok(!current.state.core.players[1].hand.some(card=>card.uid===fixture.target.uid),
    'the active team-1 hand array must not absorb a card physically owned by inactive seat 3');
  assert.ok(current.state.reserves[3].hand.some(card=>card.uid===fixture.target.uid),
    'the raw physical reserve for seat 3 must receive the bounced card');
  const physicalOwnerHand=tag.tagMemberHand(current.state,member(3));
  const activeOpponentHand=tag.tagMemberHand(current.state,member(1));
  assert.ok(physicalOwnerHand.some(card=>card.uid===fixture.target.uid),
    'the bounced card must return to physical owner seat 3, not merely team 1');
  assert.ok(!activeOpponentHand.some(card=>card.uid===fixture.target.uid),
    'the active opponent representative must not receive the inactive partner’s card');

  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});

function setupFusion(){
  const required=[[],[],[],[]];
  required[0].push(AXE_RAIDER);
  required[2].push(GUARD);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M366 Seat '+seat,cards:deck(required[seat]),
    extra:seat===3?[ULTIMATE]:[]
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m366-gravekeepers-guard-fusion-owner'});
  state.core.turn=3;
  assert.deepEqual(state.active,[0,1]);
  assert.equal(state.core.resolverVersion,'engine-v9');
  const ally=deploy(state,0,AXE_RAIDER);
  const source=placeFaceDown(state,2,GUARD);
  const target=deployExtra(state,3,ULTIMATE);
  assert.match(source.uid,/^m2:/);
  assert.match(target.uid,/^m3:/,'Fusion target must preserve physical seat 3 identity');
  assert.equal(target.owner,1,'the target is controlled by team 1 while physically owned by seat 3');
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state,81);
  const record=register(state,'m366-guard-fusion-owner');
  assertPublicPayload(record);
  return {state,ally,source,target,before,record};
}

test("Gravekeeper's Guard returns a bounced Fusion to its inactive physical owner's Extra Deck",async()=>{
  const fixture=setupFusion();
  const flipActions=tag.tagActions(fixture.record.state,member(0));
  const flipIndex=flipActions.findIndex(action=>
    action.kind==='position'&&action.card===fixture.source.uid&&action.mode==='flip'
  );
  assert.ok(flipIndex>=0,'the active representative must receive the partner-owned Flip Summon action');
  let current=await submit(fixture.record,member(0),flipIndex,'m366-fusion-flip');
  assert.equal(current.state.core.phase,'choice');
  assert.ok(current.state.core.choice.targets.includes(fixture.target.uid));
  const chooseActions=tag.tagActions(current.state,member(0));
  const targetIndex=chooseActions.findIndex(action=>
    action.kind==='choose'&&action.target===fixture.target.uid
  );
  assert.ok(targetIndex>=0,'the active representative must receive the inactive partner Fusion as a legal target');
  current=await submit(current,member(0),targetIndex,'m366-fusion-select');
  current=await settleResponses(current);

  assert.equal(current.state.core.phase,'main');
  assert.deepEqual(current.state.active,[0,1],'resolving the bounce must not rotate active representatives');
  assert.deepEqual(current.state.core.teamRotation.active,[0,1]);
  assert.ok(!current.state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.ally.uid));
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.faceUp));
  assert.ok(!current.state.core.players[1].extra.some(card=>card.uid===fixture.target.uid),
    'the active opponent Extra Deck must not absorb the inactive partner Fusion');
  assert.ok(current.state.reserves[3].extra.some(card=>card.uid===fixture.target.uid),
    'the Fusion must return to physical owner seat 3 Extra Deck');
  assertConserved(current.state,fixture.before);
  assertPrivateHands(current.state);
  assertRules(current.state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(current.state))));
});

function setupFaceDownTarget(){
  const required=[[],[],[],[]];
  required[0].push(AXE_RAIDER);
  required[2].push(GUARD);
  required[3].push(BLUE_EYES);
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M366 Seat '+seat,cards:deck(required[seat]),extra:[]
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m366-gravekeepers-guard-facedown-owner'});
  state.core.turn=3;
  assert.deepEqual(state.active,[0,1]);
  assert.equal(state.core.resolverVersion,'engine-v9');
  const ally=deploy(state,0,AXE_RAIDER);
  const source=placeFaceDown(state,2,GUARD);
  const target=placeFaceDown(state,3,BLUE_EYES);
  assert.match(source.uid,/^m2:/);
  assert.match(target.uid,/^m3:/);
  assert.equal(target.owner,1);
  assert.equal(target.faceUp,false);
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const record=register(state,'m366-guard-facedown-owner');
  assertPublicPayload(record);
  return {state,ally,source,target,before,record};
}

test("Gravekeeper's Guard can bounce a face-down monster without revealing it and preserves its physical owner",async()=>{
  const fixture=setupFaceDownTarget();
  const initialPublic=JSON.stringify(tagPublicMessage(fixture.record));
  assert.ok(!initialPublic.includes(BLUE_EYES),'the set opposing monster identity must not appear in the public panel');
  assert.ok(!initialPublic.includes(fixture.target.uid),'the set opposing monster UID must remain private');

  const flipActions=tag.tagActions(fixture.record.state,member(0));
  const flipIndex=flipActions.findIndex(action=>
    action.kind==='position'&&action.card===fixture.source.uid&&action.mode==='flip'
  );
  assert.ok(flipIndex>=0);
  let current=await submit(fixture.record,member(0),flipIndex,'m366-facedown-flip');
  assert.equal(current.state.core.phase,'choice');
  assert.ok(current.state.core.choice.targets.includes(fixture.target.uid),
    'a face-down opposing monster is still a legal bounce target');
  const choicePanel=tagPrivateMessage(current,member(0));
  validateDiscordPayload(choicePanel);
  const choiceText=JSON.stringify(choicePanel);
  assert.ok(choiceText.includes('virado para baixo'),
    'the active representative sees a hidden-position label, not the card identity');
  assert.ok(!choiceText.includes('Blue-Eyes White Dragon'),
    'the opponent face-down identity must not leak through the private choice menu');

  const chooseActions=tag.tagActions(current.state,member(0));
  const targetIndex=chooseActions.findIndex(action=>
    action.kind==='choose'&&action.target===fixture.target.uid
  );
  assert.ok(targetIndex>=0);
  current=await submit(current,member(0),targetIndex,'m366-facedown-select');
  current=await settleResponses(current);

  assert.equal(current.state.core.phase,'main');
  assert.deepEqual(current.state.active,[0,1]);
  assert.deepEqual(current.state.core.teamRotation.active,[0,1]);
  assert.ok(!current.state.core.players[1].monsters.some(card=>card.uid===fixture.target.uid));
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.ally.uid));
  assert.ok(current.state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.faceUp));
  assert.ok(current.state.reserves[3].hand.some(card=>card.uid===fixture.target.uid),
    'the bounced face-down card returns to inactive physical owner seat 3');
  assert.ok(!current.state.core.players[1].hand.some(card=>card.uid===fixture.target.uid),
    'the active opponent representative does not receive the partner card');
  const physicalOwnerPanel=JSON.stringify(tagPrivateMessage(current,member(3)));
  const activeOpponentPanel=JSON.stringify(tagPrivateMessage(current,member(1)));
  assert.ok(physicalOwnerPanel.includes('Blue-Eyes White Dragon'),
    'the physical owner can still see the card in their own private hand');
  assert.ok(!activeOpponentPanel.includes('Blue-Eyes White Dragon'),
    'the active teammate cannot inspect the inactive partner private hand');
  assert.ok(!activeOpponentPanel.includes(fixture.target.uid),
    'the inactive partner UID must not leak to the active teammate panel');

  const finalPublic=JSON.stringify(tagPublicMessage(current));
  assert.ok(!finalPublic.includes(BLUE_EYES),'the public panel must not reveal the returned card identity');
  assert.ok(!finalPublic.includes(fixture.target.uid),'the public panel must not reveal the returned card UID');
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
