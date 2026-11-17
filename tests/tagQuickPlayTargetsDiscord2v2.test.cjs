'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m333-m334-quickplay-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M333-M334 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus,isQuickPlaySpell}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');
const {rulesFor}=require('../dist/rulesProfile');

const MST='05318639';
const BOOK='14087893';
const TORRENTIAL='53582587';
const DARK_HOLE='53129443';
const SPELLS=[
  {id:MST,name:'Mystical Space Typhoon',kind:'mysticalSpaceTyphoon'},
  {id:BOOK,name:'Book of Moon',kind:'bookOfMoon'}
];
for(const card of SPELLS){
  assert.equal(getPlayableCard(card.id)?.englishName,card.name);
  assert.equal(getPlayableCard(card.id)?.kind,'spell');
  assert.equal(getCardStatus(card.id)?.stage,'certified',card.name+' must retain its existing certificate');
  assert.equal(getEffect(card.id)?.kind,card.kind);
  assert.equal(isQuickPlaySpell(card.id),true);
  assert.equal(getActivationModel(getEffect(card.id))?.speed,2);
}
assert.equal(getPlayableCard(TORRENTIAL)?.kind,'trap');
assert.equal(getPlayableCard(DARK_HOLE)?.kind,'spell');

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'four physical Decks require at least twenty certified Normal Monsters');

function member(seat){return 'm333-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20,'each physical Deck must contain at least twenty distinct cards');
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
  throw new Error('M333-M334 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function setBackrow(state,seat,id){
  const card=takePhysical(state,seat,id);
  const placed={...card,faceUp:false,setTurn:0};
  state.core.players[seat%2].backrow.push(placed);
  return placed;
}
function deploy(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function assertRules(state,initialDeckSizes){
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  if(initialDeckSizes)assert.deepEqual(initialDeckSizes,[20,20,20,20]);
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
  assert.equal(cards.length,before.size,'Quick-Play resolution must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function assertHidden(publicState,cards){
  for(const card of cards){
    assert.ok(!publicState.includes(card.id),'a Set/face-down card identity leaked: '+card.uid);
    assert.ok(!publicState.includes(card.uid),'a Set/face-down card UID leaked: '+card.uid);
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
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m333-'+suffix+'-forged',actor);
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
    assert.ok(guard<20,'the Quick-Play response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the active physical responder must receive a legal pass');
    current=await submit(current,actor,pass,'m333-'+suffix+'-pass-'+guard);
  }
  return current;
}
function saveSession(state,id){
  const guild='m333-guild',channel='m333-channel';
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M333 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setupMst(targetSeat){
  const normalA=NORMALS[0].id,normalB=NORMALS[1].id;
  const required=[
    [MST,normalA],
    [],
    [TORRENTIAL],
    [DARK_HOLE,normalB]
  ];
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M333 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m333-mst-target-'+targetSeat});
  state.core.turn=3;
  const initialDeckSizes=[0,1,2,3].map(seat=>{
    const physical=holder(state,seat);
    return physical.deck.length+physical.hand.length;
  });
  assertRules(state,initialDeckSizes);
  const spell=ensureInHand(state,0,MST);
  const ownSet=setBackrow(state,2,TORRENTIAL);
  const opponentSet=setBackrow(state,3,DARK_HOLE);
  const monsters=[deploy(state,0,normalA),deploy(state,3,normalB)];
  const target=targetSeat===2?ownSet:opponentSet;
  const untouched=targetSeat===2?opponentSet:ownSet;
  const before=inventory(state);
  assert.match(spell.uid,/^m0:/);
  assert.match(ownSet.uid,/^m2:/,'the allied Set card retains inactive physical seat 2 ownership');
  assert.match(opponentSet.uid,/^m3:/,'the opposing Set card retains physical seat 3 ownership');
  assertHidden(JSON.stringify(tag.publicTagDuel(state)),[ownSet,opponentSet]);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const record=saveSession(state,'m333-mst-seat-'+targetSeat);
  return {spell,ownSet,opponentSet,target,untouched,monsters,before,initialDeckSizes,record,targetSeat};
}
async function activateSpell(record,spell,suffix){
  const actor=member(0);
  const actions=tag.tagActions(record.state,actor);
  const index=actions.findIndex(action=>action.kind==='spell'&&action.card===spell.uid);
  assert.ok(index>=0,'the active seat must receive the Quick-Play Spell action in its private menu');
  assert.equal(tag.tagActions(record.state,member(2)).length,0,
    'the inactive allied partner cannot act while seat 0 is active');
  await rejectInactivePartner(record,actor,member(2),index,suffix);
  const activated=await submit(record,actor,index,'m333-'+suffix+'-activate');
  return activated;
}
function assertMonstersUnchanged(state,monsters){
  assert.deepEqual(state.core.players.map(team=>team.monsters.map(card=>card.uid)),
    monsters.map(card=>[card.uid]),'the targeted Spell/Trap operation must not affect monsters');
}
function assertFinalCommon(fixture,record,spell){
  assert.ok(record.state.core.players[0].grave.some(card=>card.uid===spell.uid),
    'the activated Quick-Play Spell enters the activating team Graveyard');
  assertConserved(record.state,fixture.before);
  assertPrivateHands(record.state);
  assertRules(record.state,fixture.initialDeckSizes);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(record.state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(record.state))));
}

for(const targetSeat of [2,3])test('Mystical Space Typhoon destroys a '+(targetSeat===2?'partner-owned allied':'opponent-owned')+' Set card through Discord 2v2',async()=>{
  const f=setupMst(targetSeat);
  const actor=member(0);
  const actions=tag.tagActions(f.record.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='spell'&&action.card===f.spell.uid&&action.target===f.target.uid
  );
  assert.ok(index>=0,'the private Discord menu must expose either shared backrow as an MST target');
  await rejectInactivePartner(f.record,actor,member(2),index,'mst-target-'+targetSeat);
  const activated=await submit(f.record,actor,index,'m333-mst-target-'+targetSeat+'-activate');
  const current=await settleResponses(activated,'mst-target-'+targetSeat);
  assert.equal(current.state.core.phase,'main');
  assert.ok(current.state.core.players[f.targetSeat%2].grave.some(card=>card.uid===f.target.uid),
    'the targeted Set card enters the correct shared team Graveyard with its physical UID');
  assert.ok(current.state.core.players[f.targetSeat%2].grave.some(card=>card.uid===f.target.uid&&card.id===f.target.id));
  assert.ok(current.state.core.players[f.targetSeat===2?1:0].backrow.some(card=>card.uid===f.untouched.uid&&!card.faceUp),
    'the non-target Set card remains hidden on its original shared field');
  assertHidden(JSON.stringify(tag.publicTagDuel(current.state)),[f.untouched]);
  assertMonstersUnchanged(current.state,f.monsters);
  assertFinalCommon(f,current,f.spell);
});

function setupBook(targetSeat){
  const normalA=NORMALS[0].id,normalB=NORMALS[1].id,normalC=NORMALS[2].id;
  const required=[
    [BOOK],
    [normalC],
    [normalA],
    [normalB]
  ];
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M334 Seat '+seat,cards:deck(required[seat])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m334-book-target-'+targetSeat});
  state.core.turn=3;
  const initialDeckSizes=[0,1,2,3].map(seat=>{
    const physical=holder(state,seat);
    return physical.deck.length+physical.hand.length;
  });
  assertRules(state,initialDeckSizes);
  const spell=ensureInHand(state,0,BOOK);
  const ally=deploy(state,2,normalA);
  const opponent=deploy(state,3,normalB);
  const alreadyDown=deploy(state,1,normalC,{faceUp:false,position:'def'});
  const target=targetSeat===2?ally:opponent;
  const untouched=targetSeat===2?opponent:ally;
  const before=inventory(state);
  assert.match(spell.uid,/^m0:/);
  assert.match(ally.uid,/^m2:/);
  assert.match(opponent.uid,/^m3:/);
  assert.match(alreadyDown.uid,/^m1:/);
  assertHidden(JSON.stringify(tag.publicTagDuel(state)),[alreadyDown]);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const record=saveSession(state,'m334-book-seat-'+targetSeat);
  return {spell,ally,opponent,alreadyDown,target,untouched,before,initialDeckSizes,record,targetSeat};
}
for(const targetSeat of [2,3])test('Book of Moon turns a '+(targetSeat===2?'partner-owned allied':'opposing')+' face-up monster face-down through Discord 2v2',async()=>{
  const f=setupBook(targetSeat);
  const actor=member(0);
  const actions=tag.tagActions(f.record.state,actor);
  const index=actions.findIndex(action=>
    action.kind==='spell'&&action.card===f.spell.uid&&action.target===f.target.uid
  );
  assert.ok(index>=0,'the private Discord menu must expose either shared Monster Zone as a Book of Moon target');
  assert.ok(!actions.some(action=>action.kind==='spell'&&action.card===f.spell.uid&&action.target===f.alreadyDown.uid),
    'Book of Moon cannot target an already face-down monster');
  await rejectInactivePartner(f.record,actor,member(2),index,'book-target-'+targetSeat);
  const activated=await submit(f.record,actor,index,'m334-book-target-'+targetSeat+'-activate');
  const current=await settleResponses(activated,'book-target-'+targetSeat);
  assert.equal(current.state.core.phase,'main');
  const team=current.state.core.players[targetSeat%2];
  const changed=team.monsters.find(card=>card.uid===f.target.uid);
  assert.ok(changed,'the target remains on its original shared field');
  assert.equal(changed.faceUp,false);
  assert.equal(changed.position,'def');
  assert.equal(changed.uid,f.target.uid);
  assert.equal(changed.id,f.target.id);
  const other=current.state.core.players[f.untouched.owner].monsters.find(card=>card.uid===f.untouched.uid);
  assert.ok(other);
  assert.equal(other.faceUp,true,'the non-target face-up monster remains unchanged');
  const down=current.state.core.players[1].monsters.find(card=>card.uid===f.alreadyDown.uid);
  assert.ok(down);
  assert.equal(down.faceUp,false,'the pre-existing face-down control remains unchanged');
  assert.ok(current.state.core.players[0].grave.some(card=>card.uid===f.spell.uid));
  assertFinalCommon(f,current,f.spell);
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
