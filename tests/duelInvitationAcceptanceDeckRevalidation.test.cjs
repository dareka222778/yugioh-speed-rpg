'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m535-invite-deck-revalidation-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const decks=require('../dist/decks');
const store=require('../dist/duelStore');
const db=database.db;
const GUILD='m535-guild',CHANNEL='m535-channel';

function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
  const active=store.activeCards(id);
  assert.equal(active.cards.length,20);
  assert.ok(active.extra.length<=5);
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}

test('Accept revalidates the invited player\'s active Deck after the invitation and rolls back invalid consent',()=>{
  const owner='m535-owner',opponent='m535-opponent';
  createDuelist(owner);createDuelist(opponent);
  const beforeAssets=assetSnapshot();
  const invitation=store.challenge(owner,opponent,GUILD,CHANNEL);
  assert.equal(invitation.status,'pending');
  assert.equal(invitation.invite.cards.length,20,'the creator\'s valid 20-card snapshot is stored at invitation time');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(invitation.id).n,1);
  assert.equal(store.currentDuel(owner).id,invitation.id);
  assert.equal(store.currentDuel(opponent),undefined);

  const removed=db.prepare('SELECT card_key,quantity FROM deck_cards WHERE discord_id=? AND slot=1 ORDER BY card_key LIMIT 1').get(opponent);
  assert.ok(removed,'the invited player has an active Main Deck row');
  if(removed.quantity>1){
    db.prepare('UPDATE deck_cards SET quantity=quantity-1 WHERE discord_id=? AND slot=1 AND card_key=?')
      .run(opponent,removed.card_key);
  }else{
    db.prepare('DELETE FROM deck_cards WHERE discord_id=? AND slot=1 AND card_key=?')
      .run(opponent,removed.card_key);
  }
  const invalidTotal=db.prepare('SELECT COALESCE(SUM(quantity),0) AS n FROM deck_cards WHERE discord_id=? AND slot=1').get(opponent).n;
  assert.equal(invalidTotal,19,'the opponent\'s active Main Deck is now below the 20-card minimum');
  const invalidAssets=assetSnapshot();

  assert.throws(
    ()=>store.acceptChallenge(invitation.id,opponent,GUILD,invitation.revision),
    /deck ativo ficou inválido/i
  );
  const stillPending=store.getDuel(invitation.id);
  assert.equal(stillPending.status,'pending');
  assert.equal(stillPending.revision,invitation.revision,'failed consent does not advance the invitation revision');
  assert.deepEqual(stillPending.invite,invitation.invite,'the creator\'s invitation snapshot is preserved');
  assert.equal(stillPending.state,null,'no DuelState is created from an invalid Deck');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(invitation.id).n,1,
    'only the creator retains the pending-invitation lock');
  assert.equal(store.currentDuel(owner).id,invitation.id);
  assert.equal(store.currentDuel(opponent),undefined,'the invited player never acquires a lock on failed consent');
  assert.equal(db.prepare('SELECT active FROM decks WHERE discord_id=? AND slot=1').get(opponent).active,1,
    'the failed Accept transaction rolls back the temporary active-flag change made during validation');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_transition_events WHERE duel_id=?').get(invitation.id).n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_action_receipts WHERE duel_id=?').get(invitation.id).n,0);
  assert.deepEqual(assetSnapshot(),invalidAssets,'failed Accept does not alter the invalid fixture or player data');

  if(removed.quantity>1){
    db.prepare('UPDATE deck_cards SET quantity=quantity+1 WHERE discord_id=? AND slot=1 AND card_key=?')
      .run(opponent,removed.card_key);
  }else{
    db.prepare('INSERT INTO deck_cards(discord_id,slot,card_key,quantity) VALUES(?,?,?,?)')
      .run(opponent,1,removed.card_key,removed.quantity);
  }
  const repaired=decks.openDeck(opponent,1);
  assert.equal(repaired.active,1);
  assert.equal(repaired.total,20);
  assert.deepEqual(repaired.errors,[],'the invited player restores a legal 20-card Deck without receiving inventory');

  const accepted=store.acceptChallenge(invitation.id,opponent,GUILD,invitation.revision);
  assert.equal(accepted.status,'playing');
  assert.equal(accepted.revision,invitation.revision+1);
  assert.equal(accepted.invite,null);
  assert.ok(accepted.state);
  assert.deepEqual(accepted.state.players.map(player=>player.id),[owner,opponent]);
  for(const player of accepted.state.players){
    assert.equal(player.hand.length+player.deck.length,20,'both duelists enter with exactly 20 Main Deck cards');
    assert.ok((player.extra??[]).length<=5,'both Extra Decks remain within the five-card limit');
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(invitation.id).n,2);
  assert.equal(store.currentDuel(owner).status,'playing');
  assert.equal(store.currentDuel(opponent).status,'playing');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members m LEFT JOIN duels d ON d.id=m.duel_id WHERE d.id IS NULL').get().n,0);
  assert.deepEqual(assetSnapshot(),beforeAssets,'repair and successful consent restore the exact player, collection, grant and Deck snapshots');
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
