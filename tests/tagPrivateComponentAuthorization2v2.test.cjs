'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m511-tag-private-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/tagStore');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage,tagCardMessage}=require('../dist/tagUI');
const {tagMemberHand,tagDecisionMember}=require('../dist/tagDuel');
const {getCard}=require('../dist/collection');
const {validateDiscordPayload}=require('../dist/discordPayload');
let serial=0;

function createPlayingDuel(){
  const run=++serial;
  const ids=[0,1,2,3].map(seat=>`m511-${run}-seat-${seat}`);
  for(const id of ids)database.createPlayer(id,id);
  let record=store.createTagLobby(ids,'m511-guild','m511-channel','normal');
  for(const id of ids.slice(1))record=store.acceptTag(record.id,id,record.guild,record.revision);
  assert.equal(record.status,'playing');
  assert.equal(record.state.mode,'tag-normal-lab');
  return {ids,record};
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
function interaction(id,actor,guild='m511-guild',values=['0']){
  const result={deferred:false,edits:[]};
  const events=[];
  return {
    result,events,
    value:{
      id:`m511-interaction-${++serial}`,
      customId:id,
      guildId:guild,
      user:{id:actor},
      values,
      async deferUpdate(){events.push('ack');result.deferred=true;},
      async editReply(payload){
        assert.equal(result.deferred,true,'Discord acknowledgement must precede private panel edits');
        events.push('edit');
        result.edits.push(payload);
        return payload;
      }
    }
  };
}

test('M511 the physical owner can inspect a card through the emitted private component',async()=>{
  const {ids,record}=createPlayingDuel();
  const beforeEconomy=economySnapshot();
  const hand=tagMemberHand(record.state,ids[0]);
  assert.ok(hand.length>0);
  const inspectId=customId(tagPrivateMessage(record,ids[0]),'tag:inspect:');
  assert.ok(inspectId,'the owner private panel must emit an inspect component');
  const fake=interaction(inspectId,ids[0]);
  const deferred=[];
  const refreshed=[];
  await handleTagComponent(
    fake.value,
    async next=>refreshed.push(next),
    kind=>deferred.push(kind),
    {
      public:async next=>tagPublicMessage(next),
      card:async(next,owner,index)=>tagCardMessage(next,owner,index)
    }
  );

  assert.deepEqual(deferred,['update']);
  assert.deepEqual(fake.events,['ack','edit']);
  assert.equal(fake.result.edits.length,1);
  validateDiscordPayload(fake.result.edits[0]);
  assert.equal(fake.result.edits[0].embeds[0].data.title,getCard(hand[0].id).name);
  assert.deepEqual(refreshed,[]);
  assert.deepEqual(economySnapshot(),beforeEconomy);
});

test('M511 a same-team partner and an opponent cannot replay another seat private inspect component',async()=>{
  const {ids,record}=createPlayingDuel();
  const owner=ids[0];
  const inspectId=customId(tagPrivateMessage(record,owner),'tag:inspect:');
  assert.ok(inspectId);
  const beforeRevision=store.getTag(record.id).revision;
  const beforeHands=Object.fromEntries(ids.map(id=>[id,tagMemberHand(record.state,id).map(card=>card.uid)]));

  for(const actor of [ids[2],ids[1]]){
    const fake=interaction(inspectId,actor);
    await assert.rejects(
      handleTagComponent(
        fake.value,
        async()=>{throw new Error('unauthorized inspect must not refresh');},
        kind=>fake.events.push(`defer-callback:${kind}`),
        {card:async(next,ownerId,index)=>tagCardMessage(next,ownerId,index)}
      ),
      /Abra sua própria mão no campo/
    );
    assert.equal(fake.result.deferred,false,'owner binding must be checked before acknowledgement');
    assert.deepEqual(fake.events,[]);
    assert.equal(fake.result.edits.length,0);
  }

  const after=store.getTag(record.id);
  assert.equal(after.revision,beforeRevision);
  assert.deepEqual(Object.fromEntries(ids.map(id=>[id,tagMemberHand(after.state,id).map(card=>card.uid)])),beforeHands);
  assert.deepEqual(economySnapshot(),economySnapshot());
});

test('M511 an inactive partner cannot execute the active seat action component',async()=>{
  const {ids,record}=createPlayingDuel();
  const active=tagDecisionMember(record.state);
  const activeIndex=record.state.members.findIndex(member=>member.id===active.id);
  const partner=ids[(activeIndex+2)%4];
  const activePanel=tagPrivateMessage(record,active.id);
  const actionId=customId(activePanel,'tag:act:');
  assert.ok(actionId,'the active seat must have at least one legal action in the normal laboratory');
  const before=store.getTag(record.id);
  const fake=interaction(actionId,partner);
  await assert.rejects(
    handleTagComponent(
      fake.value,
      async()=>{throw new Error('unauthorized action must not refresh');},
      kind=>fake.events.push(`defer-callback:${kind}`),
      {public:async next=>tagPublicMessage(next),private:async(next,owner)=>tagPrivateMessage(next,owner)}
    ),
    /Abra sua própria mão no campo/
  );

  const after=store.getTag(record.id);
  assert.equal(fake.result.deferred,false);
  assert.deepEqual(fake.events,[]);
  assert.equal(after.revision,before.revision);
  assert.deepEqual(after.state, before.state,'a partner must not execute the active seat action');
});

after(()=>{
  if(database.db.open)database.db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
