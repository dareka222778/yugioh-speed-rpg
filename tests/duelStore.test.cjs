const {test,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'duel-store-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
let db=require('../dist/database'),deck=require('../dist/decks'),store=require('../dist/duelStore');const {legalActions}=require('../dist/duelEngine');
for(const id of ['101','102','103','104']){db.createPlayer(id,'Player '+id);db.chooseStarterDeck(id,'warrior');deck.openDeck(id);deck.activateDeck(id,1);}
test('invitation consent, scope, duplicate locks, active deck snapshot and player data preservation',()=>{
 const before=db.getPlayer('101'),collection=db.getCollection('101');const invitation=store.challenge('101','102','g','c');assert.equal(invitation.status,'pending');assert.throws(()=>store.challenge('101','103','g','c'),/já tem/);
 assert.throws(()=>store.acceptChallenge(invitation.id,'103','g',0),/convidado/);assert.throws(()=>store.acceptChallenge(invitation.id,'102','other',0),/expirou/);
 const started=store.acceptChallenge(invitation.id,'102','g',0);assert.equal(started.status,'playing');assert.ok(store.currentDuel('102'));assert.throws(()=>store.acceptChallenge(invitation.id,'102','g',0),/expirou/);
 const removed=deck.openDeck('101').items[0].card_key;deck.changeDeck('101',1,removed,-1);assert.equal(store.getDuel(started.id).state.players[0].hand.length+store.getDuel(started.id).state.players[0].deck.length,20);
 assert.deepEqual(db.getPlayer('101'),before);assert.deepEqual(db.getCollection('101'),collection);deck.changeDeck('101',1,removed,1);deck.activateDeck('101',1);
 const ended=store.performDuelAction(started.id,'101','g',started.revision,{kind:'concede'});assert.equal(ended.status,'finished');assert.equal(store.currentDuel('101'),undefined);assert.equal(store.currentDuel('102'),undefined);
});
test('invalid deck blocks training, revisions reject stale/double/outsider actions, cancel releases locks',()=>{
 assert.throws(()=>store.createTraining('999','g','c'),/Ative/);const inv=store.challenge('101','102','g','c');const r=store.acceptChallenge(inv.id,'102','g',0);const actor=r.state.players[r.state.current].id;
 assert.throws(()=>store.performDuelAction(r.id,actor,'wrong',r.revision,0),/servidor/);assert.throws(()=>store.performDuelAction(r.id,'103','g',r.revision,0),/inválida/);
 const next=store.performDuelAction(r.id,actor,'g',r.revision,0);assert.equal(next.revision,r.revision+1);assert.throws(()=>store.performDuelAction(r.id,actor,'g',r.revision,0),/antigo/);store.performDuelAction(r.id,actor,'g',next.revision,{kind:'concede'});
 const cancel=store.challenge('101','102','g','c');store.declineChallenge(cancel.id,'102','g');assert.equal(store.currentDuel('101'),undefined);
});
test('expired invitations and sessions release locks; failed acceptance rolls back all state',()=>{
 const r=store.challenge('101','102','g','c');db.db.prepare('UPDATE duels SET updated=0 WHERE id=?').run(r.id);assert.equal(store.getDuel(r.id).status,'expired');assert.equal(store.currentDuel('101'),undefined);
 const x=store.challenge('101','102','g','c');db.db.exec("CREATE TRIGGER fail_join BEFORE INSERT ON duel_members WHEN NEW.owner='102' BEGIN SELECT RAISE(ABORT,'simulated failure'); END");assert.throws(()=>store.acceptChallenge(x.id,'102','g',0),/simulated/);assert.equal(store.getDuel(x.id).status,'pending');assert.equal(store.currentDuel('102'),undefined);db.db.exec('DROP TRIGGER fail_join');store.declineChallenge(x.id,'101','g');
 const active=store.createTraining('101','g','c');db.db.prepare('UPDATE duels SET updated=0 WHERE id=?').run(active.id);assert.equal(store.getDuel(active.id).status,'finished');assert.match(store.getDuel(active.id).state.reason,/W.O./);assert.equal(store.currentDuel('101'),undefined);
});
test('training finishes against NPC, preserves economy, survives reopen and never uses another players session',()=>{
 let r=store.createTraining('103','g','c');store.setDuelMessage(r.id,'c','message-1');const saved=store.getDuel(r.id);
 db.db.close();for(const f of ['duelStore','decks','database'])delete require.cache[require.resolve('../dist/'+f)];db=require('../dist/database');deck=require('../dist/decks');store=require('../dist/duelStore');assert.deepEqual(store.getDuel(r.id),saved);assert.equal(store.currentDuel('104'),undefined);
 const balance=db.getPlayer('103').dp;let steps=0;while(r.status==='playing'&&steps++<1000){const a=store.chooseNPC(r.state,'103');assert.ok(a);const all=legalActions(r.state,'103');const index=all.findIndex(x=>JSON.stringify(x)===JSON.stringify(a));r=store.performDuelAction(r.id,'103','g',r.revision,index);}
 assert.equal(r.status,'finished');assert.equal(db.getPlayer('103').dp,balance);assert.equal(store.currentDuel('103'),undefined);
});
after(()=>{db.db.close();fs.rmSync(temp,{recursive:true,force:true});});
