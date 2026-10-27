const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'card-events-'));process.env.DATABASE_PATH=path.join(tmp,'game.sqlite');
const database=require('../dist/database'),events=require('../dist/cardEvents');const admin={guild:'g',actor:'admin',admin:true},now=100000;
for(const id of ['one','two'])database.createPlayer(id,id);
const make=(quota=2,hours=1)=>events.createCardEvent(admin,'Especial','89631139:1,07089711:2',quota,hours,now);
test('drafts do not distribute; explicit creator confirmation activates the exact package',()=>{
 const event=make(),before=database.getCollection('one');assert.throws(()=>events.grantEventCards(admin,event.id,'one',now),/ativo/);assert.deepEqual(database.getCollection('one'),before);assert.throws(()=>events.activateCardEvent({...admin,actor:'another'},event.id,now),/criou/);assert.equal(events.activateCardEvent(admin,event.id,now).status,'active');
 const receipt=events.grantEventCards(admin,event.id,'one',now);assert.equal(receipt.duplicate,false);assert.equal(database.getCollection('one').find(c=>c.card_key==='89631139').quantity,1);assert.equal(database.getCollection('one').find(c=>c.card_key==='07089711').quantity,2);const after=database.getCollection('one');assert.equal(events.grantEventCards(admin,event.id,'one',now).duplicate,true);assert.deepEqual(database.getCollection('one'),after);
});
test('permissions and server boundaries are checked for every event operation',()=>{
 const event=make();assert.throws(()=>events.createCardEvent({...admin,admin:false},'x','89631139:1',1,1,now),/administrador/);assert.throws(()=>events.activateCardEvent({...admin,guild:'other'},event.id,now),/servidor/);assert.throws(()=>events.grantEventCards({...admin,admin:false},event.id,'one',now),/administrador/);assert.throws(()=>events.closeCardEvent({...admin,admin:false},event.id),/administrador/);
});
test('quota, expiration and closure block new deliveries without revoking old cards',()=>{
 const event=make(1);events.activateCardEvent(admin,event.id,now);events.grantEventCards(admin,event.id,'one',now);assert.throws(()=>events.grantEventCards(admin,event.id,'two',now),/limite/);const inventory=database.getCollection('one');events.closeCardEvent(admin,event.id);assert.throws(()=>events.grantEventCards(admin,event.id,'two',now),/ativo/);assert.deepEqual(database.getCollection('one'),inventory);
 const expired=make();assert.throws(()=>events.activateCardEvent(admin,expired.id,now+3600000),/expirado/);const active=make();events.activateCardEvent(admin,active.id,now);assert.throws(()=>events.grantEventCards(admin,active.id,'two',now+3600000),/expirou/);
});
test('invalid or unsupported card packages and repeated excess quantities are rejected',()=>{
 for(const text of ['', '89631139:0','89631139:4','07089711:2,07089711:2','71625222:1','89631139','abc:1'])assert.throws(()=>events.parseEventCards(text));assert.deepEqual(events.parseEventCards('07089711:1,07089711:2'),[{id:'07089711',quantity:3}]);
});
test('a failed inventory write rolls back every card and the receipt; a retry credits only once',()=>{
 const event=make();events.activateCardEvent(admin,event.id,now);const before=database.getCollection('two');database.db.exec("CREATE TRIGGER fail_event BEFORE INSERT ON player_cards WHEN NEW.discord_id='two' AND NEW.card_key='07089711' BEGIN SELECT RAISE(ABORT,'event write failed'); END");assert.throws(()=>events.grantEventCards(admin,event.id,'two',now),/event write failed/);assert.deepEqual(database.getCollection('two'),before);assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM card_event_receipts WHERE event_id=?').get(event.id).n,0);database.db.exec('DROP TRIGGER fail_event');assert.equal(events.grantEventCards(admin,event.id,'two',now).duplicate,false);assert.equal(events.grantEventCards(admin,event.id,'two',now).duplicate,true);
});
test('Mission 3 certification never authorizes distribution, including preexisting staged event rows',()=>{
 const {historicalNormalBatch}=require('../dist/historicalNormalBatch'),before=database.getCollection('two');
 for(const card of historicalNormalBatch)assert.throws(()=>events.parseEventCards(card.id+':1'));
 const event=make();database.db.prepare('UPDATE card_events SET cards=? WHERE id=?').run(JSON.stringify([{id:historicalNormalBatch[0].id,quantity:1}]),event.id);events.activateCardEvent(admin,event.id,now);assert.throws(()=>events.grantEventCards(admin,event.id,'two',now),/habilitada/);assert.deepEqual(database.getCollection('two'),before);assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM card_event_receipts WHERE event_id=?').get(event.id).n,0);
});
after(()=>{database.db.close();fs.rmSync(tmp,{recursive:true,force:true});});
