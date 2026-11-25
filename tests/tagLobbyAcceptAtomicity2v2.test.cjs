'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m509-tag-accept-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPublicMessage,tagPrivateMessage}=require('../dist/tagUI');
const {tagInventory}=require('../dist/tagDuel');
const {validateDiscordPayload}=require('../dist/discordPayload');
let serial=0;

function createLobby(){
  const run=++serial;
  const ids=[0,1,2,3].map(seat=>`m509-${run}-seat-${seat}`);
  for(const id of ids)database.createPlayer(id,id);
  return {ids,record:store.createTagLobby(ids,'m509-guild','m509-channel','normal')};
}
function customId(payload,prefix){
  return payload.components.flatMap(row=>row.components)
    .map(component=>component.data.custom_id)
    .find(id=>id.startsWith(prefix));
}
function economySnapshot(){
  return {
    players:database.db.prepare('SELECT discord_id,dp,xp,starter_deck FROM players ORDER BY discord_id').all(),
    cards:database.db.prepare('SELECT discord_id,card_key,quantity FROM player_cards ORDER BY discord_id,card_key').all(),
    grants:database.db.prepare('SELECT discord_id,starter_deck,catalog_version FROM starter_grants ORDER BY discord_id').all()
  };
}
function interaction(id,actor,guild='m509-guild'){
  const result={deferred:false,edits:[]};
  const events=[];
  return {
    result,events,
    value:{
      id:`m509-interaction-${++serial}`,
      customId:id,
      guildId:guild,
      user:{id:actor},
      async deferUpdate(){events.push('ack');result.deferred=true;},
      async editReply(payload){
        assert.equal(result.deferred,true,'Discord acknowledgement must precede panel edit');
        events.push('edit');
        result.edits.push(payload);
        return payload;
      }
    }
  };
}
async function acceptSeat(recordId,actor){
  const current=store.getTag(recordId);
  const id=customId(tagPublicMessage(current),'tag:accept:');
  assert.ok(id,'current public panel must expose the current Accept revision');
  const fake=interaction(id,actor);
  const deferred=[];
  const refreshed=[];
  await handleTagComponent(
    fake.value,
    async next=>refreshed.push(next),
    kind=>deferred.push(kind),
    {public:async next=>tagPublicMessage(next)}
  );
  return {fake,deferred,refreshed,current,next:store.getTag(recordId)};
}

test('M509 an invited participant cannot accept a lobby from another guild',async()=>{
  const {ids,record}=createLobby();
  const before=economySnapshot();
  const id=customId(tagPublicMessage(record),'tag:accept:');
  assert.ok(id);
  const fake=interaction(id,ids[1],'another-guild');
  const refreshed=[];
  await assert.rejects(
    handleTagComponent(
      fake.value,
      async next=>refreshed.push(next),
      kind=>fake.events.push(`defer-callback:${kind}`),
      {public:async next=>tagPublicMessage(next)}
    ),
    /Esta partida pertence a outro servidor/
  );

  const after=store.getTag(record.id);
  assert.equal(fake.result.deferred,false,'guild authorization must fail before Discord acknowledgement');
  assert.deepEqual(fake.events,[]);
  assert.equal(after.revision,record.revision);
  assert.equal(after.status,'lobby');
  assert.equal(after.members[1].accepted,false);
  assert.equal(store.currentTag(ids[1]),undefined,'cross-guild acceptance must not acquire a participant lock');
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(record.id).n,1);
  assert.deepEqual(refreshed,[]);
  assert.deepEqual(economySnapshot(),before);
});

test('M509 a participant cannot confirm the same invitation twice at the current revision',async()=>{
  const {ids,record}=createLobby();
  const first=await acceptSeat(record.id,ids[1]);
  assert.equal(first.next.revision,1);
  assert.equal(first.next.members[1].accepted,true);
  assert.deepEqual(first.deferred,['update']);
  assert.equal(first.fake.result.edits.length,1);
  assert.equal(first.refreshed.length,1);

  const current=store.getTag(record.id);
  const duplicateId=customId(tagPublicMessage(current),'tag:accept:');
  assert.ok(duplicateId);
  const duplicate=interaction(duplicateId,ids[1]);
  const refreshed=[];
  await assert.rejects(
    handleTagComponent(
      duplicate.value,
      async next=>refreshed.push(next),
      kind=>duplicate.events.push(`defer-callback:${kind}`),
      {public:async next=>tagPublicMessage(next)}
    ),
    /Você já confirmou/
  );

  const after=store.getTag(record.id);
  assert.equal(duplicate.result.deferred,true);
  assert.deepEqual(duplicate.events,['ack','defer-callback:update']);
  assert.equal(duplicate.result.edits.length,0);
  assert.deepEqual(refreshed,[]);
  assert.equal(after.revision,1);
  assert.equal(after.members[1].accepted,true);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(record.id).n,2,
    'the host and one accepted participant each keep exactly one lock');
  assert.equal(store.currentTag(ids[1]).id,record.id);
  assert.equal(store.currentTag(ids[2]),undefined);
});

test('M509 final consent rolls back its lock and lobby state when persistence fails, then retries exactly once',async()=>{
  const {ids,record}=createLobby();
  await acceptSeat(record.id,ids[1]);
  await acceptSeat(record.id,ids[2]);
  const beforeEconomy=economySnapshot();
  const before=store.getTag(record.id);
  assert.equal(before.revision,2);
  assert.equal(before.status,'lobby');
  assert.equal(before.state,null);
  assert.equal(before.members[3].accepted,false);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(record.id).n,3);

  database.db.exec(`
    CREATE TRIGGER m509_abort_final_accept
    BEFORE UPDATE ON tag_sessions
    WHEN NEW.id='${record.id}' AND NEW.status='playing'
    BEGIN SELECT RAISE(ABORT,'m509 injected finalization failure'); END;
  `);

  const failedId=customId(tagPublicMessage(before),'tag:accept:');
  assert.ok(failedId);
  const failed=interaction(failedId,ids[3]);
  const failedRefresh=[];
  await assert.rejects(
    handleTagComponent(
      failed.value,
      async next=>failedRefresh.push(next),
      kind=>failed.events.push(`defer-callback:${kind}`),
      {public:async next=>tagPublicMessage(next)}
    ),
    /m509 injected finalization failure/
  );

  const rolledBack=store.getTag(record.id);
  assert.equal(failed.result.deferred,true,'the interaction is acknowledged before the transactional write');
  assert.deepEqual(failed.events,['ack','defer-callback:update']);
  assert.equal(failed.result.edits.length,0);
  assert.deepEqual(failedRefresh,[]);
  assert.equal(rolledBack.revision,2);
  assert.equal(rolledBack.status,'lobby');
  assert.equal(rolledBack.state,null);
  assert.equal(rolledBack.members[3].accepted,false);
  assert.equal(store.currentTag(ids[3]),undefined,'failed final consent must not leave an orphan participant lock');
  assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_members WHERE session_id=?').get(record.id).n,3);
  for(const id of ids.slice(0,3))assert.equal(store.currentTag(id).id,record.id);
  assert.deepEqual(economySnapshot(),beforeEconomy);

  database.db.exec('DROP TRIGGER m509_abort_final_accept');
  const retry=interaction(failedId,ids[3]);
  const refreshed=[];
  await handleTagComponent(
    retry.value,
    async next=>refreshed.push(next),
    kind=>retry.events.push(`defer-callback:${kind}`),
    {public:async next=>tagPublicMessage(next)}
  );

  const completed=store.getTag(record.id);
  assert.deepEqual(retry.events,['ack','defer-callback:update','edit']);
  assert.equal(retry.result.edits.length,1);
  assert.equal(refreshed.length,1);
  assert.equal(completed.revision,3);
  assert.equal(completed.status,'playing');
  assert.equal(completed.state.mode,'tag-normal-lab');
  assert.ok(completed.members.every(member=>member.accepted));
  const inventory=tagInventory(completed.state);
  assert.equal(inventory.length,120);
  assert.equal(new Set(inventory.map(card=>card.uid)).size,120);
  validateDiscordPayload(retry.result.edits[0]);
  for(const id of ids)validateDiscordPayload(tagPrivateMessage(completed,id));
  for(const id of ids)assert.equal(store.currentTag(id).id,record.id);
  assert.deepEqual(economySnapshot(),beforeEconomy,
    'final consent borrows four physical decks without changing player cards, grants or balances');
});

after(()=>{
  if(database.db.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
