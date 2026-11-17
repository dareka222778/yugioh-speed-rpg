'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m343-needle-worm-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){
  nodeTest(name,async(...args)=>{
    try{return await fn(...args);}
    catch(error){console.error('[M343 diagnostic] '+name+'\\n'+(error?.stack||error));throw error;}
  });
}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getCardStatus}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');
const {rulesFor}=require('../dist/rulesProfile');

const NEEDLE_WORM='81843628';
const effect=getMonsterEffect(NEEDLE_WORM);
assert.equal(getPlayableCard(NEEDLE_WORM)?.englishName,'Needle Worm');
assert.equal(getCardStatus(NEEDLE_WORM)?.stage,'certified');
assert.equal(effect?.trigger,'flip');
assert.equal(effect?.activation?.policy,'mandatory');
assert.equal(effect?.operation.kind,'mill');
assert.equal(effect?.operation.count,5);
assert.equal(effect?.operation.player,'opponent');

const normalIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>id!==NEEDLE_WORM)
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense))
  .slice(0,8)
  .map(entry=>entry.id);
assert.ok(normalIds.length>=8,'the isolated Deck fixture needs eight certified monsters');

function member(seat){return 'm343-seat-'+seat;}
function deck(){
  const ids=[NEEDLE_WORM,...normalIds];
  assert.ok(ids.length>=9);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
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
  throw new Error('M343 physical card missing from seat '+seat+': '+id);
}
function deployFaceDown(state,seat){
  const card=takePhysical(state,seat,NEEDLE_WORM);
  const monster={...card,owner:seat%2,position:'def',faceUp:false,
    entered:0,changed:0,attacked:0,attackCount:0,atkBoost:0,defBoost:0};
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
  for(const seat of [0,1,2,3])assert.ok((holder(state,seat).extra||[]).length<=5);
}
function inventory(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all physical UIDs must be unique');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Needle Worm must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Needle Worm must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function arrangeTop(state,count){
  const physical=holder(state,1);
  const top=[];
  for(const id of normalIds.slice(0,count)){
    let index=physical.deck.findIndex(card=>card.id===id);
    if(index<0){
      const handIndex=physical.hand.findIndex(card=>card.id===id);
      assert.ok(handIndex>=0,'selected mill cards must originate in the active opposing physical Deck or hand');
      physical.deck.push(physical.hand.splice(handIndex,1)[0]);
      index=physical.deck.findIndex(card=>card.id===id);
    }
    assert.ok(index>=0,'selected mill card must exist in the active opposing physical Deck');
    top.push(physical.deck.splice(index,1)[0]);
  }
  physical.deck.unshift(...top);
  return top;
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
  assert.ok(menu,'the active physical representative must receive a private Discord menu');
  assert.ok(menu.options.some(option=>option.value===String(index)),
    'the private menu must expose the legal action index '+index);
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
  let current=record;
  for(let guard=0;current.state.core.phase==='response';guard++){
    assert.ok(guard<30,'the mandatory FLIP trigger response window must terminate');
    const actor=tag.tagDecisionMember(current.state).id;
    const actions=tag.tagActions(current.state,actor);
    const pass=actions.findIndex(action=>action.kind==='pass');
    assert.ok(pass>=0,'the active responder must receive a legal pass action');
    current=await submit(current,actor,pass,'m343-'+suffix+'-pass-'+guard);
  }
  return current;
}
function setup(scenario){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M343 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m343-'+scenario});
  state.core.turn=3;
  assert.equal(state.active[0],0,'seat 0 must be the active physical representative for its team');
  assert.equal(state.active[1],1,'seat 1 must be the active physical opponent whose Deck is milled');
  assert.equal(tag.tagDecisionMember(state).id,member(0),
    'seat 0 must be the active representative for the source-owning team');
  const source=deployFaceDown(state,2);
  assert.match(source.uid,/^m2:/,'Needle Worm retains physical seat 2 identity');
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const id='m343-'+scenario;
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M343 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m343-guild','m343-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return {record:store.getTag(id),source,before};
}
async function flip(record,source,suffix){
  const actions=tag.tagActions(record.state,member(0));
  const index=actions.findIndex(action=>
    action.kind==='position'&&action.card===source.uid&&action.mode==='flip'
  );
  assert.ok(index>=0,'the active representative must see the partner-owned FLIP Summon action');
  const unchanged=JSON.stringify(record.state);
  const ownerPanel=tagPrivateMessage(record,member(2),0);
  validateDiscordPayload(ownerPanel);
  const ownerComponents=ownerPanel.components.map(row=>row.toJSON()).flatMap(row=>row.components||[]);
  assert.ok(!ownerComponents.some(component=>
    component.options?.some(option=>option.value===String(index))
  ),'the inactive physical owner must not receive the active representative action');
  assert.deepEqual(tag.tagActions(record.state,member(2)),[],
    'the inactive physical owner cannot submit the FLIP Summon');
  assert.throws(()=>tag.stepTagDuel(record.state,member(2),actions[index]),
    /Aguarde a vez do participante ativo/);
  assert.equal(JSON.stringify(record.state),unchanged,'rejected partner action must not mutate the duel');
  return submit(record,member(0),index,'m343-'+suffix+'-flip');
}
async function resolveFlip(record,source,suffix){
  let current=await flip(record,source,suffix);
  current=await settleResponses(current,suffix);
  return current;
}
function partnerDeckUids(state){
  return holder(state,3).deck.map(card=>card.uid).sort();
}
function assertFinished(record,fixture,top,partnerBefore,activeDeckBefore,suffix){
  const state=record.state;
  const opponent=state.core.players[1];
  const milled=top.map(card=>card.uid);
  const graveUids=new Set(opponent.grave.map(card=>card.uid));
  for(const uid of milled)assert.ok(graveUids.has(uid),'the exact selected top UID must enter the opposing shared Graveyard: '+uid);
  assert.equal(holder(state,1).deck.length,activeDeckBefore-top.length,
    'only the opposing active physical Deck loses the expected number of cards');
  assert.deepEqual(partnerDeckUids(state),partnerBefore,
    'the opposing inactive partner physical Deck remains untouched');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===fixture.source.uid&&card.faceUp),
    'Needle Worm remains face-up after its mandatory FLIP effect');
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(record);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}

test('Needle Worm FLIP through Discord mills exactly five cards from only the opposing active physical Deck',async()=>{
  const fixture=setup('five');
  const physical=holder(fixture.record.state,1);
  const top=arrangeTop(fixture.record.state,5);
  const partnerBefore=partnerDeckUids(fixture.record.state);
  const activeDeckBefore=physical.deck.length;
  const current=await resolveFlip(fixture.record,fixture.source,'five');
  assertFinished(current,fixture,top,partnerBefore,activeDeckBefore,'five');
  assert.equal(current.state.core.players[1].lp,4000,'milling does not alter team Life Points');
  assert.equal(current.state.core.players[0].lp,4000);
});

test('Needle Worm FLIP through Discord mills all remaining cards when the opposing active Deck has fewer than five',async()=>{
  const fixture=setup('short');
  const physical=holder(fixture.record.state,1);
  const top=arrangeTop(fixture.record.state,3);
  const chosen=new Set(top.map(card=>card.uid));
  const leftovers=physical.deck.filter(card=>!chosen.has(card.uid));
  physical.grave.push(...leftovers);
  physical.deck=top.slice();
  assert.equal(physical.deck.length,3);
  const partnerBefore=partnerDeckUids(fixture.record.state);
  const activeDeckBefore=physical.deck.length;
  const current=await resolveFlip(fixture.record,fixture.source,'short');
  assertFinished(current,fixture,top,partnerBefore,activeDeckBefore,'short');
  assert.equal(holder(current.state,1).deck.length,0,
    'all three remaining active opposing cards are milled');
  assert.equal(current.state.core.players[1].lp,4000);
  assert.equal(current.state.core.players[0].lp,4000);
});

after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
