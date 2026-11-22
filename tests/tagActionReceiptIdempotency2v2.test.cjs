'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m514-tag-receipt-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {tagDecisionMember,tagActions,tagInventory}=require('../dist/tagDuel');
const {validateDiscordPayload}=require('../dist/discordPayload');
let serial=0;

function createPlayingDuel(){
  const run=++serial;
  const ids=[0,1,2,3].map(seat=>`m514-${run}-seat-${seat}`);
  for(const id of ids)database.createPlayer(id,id);
  let record=store.createTagLobby(ids,'m514-guild','m514-channel','normal');
  for(const id of ids.slice(1))record=store.acceptTag(record.id,id,record.guild,record.revision);
  assert.equal(record.status,'playing');
  return {ids,record};
}
function customId(payload,prefix){
  return payload.components.flatMap(row=>row.components)
    .map(component=>component.data.custom_id)
    .find(id=>id.startsWith(prefix));
}
function interaction(id,requestId,actor,values){
  const result={deferred:false,edits:[]};
  const events=[];
  return {
    result,events,
    value:{
      id:requestId,
      customId:id,
      guildId:'m514-guild',
      user:{id:actor},
      values,
      async deferUpdate(){events.push('ack');result.deferred=true;},
      async editReply(payload){
        assert.equal(result.deferred,true,'Discord acknowledgement must precede action execution');
        events.push('edit');
        validateDiscordPayload(payload);
        result.edits.push(payload);
        return payload;
      }
    }
  };
}
function stateSnapshot(record){
  const current=store.getTag(record.id);
  return {
    revision:current.revision,
    status:current.status,
    state:current.state,
    receipts:database.db.prepare('SELECT request_id,duel_id,actor,guild_id,expected_revision,action_json,committed_revision FROM tag_action_receipts ORDER BY request_id').all(),
    events:database.db.prepare('SELECT session_id,revision,events_json FROM tag_transition_events WHERE session_id=? ORDER BY revision').all(record.id),
    inventory:tagInventory(current.state).map(card=>[card.uid,card.id]).sort((a,b)=>a[0].localeCompare(b[0]))
  };
}

test('M514 duplicate Discord delivery replays one TagDuel action receipt without advancing the duel twice',async()=>{
  const {ids,record}=createPlayingDuel();
  const actor=tagDecisionMember(record.state).id;
  const actions=tagActions(record.state,actor);
  assert.ok(actions.length>1,'the active physical seat must have at least two legal actions for request-ID binding');
  const actionIndex=0;
  const alternateIndex=1;
  const panel=tagPrivateMessage(record,actor);
  const actionId=customId(panel,'tag:act:');
  assert.ok(actionId,'active private panel must emit an action select component');
  const revision=record.revision;
  const requestId='m514-idempotent-request-'+record.id;
  const first=interaction(actionId,requestId,actor,[String(actionIndex)]);
  const firstRefresh=[];
  const firstDeferred=[];
  await handleTagComponent(
    first.value,
    async next=>firstRefresh.push(next.revision),
    kind=>firstDeferred.push(kind),
    {public:async next=>tagPublicMessage(next),private:async(next,owner)=>tagPrivateMessage(next,owner)}
  );

  const afterFirst=stateSnapshot(record);
  assert.equal(afterFirst.revision,revision+1);
  assert.equal(afterFirst.receipts.length,1);
  assert.equal(afterFirst.receipts[0].request_id,requestId);
  assert.equal(afterFirst.receipts[0].expected_revision,revision);
  assert.equal(afterFirst.receipts[0].committed_revision,revision+1);
  assert.deepEqual(firstDeferred,['update']);
  assert.deepEqual(first.events,['ack','edit']);
  assert.equal(first.result.edits.length,1);
  assert.deepEqual(firstRefresh,[revision+1]);

  // The handler/store reload the committed JSON state before a duplicate delivery.
  const reloaded=store.getTag(record.id);
  assert.equal(reloaded.revision,revision+1);
  assert.deepEqual(reloaded.state,afterFirst.state);

  const duplicate=interaction(actionId,requestId,actor,[String(actionIndex)]);
  const duplicateRefresh=[];
  const duplicateDeferred=[];
  await handleTagComponent(
    duplicate.value,
    async next=>duplicateRefresh.push(next.revision),
    kind=>duplicateDeferred.push(kind),
    {public:async next=>tagPublicMessage(next),private:async(next,owner)=>tagPrivateMessage(next,owner)}
  );

  const afterDuplicate=stateSnapshot(record);
  assert.deepEqual(afterDuplicate,afterFirst,'same request ID and payload must not mutate or duplicate events/receipt');
  assert.deepEqual(duplicateDeferred,['update']);
  assert.deepEqual(duplicate.events,['ack','edit']);
  assert.equal(duplicate.result.edits.length,1);
  assert.deepEqual(duplicateRefresh,[revision+1]);

  const reused=interaction(actionId,requestId,actor,[String(alternateIndex)]);
  const reusedRefresh=[];
  await assert.rejects(
    handleTagComponent(
      reused.value,
      async next=>reusedRefresh.push(next.revision),
      kind=>reused.events.push('defer-callback:'+kind),
      {public:async next=>tagPublicMessage(next),private:async(next,owner)=>tagPrivateMessage(next,owner)}
    ),
    /Identificador de ação já utilizado por outra solicitação/
  );
  assert.equal(reused.result.deferred,true);
  assert.deepEqual(reused.events,['ack','defer-callback:update']);
  assert.equal(reused.result.edits.length,0);
  assert.deepEqual(reusedRefresh,[]);
  assert.deepEqual(stateSnapshot(record),afterFirst,'reusing a request ID for a different action must fail closed');

  const stale=interaction(actionId,'m514-stale-new-request-'+record.id,actor,[String(actionIndex)]);
  const staleRefresh=[];
  await assert.rejects(
    handleTagComponent(
      stale.value,
      async next=>staleRefresh.push(next.revision),
      kind=>stale.events.push('defer-callback:'+kind),
      {public:async next=>tagPublicMessage(next),private:async(next,owner)=>tagPrivateMessage(next,owner)}
    ),
    /Painel desatualizado/
  );
  assert.equal(stale.result.deferred,true);
  assert.deepEqual(stale.events,['ack','defer-callback:update']);
  assert.equal(stale.result.edits.length,0);
  assert.deepEqual(staleRefresh,[]);
  assert.deepEqual(stateSnapshot(record),afterFirst,'a new request with an obsolete revision must fail without mutation');
});

after(()=>{
  if(database.db.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
