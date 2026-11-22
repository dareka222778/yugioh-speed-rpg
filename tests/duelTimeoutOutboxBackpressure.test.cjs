'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m529-duel-timeout-outbox-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const store=require('../dist/duelStore');
const db=database.db;
const TOTAL=205,GUILD='m529-guild',CHANNEL='m529-channel';

function seedTerminalOutbox(){
  const insert=db.prepare('INSERT INTO duels (id,guild_id,channel_id,message_id,status,revision,updated,state,invite,public_revision) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const ids=[];
  const now=Date.now();
  const tx=db.transaction(()=>{
    for(let index=0;index<TOTAL;index++){
      const id='m529-terminal-'+String(index).padStart(3,'0');
      insert.run(id,GUILD,CHANNEL,'m529-message-'+index,'expired',1,now,null,null,0);
      ids.push(id);
    }
  });
  tx();
  return ids;
}
function publicRevision(id){
  return db.prepare('SELECT public_revision FROM duels WHERE id=?').get(id).public_revision;
}

test('205 terminal 1v1 revisions drain in bounded 100/100/5 batches without loss, duplication or starvation',()=>{
  const expected=new Set(seedTerminalOutbox());
  const delivered=new Set();
  const sizes=[];
  for(let page=0;page<4;page++){
    const batch=store.expireDueDuels(Date.now());
    sizes.push(batch.length);
    assert.ok(batch.length<=100,'each publisher poll respects the 100-record bound');
    for(const record of batch){
      assert.equal(record.status,'expired');
      assert.equal(record.revision,1);
      assert.ok(expected.has(record.id),'the outbox never returns an unknown record');
      assert.equal(delivered.has(record.id),false,'a revision is not delivered twice before its ACK');
      delivered.add(record.id);
      store.markDuelPublished(record.id,record.revision);
      assert.equal(publicRevision(record.id),record.revision);
      store.markDuelPublished(record.id,record.revision);
      assert.equal(publicRevision(record.id),record.revision,'duplicate ACKs are idempotent');
    }
  }
  assert.deepEqual(sizes,[100,100,5,0],'bounded polls drain all 205 terminal revisions as 100 + 100 + 5');
  assert.deepEqual(delivered,expected,'every terminal revision is eventually delivered exactly once');
  assert.equal(store.expireDueDuels(Date.now()).length,0,'the outbox is empty after matching ACKs');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duels WHERE status=\'expired\' AND public_revision=revision').get().n,TOTAL);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_action_receipts').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_transition_events').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players').get().n,0,'synthetic terminal outbox rows do not create players or inventory');
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
