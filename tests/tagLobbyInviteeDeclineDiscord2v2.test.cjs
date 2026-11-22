'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m513-tag-decline-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
let serial=0;

function createLobby(){
  const run=++serial;
  const ids=[0,1,2,3].map(seat=>`m513-${run}-seat-${seat}`);
  for(const id of ids)database.createPlayer(id,id);
  return {ids,record:store.createTagLobby(ids,'m513-guild','m513-channel','normal')};
}
function customId(payload,prefix){
  return payload.components.flatMap(row=>row.components)
    .map(component=>component.data.custom_id)
    .find(id=>id.startsWith(prefix));
}
function lockOwners(sessionId){
  return database.db.prepare('SELECT owner FROM tag_members WHERE session_id=? ORDER BY owner')
    .all(sessionId).map(row=>row.owner);
}
function economySnapshot(){
  return {
    players:database.db.prepare('SELECT discord_id,dp,xp,starter_deck FROM players ORDER BY discord_id').all(),
    cards:database.db.prepare('SELECT discord_id,card_key,quantity FROM player_cards ORDER BY discord_id,card_key').all(),
    grants:database.db.prepare('SELECT discord_id,starter_deck,catalog_version FROM starter_grants ORDER BY discord_id').all()
  };
}
function interaction(id,actor,beforeAck){
  const result={deferred:false,edits:[]};
  const events=[];
  return {
    result,events,
    value:{
      id:`m513-interaction-${++serial}`,
      customId:id,
      guildId:'m513-guild',
      user:{id:actor},
      async deferUpdate(){
        if(beforeAck)beforeAck();
        events.push('ack');
        result.deferred=true;
      },
      async editReply(payload){
        assert.equal(result.deferred,true,'Discord acknowledgement must precede lobby mutation/edit');
        events.push('edit');
        validateDiscordPayload(payload);
        result.edits.push(payload);
        return payload;
      }
    }
  };
}

test('M513 any invited seat may decline a partially accepted lobby; all locks release and stale cancel cannot revive it',async()=>{
  const {ids,record}=createLobby();
  const beforeEconomy=economySnapshot();
  store.acceptTag(record.id,ids[1],record.guild,record.revision);
  store.acceptTag(record.id,ids[2],record.guild,store.getTag(record.id).revision);
  const current=store.getTag(record.id);
  assert.equal(current.revision,2);
  assert.deepEqual(current.members.map(member=>member.accepted),[true,true,true,false]);
  assert.deepEqual(lockOwners(record.id),[ids[0],ids[1],ids[2]].sort());

  const cancelId=customId(tagPublicMessage(current),'tag:cancel:');
  assert.ok(cancelId,'the public lobby panel must expose the decline/cancel component');
  const events=[];
  const fake=interaction(cancelId,ids[3],()=>{
    const atAck=store.getTag(record.id);
    assert.equal(atAck.status,'lobby');
    assert.equal(atAck.revision,2);
    assert.deepEqual(lockOwners(record.id),[ids[0],ids[1],ids[2]].sort(),
      'acknowledgement must precede releasing the accepted participants');
  });
  const deferred=[];
  const refreshed=[];
  await handleTagComponent(
    fake.value,
    async next=>{events.push('refresh');refreshed.push(next);},
    kind=>{events.push('defer-callback:'+kind);deferred.push(kind);},
    {public:async next=>tagPublicMessage(next)}
  );

  const cancelled=store.getTag(record.id);
  assert.deepEqual(deferred,['update']);
  assert.deepEqual(fake.events,['ack','edit']);
  assert.deepEqual(events,['defer-callback:update','refresh']);
  assert.equal(fake.result.edits.length,1);
  assert.equal(cancelled.status,'cancelled');
  assert.equal(cancelled.revision,3);
  assert.equal(cancelled.state,null);
  assert.deepEqual(cancelled.members.map(member=>member.accepted),[true,true,true,false]);
  assert.equal(fake.result.edits[0].components.length,0);
  assert.equal(refreshed.length,1);
  assert.equal(refreshed[0].status,'cancelled');
  assert.deepEqual(lockOwners(record.id),[]);
  for(const id of ids)assert.equal(store.currentTag(id),undefined);
  assert.deepEqual(economySnapshot(),beforeEconomy);

  const stale=interaction(cancelId,ids[3]);
  const staleRefresh=[];
  await assert.rejects(
    handleTagComponent(
      stale.value,
      async next=>staleRefresh.push(next),
      kind=>stale.events.push('defer-callback:'+kind),
      {public:async next=>tagPublicMessage(next)}
    ),
    /Partida atualizada ou encerrada/
  );
  const afterReplay=store.getTag(record.id);
  assert.equal(stale.result.deferred,true);
  assert.deepEqual(stale.events,['ack','defer-callback:update']);
  assert.equal(stale.result.edits.length,0);
  assert.deepEqual(staleRefresh,[]);
  assert.equal(afterReplay.status,'cancelled');
  assert.equal(afterReplay.revision,3);
  assert.deepEqual(lockOwners(record.id),[]);
  assert.deepEqual(economySnapshot(),beforeEconomy);
});

after(()=>{
  if(database.db.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
