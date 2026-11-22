'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m516-duel-timeout-race-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');

const database=require('../dist/database');
const decks=require('../dist/decks');
const store=require('../dist/duelStore');
const engine=require('../dist/duelEngine');
const db=database.db;
const guild='m516-guild',channel='m516-channel';
const timeout=store.DECISION_TIMEOUT_MS;

function withClock(now,work){
  const realNow=Date.now;
  Date.now=()=>now;
  try{return work();}finally{Date.now=realNow;}
}
function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
}
function startDuel(label,base){
  const owner='m516-'+label+'-owner',opponent='m516-'+label+'-opponent';
  createDuelist(owner);createDuelist(opponent);
  const result=withClock(base,()=>{
    const invite=store.challenge(owner,opponent,guild,channel);
    const started=store.acceptChallenge(invite.id,opponent,guild,invite.revision);
    return {invite,started};
  });
  return {owner,opponent,...result};
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function firstLegalAction(state,actor){
  const actions=engine.legalActions(state,actor);
  assert.ok(actions.length>0,'the decision player must have at least one legal action');
  return actions.findIndex(action=>action.kind==='end')>=0
    ?actions.findIndex(action=>action.kind==='end'):0;
}

test('an action committed one millisecond before the decision deadline resets the full 30-minute clock',()=>{
  const base=Date.now();
  const {owner,opponent,started}=startDuel('before',base);
  const actor=started.state.players[engine.decisionPlayer(started.state)].id;
  const index=firstLegalAction(started.state,actor);
  const actionTime=base+timeout-1;
  const beforeAssets=assetSnapshot();

  const committed=withClock(actionTime,()=>store.performDuelAction(
    started.id,actor,guild,started.revision,index,'m516-before-deadline'
  ));
  assert.equal(committed.status,'playing');
  assert.equal(committed.revision,started.revision+1);
  assert.equal(committed.updated,actionTime);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_action_receipts WHERE request_id=?')
    .get('m516-before-deadline').n,1);

  assert.equal(store.getDuel(started.id,base+timeout).status,'playing',
    'the old deadline cannot expire a duel after a valid action refreshed updated');
  assert.equal(store.expireDueDuels(base+timeout).some(row=>row.id===started.id),false);
  assert.equal(store.expireDueDuels(actionTime+timeout-1).some(row=>row.id===started.id),false);
  const terminal=store.expireDueDuels(actionTime+timeout).find(row=>row.id===started.id);
  assert.ok(terminal,'the renewed decision deadline must still expire at its own exact boundary');
  assert.equal(terminal.status,'finished');
  assert.equal(terminal.revision,committed.revision+1);
  assert.equal(store.currentDuel(owner),undefined);
  assert.equal(store.currentDuel(opponent),undefined);
  assert.deepEqual(assetSnapshot(),beforeAssets,'a normal turn and its timeout cannot grant or alter player assets');
});

test('an action delivered at the exact deadline is rejected and the timeout wins without an action receipt',()=>{
  const base=Date.now();
  const {owner,opponent,started}=startDuel('at-deadline',base);
  const actor=started.state.players[engine.decisionPlayer(started.state)].id;
  const winner=started.state.players.find(player=>player.id!==actor).id;
  const index=firstLegalAction(started.state,actor);
  const deadline=base+timeout;
  const beforeAssets=assetSnapshot();

  withClock(deadline,()=>{
    assert.throws(()=>store.performDuelAction(
      started.id,actor,guild,started.revision,index,'m516-too-late'
    ),/não está ativo/i);
  });

  const terminal=store.getDuel(started.id,deadline);
  assert.equal(terminal.status,'finished');
  assert.equal(terminal.state.phase,'finished');
  assert.equal(terminal.state.winner,winner);
  assert.match(terminal.state.reason,/W\.O\./i);
  assert.equal(terminal.revision,started.revision+1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_action_receipts WHERE request_id=?')
    .get('m516-too-late').n,0,'the rejected action must not leave a receipt');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(started.id).n,0);
  assert.equal(store.currentDuel(owner),undefined);
  assert.equal(store.currentDuel(opponent),undefined);
  assert.equal(store.duelEventsAt(started.id,terminal.revision).filter(event=>event.type==='duelFinished').length,1);
  assert.deepEqual(assetSnapshot(),beforeAssets,'a rejected late action cannot alter economy or inventory');
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
