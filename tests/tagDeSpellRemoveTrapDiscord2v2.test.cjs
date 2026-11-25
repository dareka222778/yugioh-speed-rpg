'use strict';
const {test:nodeTest,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m315-backrow-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
function test(name,fn){nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){console.error('[M315 diagnostic] '+name+'\n'+(error?.stack||error));throw error;}});}

const database=require('../dist/database');
const tag=require('../dist/tagDuel');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const DE_SPELL='19159413';
const REMOVE_TRAP='51482758';
const SET_TRAP='17814387';
const SET_SPELL='20871001';
const FACE_UP_TRAP='44209392';
for(const [id,name,kind] of [
  [DE_SPELL,'De-Spell','deSpell'],
  [REMOVE_TRAP,'Remove Trap','removeTrap']
]){
  assert.equal(getPlayableCard(id)?.englishName,name);
  assert.equal(getEffect(id)?.kind,kind);
  assert.equal(getCardStatus(id)?.stage,'certified');
}
for(const id of [SET_TRAP,SET_SPELL,FACE_UP_TRAP])assert.ok(getPlayableCard(id));

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&entry.card.monsterType==='normal'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(NORMALS.length>=20);

function member(seat){return 'm315-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...NORMALS.map(entry=>entry.id)])];
  assert.ok(ids.length>=20);
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
  throw new Error('M315 physical card missing from seat '+seat+': '+id);
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
  assert.equal(cards.length,80);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80);
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
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for seat '+seat);
  }
}
function assertPublicPayload(record){
  const payload=tagPublicMessage(record);
  validateDiscordPayload(payload);
  const rendered=JSON.stringify(payload);
  for(const card of tag.tagInventory(record.state)){
    assert.ok(!rendered.includes(card.uid),'public payload leaked UID '+card.uid);
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
  const menu=components.find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
  assert.ok(menu,'the active representative must receive a private Discord menu');
  assert.ok(menu.options.some(option=>option.value===String(index)));
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
async function rejectInactive(record,index,suffix){
  const forged=interaction(record,member(2),index,'m315-'+suffix+'-forged',member(0));
  const unchanged=JSON.stringify(record.state);
  await assert.rejects(handleTagComponent(forged,async()=>{},()=>{}),/Abra sua própria mão no campo\./);
  assert.deepEqual(forged.calls,[]);
  assert.equal(store.getTag(record.id).revision,record.revision);
  assert.equal(JSON.stringify(store.getTag(record.id).state),unchanged);
}
function register(id,state){
  const ids=[0,1,2,3].map(member);
  const members=ids.map((id,seat)=>({id,name:'M315 Seat '+seat,accepted:true}));
  database.db.prepare(
    'INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(id,'m315-guild','m315-channel',null,0,Date.now(),'playing',JSON.stringify(members),JSON.stringify(state),'classic-loan');
  return store.getTag(id);
}
function setup(sourceId,targetCards,id){
  const ids=[0,1,2,3].map(member);
  const players=ids.map((memberId,seat)=>({
    id:memberId,name:'M315 Seat '+seat,cards:deck(seat===0?[sourceId]:seat===3?targetCards.map(target=>target.id):[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:id});
  state.core.turn=3;
  const source=takePhysical(state,0,sourceId);
  holder(state,0).hand.push(source);
  const targets=targetCards.map((target,index)=>{
    const card=takePhysical(state,3,target.id);
    const placed={...card,faceUp:target.faceUp,setTurn:1};
    state.core.players[1].backrow.push(placed);
    return placed;
  });
  assert.match(source.uid,/^m0:/);
  assert.ok(targets.every(card=>card.uid.startsWith('m3:')),
    'every opposing target must retain inactive physical seat 3 ownership');
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assertRules(state);
  assertPrivateHands(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  for(const card of targets.filter(card=>!card.faceUp)){
    assert.ok(!publicBefore.includes(card.id),'a hidden target ID must not be public');
    assert.ok(!publicBefore.includes(card.uid),'a hidden target UID must not be public');
  }
  const record=register(id,state);
  return {source,targets,before,record};
}
function actionIndex(record,source,target){
  return tag.tagActions(record.state,member(0)).findIndex(action=>
    action.kind==='spell'&&action.card===source.uid&&action.target===target.uid
  );
}
async function activate(record,source,target,requestId){
  const index=actionIndex(record,source,target);
  assert.ok(index>=0,'the active representative must receive the legal targeted Spell action');
  assert.deepEqual(tag.tagActions(record.state,member(2)),[],
    'the inactive physical partner cannot submit the active Main Phase action');
  await rejectInactive(record,index,requestId);
  return submit(record,member(0),index,requestId);
}

test('De-Spell labels an opponent partner-owned Set Trap without leaking its identity, then reveals but does not destroy it',async()=>{
  const fixture=setup(DE_SPELL,[{id:SET_TRAP,faceUp:false}],'m315-despell-set-trap');
  const target=fixture.targets[0];
  const privatePanel=tagPrivateMessage(fixture.record,member(0),0);
  validateDiscordPayload(privatePanel);
  const privateText=JSON.stringify(privatePanel);
  assert.ok(privateText.includes('virada para baixo'),'the private action label must describe a hidden target generically');
  assert.ok(!privateText.includes(getPlayableCard(SET_TRAP).englishName),
    'the target identity must not appear in the private menu before resolution');
  const current=await activate(fixture.record,fixture.source,target,'m315-despell-trap-activate');
  const state=current.state;
  const revealed=state.core.players[1].backrow.find(card=>card.uid===target.uid);
  assert.ok(revealed,'a Set Trap is revealed but not destroyed by De-Spell');
  assert.equal(revealed.faceUp,true);
  assert.ok(!state.core.players[1].grave.some(card=>card.uid===target.uid));
  assert.ok(state.core.log.some(entry=>entry.includes('revelou')));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.source.uid));
  const publicAfter=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(publicAfter.includes(SET_TRAP),'the target identity becomes public only after resolution');
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});

test('De-Spell destroys an opponent partner-owned Set Spell after the Discord action resolves',async()=>{
  const fixture=setup(DE_SPELL,[{id:SET_SPELL,faceUp:false}],'m315-despell-set-spell');
  const target=fixture.targets[0];
  const privateText=JSON.stringify(tagPrivateMessage(fixture.record,member(0),0));
  assert.ok(privateText.includes('virada para baixo'));
  assert.ok(!privateText.includes(getPlayableCard(SET_SPELL).englishName));
  const current=await activate(fixture.record,fixture.source,target,'m315-despell-spell-activate');
  const state=current.state;
  assert.ok(!state.core.players[1].backrow.some(card=>card.uid===target.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===target.uid),
    'the revealed Spell is destroyed into the opponent shared Graveyard');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.source.uid));
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
});

test('Remove Trap offers only a face-up opponent Trap and preserves the hidden Set Trap identity',async()=>{
  const fixture=setup(REMOVE_TRAP,[
    {id:SET_TRAP,faceUp:false},
    {id:FACE_UP_TRAP,faceUp:true}
  ],'m315-remove-trap');
  const hidden=fixture.targets[0],visible=fixture.targets[1];
  const actions=tag.tagActions(fixture.record.state,member(0));
  assert.ok(actions.some(action=>action.kind==='spell'&&action.card===fixture.source.uid&&action.target===visible.uid));
  assert.ok(!actions.some(action=>action.kind==='spell'&&action.card===fixture.source.uid&&action.target===hidden.uid),
    'a Set Trap cannot be selected by Remove Trap');
  const privateText=JSON.stringify(tagPrivateMessage(fixture.record,member(0),0));
  assert.ok(!privateText.includes(getPlayableCard(SET_TRAP).englishName),
    'the hidden Trap identity must not leak through the Discord action menu');
  const current=await activate(fixture.record,fixture.source,visible,'m315-remove-trap-activate');
  const state=current.state;
  assert.ok(!state.core.players[1].backrow.some(card=>card.uid===visible.uid));
  assert.ok(state.core.players[1].grave.some(card=>card.uid===visible.uid),
    'the face-up Trap is destroyed into the opponent shared Graveyard');
  const stillHidden=state.core.players[1].backrow.find(card=>card.uid===hidden.uid);
  assert.ok(stillHidden);
  assert.equal(stillHidden.faceUp,false);
  const publicAfter=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicAfter.includes(hidden.id));
  assert.ok(!publicAfter.includes(hidden.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===fixture.source.uid));
  assertConserved(state,fixture.before);
  assertPrivateHands(state);
  assertRules(state);
  assertPublicPayload(current);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});
after(()=>{
  database.db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});