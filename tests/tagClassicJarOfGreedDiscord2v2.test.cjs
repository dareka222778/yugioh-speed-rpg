'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m430-jar-of-greed-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const ui=require('../dist/tagUI');
const {handleTagComponent}=require('../dist/tagInteraction');
const {getPlayableCard,getCardStatus,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {rulesFor}=require('../dist/rulesProfile');

const JAR_OF_GREED='83968380';
const jar=getPlayableCard(JAR_OF_GREED);
assert.equal(jar?.englishName,'Jar of Greed');
assert.equal(jar?.kind,'trap');
assert.equal(getCardStatus(JAR_OF_GREED)?.stage,'certified');
assert.equal(getEffect(JAR_OF_GREED)?.kind,'sequence');
assert.deepEqual(getEffect(JAR_OF_GREED)?.operations,[{kind:'draw',count:1}]);
assert.equal(getActivationModel(getEffect(JAR_OF_GREED))?.speed,2);
assert.equal(getActivationModel(getEffect(JAR_OF_GREED))?.window,'free');

const normalIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>{
    const card=getPlayableCard(id);
    return card?.kind==='monster'&&card.monsterType==='normal'&&card.level<=4&&
      Number.isInteger(card.atk)&&Number.isInteger(card.defense);
  }).slice(0,7);
assert.equal(normalIds.length,7,'the fixture needs seven certified Level 4-or-lower Normal Monsters');

function member(seat){return 'm430-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=7);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'physical seat '+seat+' Deck must contain '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function ensureTopDeck(state,seat,id){
  const physical=holder(state,seat);
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'active representative Deck must retain the deterministic draw');
  const [card]=physical.deck.splice(index,1);
  physical.deck.unshift(card);
  return card;
}
function setBackrow(state,physicalSeat,id){
  const card=ensureInHand(state,physicalSeat,id);
  const hand=holder(state,physicalSeat).hand;
  const index=hand.findIndex(item=>item.uid===card.uid);
  assert.ok(index>=0);
  hand.splice(index,1);
  const placed={...card,faceUp:false,setTurn:state.core.turn};
  state.core.players[physicalSeat%2].backrow.push(placed);
  return placed;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Main Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical card UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function snapshots(state){
  const hands=new Map([0,1,2,3].map(seat=>[
    seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)
  ]));
  const decks=new Map([0,1,2,3].map(seat=>[
    seat,holder(state,seat).deck.map(card=>card.uid)
  ]));
  return {hands,decks};
}
function assertRules(state){
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(rules.extraDeckMax,5);
  for(const team of state.core.players){
    assert.ok(team.monsters.length<=3);
    assert.ok(team.backrow.length<=3);
  }
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra??[]).length<=5);
}
function assertNoPublicHandUIDs(record){
  const payload=ui.tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(record.state,member(seat))){
    assert.ok(!rendered.includes(card.uid),'public Discord payload leaked private hand UID '+card.uid);
  }
}
function register(state){
  const id='m430-jar-of-greed';
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M430 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m430-guild','m430-channel','m430-message',7,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function interaction(record,actor,index,requestId){
  const calls=[];
  return {
    id:requestId,guildId:record.guild,user:{id:actor},
    customId:'tag:act:'+record.id+':'+record.revision+':'+actor,
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
  const panel=ui.tagPrivateMessage(record,actor,Math.floor(index/20));
  validateDiscordPayload(panel);
  const components=panel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  const menu=components.find(component=>
    component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor
  );
  assert.ok(menu,'active representative must receive the private Discord action menu');
  assert.ok(menu.options.some(option=>option.value===String(index)));
  const i=interaction(record,actor,index,requestId);
  let refreshes=0;
  await handleTagComponent(i,async next=>{
    refreshes++;
    validateDiscordPayload(ui.tagPublicMessage(next));
  },()=>{});
  assert.deepEqual(i.calls,['defer','edit']);
  assert.ok(refreshes>=1);
  return store.getTag(record.id);
}
async function settleResponses(record){
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<20,'Jar of Greed response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const pass=tag.tagActions(current.state,actor).findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the current responder must receive a legal Pass action');
    current=await submit(current,actor,pass,'m430-pass-'+guard);
  }
  return current;
}

test('Jar of Greed set by an inactive partner draws from the active representative physical Deck through Discord 2v2',async()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M430 Seat '+seat,
    cards:deck(seat===2?[JAR_OF_GREED]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m430-jar-of-greed'});
  state.core.turn=3;
  state.core.players[0].lp=4000;
  state.core.players[1].lp=4000;
  const initialDeckSizes=[0,1,2,3].map(seat=>holder(state,seat).deck.length+holder(state,seat).hand.length);
  assert.deepEqual(initialDeckSizes,[20,20,20,20],'all four physical Main Decks begin at the owner minimum');
  const summoned=ensureInHand(state,1,normalIds[0]);
  const jar=setBackrow(state,2,JAR_OF_GREED);
  const drawn=ensureTopDeck(state,0,normalIds[1]);
  assert.match(jar.uid,/^m2:/,'the shared Set Trap must preserve physical owner seat 2');
  assert.match(drawn.uid,/^m0:/,'the deterministic draw belongs to active representative seat 0');
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===jar.uid&&!card.faceUp),
    'the physical seat 2 Trap is stored in the shared team-0 backrow');
  assertRules(state);
  tag.assertTagDuel(state);
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicBefore.includes(JAR_OF_GREED),'the Set Trap identity must remain hidden publicly');
  assert.ok(!publicBefore.includes(jar.uid),'the Set Trap UID must remain hidden publicly');

  const sameTurn=tag.tagActions(state,member(0));
  assert.ok(!sameTurn.some(action=>action.kind==='trap'&&action.card===jar.uid),
    'Jar of Greed cannot be activated during the same turn it was Set');

  const end=tag.tagActions(state,member(0)).find(action=>action.kind==='end');
  assert.ok(end,'seat 0 must be able to end its turn');
  state=tag.stepTagDuel(state,member(0),end);
  assert.equal(state.core.turn,4);
  assert.equal(tag.tagDecisionMember(state).id,member(1),'opposing physical seat 1 acts next');

  const summonAction=tag.tagActions(state,member(1)).find(action=>
    action.kind==='summon'&&action.card===summoned.uid&&action.position==='atk'
  );
  assert.ok(summonAction,'seat 1 must be able to Normal Summon the Level 4-or-lower monster');
  state=tag.stepTagDuel(state,member(1),summonAction);
  assert.equal(state.core.phase,'response','the Normal Summon opens a real Trap response window');
  assert.equal(tag.tagDecisionMember(state).id,member(0),
    'the active physical representative of the opposing team receives response priority');

  const actions=tag.tagActions(state,member(0));
  const index=actions.findIndex(action=>action.kind==='trap'&&action.card===jar.uid);
  assert.ok(index>=0,'the active representative can activate the partner-owned Jar of Greed');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical owner cannot operate the shared Trap while seat 0 represents the team');
  const before=inventorySnapshot(state);
  const zoneBefore=snapshots(state);
  const record=register(state);
  assertNoPublicHandUIDs(record);
  const partnerPanel=ui.tagPrivateMessage(record,member(2));
  validateDiscordPayload(partnerPanel);
  assert.ok(!partnerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[])
    .some(component=>component.custom_id?.startsWith('tag:act:')),
    'the inactive partner does not receive the active representative action menu');

  let current=await submit(record,member(0),index,'m430-jar-activate');
  if(current.state.core.phase==='response')current=await settleResponses(current);
  const resolved=current.state;
  assert.ok(resolved.core.players[0].grave.some(card=>card.uid===jar.uid&&card.id===JAR_OF_GREED),
    'the partner-owned Jar enters the shared team Graveyard with its original UID');
  assert.ok(tag.tagMemberHand(resolved,member(0)).some(card=>card.uid===drawn.uid),
    'the draw goes to active representative seat 0 private hand');
  assert.ok(!tag.tagMemberHand(resolved,member(2)).some(card=>card.uid===drawn.uid),
    'the inactive physical owner seat 2 does not receive the draw');
  assert.deepEqual(tag.tagMemberHand(resolved,member(2)).map(card=>card.uid),zoneBefore.hands.get(2),
    'the partner hand remains unchanged');
  for(const seat of [0,1,2,3]){
    const expected=zoneBefore.decks.get(seat).filter(uid=>seat===0&&uid===drawn.uid?false:true);
    assert.deepEqual(holder(resolved,seat).deck.map(card=>card.uid),expected,
      'only active representative seat 0 Deck may supply the draw');
  }
  assertInventoryConserved(resolved,before);
  assertRules(resolved);
  tag.assertTagDuel(resolved);
  tag.assertTagDuel(JSON.parse(JSON.stringify(resolved)));
  assertNoPublicHandUIDs(current);
  validateDiscordPayload(ui.tagPrivateMessage(current,member(0)));
  validateDiscordPayload(ui.tagPrivateMessage(current,member(2)));
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
