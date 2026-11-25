'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m508-tag-accept-'));
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
  const ids=[0,1,2,3].map(seat=>`m508-${run}-seat-${seat}`);
  for(const id of ids)database.createPlayer(id,id);
  return {ids,record:store.createTagLobby(ids,'m508-guild','m508-channel','normal')};
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
function interaction(id,actor,beforeAck,events){
  const result={deferred:false,edits:[]};
  return {
    result,
    value:{
      id:`m508-interaction-${++serial}`,
      customId:id,
      guildId:'m508-guild',
      user:{id:actor},
      async deferUpdate(){
        events.push('ack');
        if(beforeAck)beforeAck();
        result.deferred=true;
      },
      async editReply(payload){
        assert.equal(result.deferred,true,'Discord acknowledgement must precede panel edit');
        events.push('edit');
        result.edits.push(payload);
        return payload;
      }
    }
  };
}

test('M508 only an invited participant in the correct guild may accept; outsiders are rejected before acknowledgement',async()=>{
  const {ids,record}=createLobby();
  const accept=customId(tagPublicMessage(record),'tag:accept:');
  assert.ok(accept);
  const events=[];
  const fake=interaction(accept,'m508-outsider',()=>assert.equal(store.getTag(record.id).revision,record.revision),events);
  await assert.rejects(
    handleTagComponent(fake.value,async()=>{events.push('refresh');},()=>events.push('defer-callback'),{public:async next=>tagPublicMessage(next)}),
    /não participa/
  );
  assert.equal(fake.result.deferred,false);
  assert.deepEqual(events,[]);
  assert.equal(store.getTag(record.id).revision,record.revision);
  for(const id of ids.slice(1))assert.equal(store.currentTag(id),undefined);
});

test('M508 the real Accept button commits each consent once and starts the four-seat normal laboratory on the final consent',async()=>{
  const {ids,record}=createLobby();
  const beforeEconomy=economySnapshot();
  let current=record;

  for(const seat of [1,2,3]){
    current=store.getTag(record.id);
    const accept=customId(tagPublicMessage(current),'tag:accept:');
    assert.ok(accept,'the current public panel must emit the current revision Accept button');
    const actor=ids[seat];
    const events=[];
    const fake=interaction(accept,actor,()=>{
      const atAck=store.getTag(record.id);
      assert.equal(atAck.revision,current.revision,'acknowledgement precedes mutation');
      assert.equal(atAck.members[seat].accepted,false);
    },events);
    const deferred=[];
    const refreshed=[];
    await handleTagComponent(
      fake.value,
      async next=>{events.push('refresh');refreshed.push(next);},
      kind=>{events.push('defer-callback:'+kind);deferred.push(kind);},
      {public:async next=>tagPublicMessage(next)}
    );

    const next=store.getTag(record.id);
    assert.deepEqual(deferred,['update']);
    assert.equal(next.revision,current.revision+1);
    assert.equal(next.members[seat].accepted,true);
    assert.equal(fake.result.edits.length,1);
    assert.equal(refreshed.length,1);
    assert.equal(refreshed[0].revision,next.revision);
    assert.deepEqual(events,['ack','defer-callback:update','edit','refresh']);

    if(seat<3){
      assert.equal(next.status,'lobby');
      assert.equal(next.state,null);
      assert.equal(store.currentTag(actor).id,record.id);
      const nextAccept=customId(fake.result.edits[0],'tag:accept:');
      assert.ok(nextAccept,'remaining invited seats keep a current Accept button');
    }else{
      assert.equal(next.status,'playing');
      assert.equal(next.state.mode,'tag-normal-lab');
      assert.ok(next.members.every(member=>member.accepted));
      assert.equal(tagInventory(next.state).length,120,'four borrowed 30-card decks remain physical and separate');
      const inventory=tagInventory(next.state);
      assert.equal(new Set(inventory.map(card=>card.uid)).size,inventory.length,'all physical UIDs remain unique');
      const publicPanel=fake.result.edits[0];
      validateDiscordPayload(publicPanel);
      assert.equal(customId(publicPanel,'tag:accept:'),undefined,'playing panel must not retain lobby Accept buttons');
      assert.ok(customId(publicPanel,'tag:open:'));
      for(const id of ids)validateDiscordPayload(tagPrivateMessage(next,id));
    }
    current=next;
  }

  assert.deepEqual(economySnapshot(),beforeEconomy,'consent and borrowed normal decks do not alter player collections, grants or balances');
  for(const id of ids)assert.equal(store.currentTag(id).id,record.id,'all four accepted seats remain locked by the playing match');
});

test('M508 a stale Accept custom_id fails closed without accepting or locking the next seat',async()=>{
  const {ids,record}=createLobby();
  const stale=customId(tagPublicMessage(record),'tag:accept:');
  assert.ok(stale);
  const firstEvents=[];
  const first=interaction(stale,ids[1],()=>assert.equal(store.getTag(record.id).revision,0),firstEvents);
  await handleTagComponent(first.value,async()=>{},()=>{},{public:async next=>tagPublicMessage(next)});
  const current=store.getTag(record.id);
  assert.equal(current.revision,1);
  assert.equal(current.members[1].accepted,true);

  const staleEvents=[];
  const attempt=interaction(stale,ids[2],()=>assert.equal(store.getTag(record.id).revision,1),staleEvents);
  await assert.rejects(
    handleTagComponent(attempt.value,async()=>{staleEvents.push('refresh');},()=>staleEvents.push('defer-callback'),{public:async next=>tagPublicMessage(next)}),
    /Convite atualizado/
  );
  const after=store.getTag(record.id);
  assert.equal(attempt.result.deferred,true,'the stale component is acknowledged before the revision check');
  assert.deepEqual(staleEvents,['ack','defer-callback']);
  assert.equal(after.revision,1);
  assert.equal(after.members[2].accepted,false);
  assert.equal(store.currentTag(ids[2]),undefined,'stale Accept must not acquire a participant lock');
});

after(()=>{
  if(database.db.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
