'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m213-tag-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const CASES=[
  {id:'84257639',name:'Dian Keto the Cure Master',kind:'heal',amount:1000,lp:[4500,4100],expected:[5500,4100]},
  {id:'19523799',name:'Ookazi',kind:'burn',amount:800,lp:[4000,4000],expected:[4000,3200]}
];
for(const entry of CASES){
  assert.equal(getPlayableCard(entry.id)?.kind,'spell',entry.name+' must be certified and playable');
  assert.equal(getEffect(entry.id)?.kind,entry.kind,entry.name+' must use its registered LP operation');
  assert.equal(getEffect(entry.id)?.amount,entry.amount,entry.name+' must preserve its exact LP value');
}
const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(x=>x.card&&x.card.kind==='monster'&&Number.isInteger(x.card.atk)&&Number.isInteger(x.card.defense));
assert.ok(normal.length>=7,'the Discord fixture needs seven certified Normal Monsters');
const normalIds=normal.slice(0,7).map(x=>x.id);

function member(caseKey,seat){return 'm213-'+caseKey+'-seat-'+seat;}
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
function snapshots(state,caseKey){
  const hands=new Map([0,1,2,3].map(seat=>[
    seat,tag.tagMemberHand(state,member(caseKey,seat)).map(card=>card.uid)
  ]));
  const decks=new Map([0,1,2,3].map(seat=>[
    seat,holder(state,seat).deck.map(card=>card.uid)
  ]));
  return {hands,decks};
}
function setup(entry,caseKey){
  const ids=[0,1,2,3].map(seat=>member(caseKey,seat));
  for(const id of ids)database.createPlayer(id,id);
  const guild='m213-guild-'+caseKey,channel='m213-channel-'+caseKey;
  let lobby=store.createTagLobby(ids,guild,channel,'classic-loan');
  for(const id of ids.slice(1))lobby=store.acceptTag(lobby.id,id,guild,lobby.revision);
  const players=ids.map((id,seat)=>({
    id,name:'M213 '+caseKey+' Seat '+seat,
    cards:deck(seat===0?[entry.id]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m213-'+caseKey});
  const spell=ensureInHand(state,0,entry.id);
  state.core.turn=3;
  state.core.players[0].lp=entry.lp[0];
  state.core.players[1].lp=entry.lp[1];
  assert.match(spell.uid,/^m0:/,entry.name+' must retain active physical seat 0 ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const revision=7,updated=Date.now();
  database.db.prepare('UPDATE tag_sessions SET state=?,revision=?,updated=?,status=?,rules=? WHERE id=?')
    .run(JSON.stringify(state),revision,updated,'playing','classic-loan',lobby.id);
  const record=store.getTag(lobby.id);
  assert.equal(record.revision,revision);
  assert.equal(record.state.core.phase,'main');
  const before=snapshots(record.state,caseKey);
  return {record,spell,before,guild,actor:member(caseKey,0)};
}
function interaction(sessionId,requestId,customId,actor,index,expectedRevision,guildId){
  const calls=[];
  return {
    id:requestId,guildId,user:{id:actor},customId,values:[String(index)],
    isButton:()=>false,isStringSelectMenu:()=>true,
    deferUpdate:async()=>{
      assert.equal(store.getTag(sessionId).revision,expectedRevision,
        'Discord acknowledgement must observe the persisted revision before mutation');
      calls.push('defer');
    },
    editReply:async payload=>{
      calls.push('edit');
      validateDiscordPayload(payload);
    },
    calls
  };
}
function assertPrivateHands(state,caseKey,hands,consumedUid){
  for(const seat of [0,1,2,3]){
    const expected=hands.get(seat).filter(uid=>!(seat===0&&uid===consumedUid));
    assert.deepEqual(tag.tagMemberHand(state,member(caseKey,seat)).map(card=>card.uid),expected,
      'Discord action must consume only the selected active physical hand card');
  }
}
function assertDecks(state,caseKey,decks){
  for(const seat of [0,1,2,3]){
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),decks.get(seat),
      'Discord action must not borrow or mutate physical seat '+seat+' Deck');
  }
}
async function submit(record,entry,actor,index,requestId,expectedRevision,guildId){
  const customId='tag:act:'+record.id+':'+record.revision+':'+actor;
  const i=interaction(record.id,requestId,customId,actor,index,expectedRevision,guildId);
  let refreshes=0;
  const refresh=async next=>{
    refreshes++;
    validateDiscordPayload(tagPublicMessage(next));
  };
  await handleTagComponent(i,refresh,()=>{});
  assert.deepEqual(i.calls,['defer','edit'],'Discord must acknowledge before editing the private response');
  assert.ok(refreshes>=1,'the public 2v2 panel must be refreshed after the interaction');
  return i;
}
for(const entry of CASES){
  test(entry.name+' commits through the real offline Discord 2v2 handler exactly once',async()=>{
    const {record,spell,before,guild,actor}=setup(entry,entry.id);
    const actions=tag.tagActions(record.state,actor);
    const index=actions.findIndex(action=>action.kind==='spell'&&action.card===spell.uid);
    assert.ok(index>=0,'the real 2v2 action list must include '+entry.name);
    const page=Math.floor(index/20);
    const privatePanel=tagPrivateMessage(record,actor,page);
    validateDiscordPayload(privatePanel);
    const rows=privatePanel.components.map(row=>row.toJSON());
    const menus=rows.flatMap(row=>row.components||[]);
    const menu=menus.find(component=>component.custom_id==='tag:act:'+record.id+':'+record.revision+':'+actor);
    assert.ok(menu,'the private Discord panel must expose the real action select menu');
    assert.ok(menu.options.some(option=>option.value===String(index)&&option.label.includes(entry.name)),
      'the private menu must show the exact Spell and action index selected by the engine');

    const originalRevision=record.revision,requestId='m213-request-'+entry.id;
    await submit(record,entry,actor,index,requestId,originalRevision,guild);
    let current=store.getTag(record.id);
    assert.equal(current.revision,originalRevision+1,'one interaction must commit exactly one session revision');
    assert.deepEqual(current.state.core.players.map(player=>player.lp),entry.expected,
      entry.name+' must apply the exact shared-team LP change through the Discord handler');
    assert.ok(current.state.core.players[0].grave.some(card=>card.uid===spell.uid&&card.id===entry.id),
      'the resolved Spell must enter the shared Graveyard with its original physical UID');
    assertPrivateHands(current.state,entry.id,before.hands,spell.uid);
    assertDecks(current.state,entry.id,before.decks);
    assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
    const receipt=database.db.prepare('SELECT request_id,committed_revision FROM tag_action_receipts WHERE request_id=?').get(requestId);
    assert.deepEqual(receipt,{request_id:requestId,committed_revision:originalRevision+1});
    const privateAfter=tagPrivateMessage(current,actor);
    validateDiscordPayload(privateAfter);
    const afterRows=privateAfter.components.map(row=>row.toJSON());
    const afterOptions=afterRows.flatMap(row=>row.components||[]).flatMap(component=>component.options||[]);
    assert.ok(!afterOptions.some(option=>option.label.includes(entry.name)),
      'the consumed Spell must disappear from the active player private action menu');

    const stateBeforeDuplicate=JSON.stringify(current.state);
    await submit(record,entry,actor,index,requestId,current.revision,guild);
    current=store.getTag(record.id);
    assert.equal(current.revision,originalRevision+1,'duplicate delivery must not commit another revision');
    assert.deepEqual(current.state.core.players.map(player=>player.lp),entry.expected,
      'duplicate delivery must not apply the LP effect a second time');
    assert.equal(JSON.stringify(current.state),stateBeforeDuplicate,'duplicate delivery must leave the duel state byte-for-byte stable');
    assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_action_receipts WHERE request_id=?').get(requestId).n,1,
      'one Discord request must produce exactly one idempotency receipt');
  });
}
after(()=>{database.db.close();fs.rmSync(dir,{recursive:true,force:true});});
