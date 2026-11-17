'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m310-draw-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M310 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const UPSTART_GOBLIN='70368879';
const JAR_OF_GREED='83968380';
assert.equal(getPlayableCard(UPSTART_GOBLIN)?.englishName,'Upstart Goblin');
assert.equal(getEffect(UPSTART_GOBLIN)?.kind,'sequence');
assert.equal(getCardStatus(UPSTART_GOBLIN)?.stage,'certified');
assert.equal(getPlayableCard(JAR_OF_GREED)?.englishName,'Jar of Greed');
assert.equal(getEffect(JAR_OF_GREED)?.kind,'sequence');
assert.equal(getCardStatus(JAR_OF_GREED)?.stage,'certified');
assert.deepEqual(getEffect(UPSTART_GOBLIN)?.operations,[
  {kind:'draw',count:1},
  {kind:'gainLP',player:'opponent',amount:1000}
]);
assert.deepEqual(getEffect(JAR_OF_GREED)?.operations,[{kind:'draw',count:1}]);

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20,'four physical Decks need at least twenty certified Normal Monster fillers');

function member(seat){return 'm310-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20,'each physical Deck must contain twenty distinct card identities');
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
  throw new Error('M310 physical card missing from seat '+seat+': '+id);
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
  assert.ok(menu,'the active physical representative must receive a real private Discord action menu');
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
async function settleResponses(record,suffix){
  let current=store.getTag(record.id);
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<12,'the Trap response chain must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const passIndex=actions.findIndex(action=>action.kind==='pass');
    assert.ok(passIndex>=0,'the current physical responder must receive a legal pass action');
    current=await submit(current,actor,passIndex,'m310-'+suffix+'-pass-'+guard);
  }
  return current;
}
async function rejectInactivePartner(record,actor,partner,index,suffix){
  const forged=interaction(record,partner,index,'m310-'+suffix+'-forged',actor);
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[],'the inactive physical partner must be rejected before Discord acknowledgement');
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged,
    'a forged partner action must not mutate the persisted duel');
}
function registerSession(id,state){
  const guild='m310-guild',channel='m310-channel';
  const ids=[0,1,2,3].map(member);
  const members=ids.map((id,seat)=>({id,name:'M310 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,guild,channel,null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setupUpstart(){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M310 Seat '+seat,cards:deck(seat===0?[UPSTART_GOBLIN]:[])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m310-upstart-goblin-discord'});
  state.core.turn=3;
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  const spell=takePhysical(state,0,UPSTART_GOBLIN);
  holder(state,0).hand.push(spell);
  const active=holder(state,0);
  while(active.hand.length<6){
    const [card]=active.deck.splice(0,1);
    assert.ok(card,'the active physical Deck must supply the initial six-card hand');
    active.hand.push(card);
  }
  assert.equal(active.hand.length,6);
  const top=active.deck[0];
  assert.ok(top,'Upstart Goblin requires one card in the active physical Deck');
  const partnerDeck=holder(state,2).deck.map(card=>card.uid);
  const partnerHand=tag.tagMemberHand(state,member(2)).map(card=>card.uid);
  const before=inventory(state);
  assert.match(spell.uid,/^m0:/,'Upstart Goblin must retain physical seat 0 ownership');
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const record=registerSession('m310-upstart',state);
  return {spell,top,partnerDeck,partnerHand,before,record};
}
function setupJar(emptyActiveDeck=false){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((id,seat)=>({id,name:'M310 Seat '+seat,cards:deck(seat===2?[JAR_OF_GREED]:[])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:emptyActiveDeck?'m310-jar-empty':'m310-jar-owner'});
  const physicalCard=takePhysical(state,2,JAR_OF_GREED);
  const jar={...physicalCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(jar);
  state.core.turn=3;
  assert.match(jar.uid,/^m2:/,'the Trap must retain inactive physical seat 2 ownership');
  if(emptyActiveDeck){
    const active=holder(state,0);
    state.core.players[0].grave.push(...active.deck.splice(0));
    assert.equal(active.deck.length,0);
    assert.ok(holder(state,2).deck.length>0,'the inactive owner still has a Deck but cannot lend it');
  }
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const activeDeckBefore=holder(state,0).deck.map(card=>card.uid);
  const activeHandBefore=tag.tagMemberHand(state,member(0)).map(card=>card.uid);
  const activeTop=activeDeckBefore[0];
  const partnerDeck=holder(state,2).deck.map(card=>card.uid);
  const partnerHand=tag.tagMemberHand(state,member(2)).map(card=>card.uid);
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicState.includes(JAR_OF_GREED),'the Set Trap identity must remain hidden');
  assert.ok(!publicState.includes(jar.uid),'the Set Trap physical UID must remain hidden');
  const record=registerSession(emptyActiveDeck?'m310-jar-empty':'m310-jar',state);
  return {jar,activeTop,activeDeckBefore,activeHandBefore,partnerDeck,partnerHand,before,record};
}

test('Upstart Goblin draws from the active physical Deck and grants 1000 LP to the opposing team through Discord',async()=>{
  const fixture=setupUpstart();
  const actor=member(0);
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>action.kind==='spell'&&action.card===fixture.spell.uid);
  assert.ok(index>=0,'the active representative must receive the Upstart Goblin Spell action');
  assert.deepEqual(tag.tagActions(fixture.record.state,member(2)),[],
    'the inactive physical partner cannot activate a Spell from the active seat hand');
  await rejectInactivePartner(fixture.record,actor,member(2),index,'upstart');
  const current=await submit(fixture.record,actor,index,'m310-upstart-activate');
  const state=current.state;
  assert.equal(state.core.phase,'main','Upstart Goblin resolves in the Main Phase');
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,5000],
    'the opponent team gains exactly 1000 LP after the active seat draws');
  assert.ok(tag.tagMemberHand(state,actor).some(card=>card.uid===fixture.top.uid&&card.id===fixture.top.id),
    'the exact top UID of the active physical Deck must be drawn');
  assert.equal(tag.tagMemberHand(state,actor).length,7,
    'the Main Phase may temporarily exceed six cards; discard is deferred to End Phase');
  assert.ok(!tag.tagActions(state,actor).some(action=>action.kind==='discard'),
    'the hand limit must not force a premature Main Phase discard');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.spell.uid),
    'Upstart Goblin enters the activating team shared Graveyard');
  assert.deepEqual(holder(state,2).deck.map(card=>card.uid),fixture.partnerDeck,
    'the inactive partner Deck must remain unchanged');
  assert.deepEqual(tag.tagMemberHand(state,member(2)).map(card=>card.uid),fixture.partnerHand,
    'the inactive partner private hand must remain unchanged');
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});

test('active seat 0 can activate inactive partner seat 2 Jar of Greed from the shared backrow, but draws from seat 0 Deck',async()=>{
  const fixture=setupJar(false);
  const actor=member(0);
  const actions=tag.tagActions(fixture.record.state,actor);
  const index=actions.findIndex(action=>action.kind==='trap'&&action.card===fixture.jar.uid);
  assert.ok(index>=0,'the active representative may activate a teammate-owned Set Trap on the shared field');
  assert.deepEqual(tag.tagActions(fixture.record.state,member(2)),[],
    'the inactive physical Trap owner cannot submit the shared-field activation');
  await rejectInactivePartner(fixture.record,actor,member(2),index,'jar');
  const activated=await submit(fixture.record,actor,index,'m310-jar-activate');
  const current=await settleResponses(activated,'jar');
  const state=current.state;
  assert.equal(state.core.phase,'main','Jar of Greed resolves without a legal response');
  assert.deepEqual(tag.tagMemberHand(state,actor).map(card=>card.uid),fixture.activeHandBefore.concat(fixture.activeTop),
    'the active physical seat draws exactly the top UID from its own Deck');
  assert.deepEqual(holder(state,0).deck.map(card=>card.uid),fixture.activeDeckBefore.slice(1),
    'only the active physical Deck loses its top card');
  assert.deepEqual(holder(state,2).deck.map(card=>card.uid),fixture.partnerDeck,
    'the inactive Trap owner Deck must not supply the draw');
  assert.deepEqual(tag.tagMemberHand(state,member(2)).map(card=>card.uid),fixture.partnerHand,
    'the inactive Trap owner private hand remains unchanged');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.jar.uid),
    'the Trap enters the shared Graveyard with its original physical UID');
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,4000]);
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});

test('Jar of Greed is not offered when the active physical Deck is empty even if the Trap owner partner has cards',()=>{
  const fixture=setupJar(true);
  const actions=tag.tagActions(fixture.record.state,member(0));
  assert.ok(!actions.some(action=>action.kind==='trap'&&action.card===fixture.jar.uid),
    'the active seat cannot borrow the inactive Trap owner Deck to satisfy Jar of Greed draw');
  assert.equal(holder(fixture.record.state,0).deck.length,0);
  assert.ok(holder(fixture.record.state,2).deck.length>0);
  assertConserved(fixture.record.state,fixture.before);
  assertPrivateHands(fixture.record.state);
  assertRules(fixture.record.state);
  assert.doesNotThrow(()=>tag.assertTagDuel(fixture.record.state));
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});