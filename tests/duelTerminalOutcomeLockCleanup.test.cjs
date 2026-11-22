'use strict';

const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m534-duel-terminal-cleanup-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const decks=require('../dist/decks');
const store=require('../dist/duelStore');
const engine=require('../dist/duelEngine');
const {getCard}=require('../dist/collection');
const {duelPublicMessage}=require('../dist/duelUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const db=database.db;
const GUILD='m534-guild',CHANNEL='m534-channel';

function createDuelist(id){
  database.createPlayer(id,'Player '+id);
  assert.equal(database.chooseStarterDeck(id,'warrior'),true);
  decks.openDeck(id);
  decks.activateDeck(id,1);
  const active=store.activeCards(id);
  assert.equal(active.cards.length,20,'the fixture uses a legal 20-card Main Deck');
  assert.ok(active.extra.length<=5,'the fixture respects the five-card Extra Deck limit');
}
function startDuel(prefix){
  const owner=prefix+'-owner',opponent=prefix+'-opponent';
  createDuelist(owner);createDuelist(opponent);
  const invite=store.challenge(owner,opponent,GUILD,CHANNEL);
  const started=store.acceptChallenge(invite.id,opponent,GUILD,invite.revision);
  assert.equal(started.status,'playing');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(started.id).n,2);
  return {owner,opponent,invite,started};
}
function assetSnapshot(){
  const tables=['players','player_cards','starter_grants','decks','deck_cards'];
  return JSON.stringify(Object.fromEntries(tables.map(table=>[
    table,db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()
  ])));
}
function physicalCards(player){
  return [
    ...player.deck,...player.hand,...player.monsters,...player.backrow,...player.grave,
    ...(player.extra??[]),...(player.banished??[]),...(player.field?[player.field]:[])
  ];
}
function physicalSnapshot(state){
  return state.players.map(player=>physicalCards(player)
    .map(card=>({uid:card.uid,id:card.id}))
    .sort((a,b)=>a.uid.localeCompare(b.uid)));
}
function assertPhysicalConserved(state,before){
  assert.deepEqual(physicalSnapshot(state),before,'terminal resolution must preserve every physical UID and card identity');
  for(const player of state.players){
    const cards=physicalCards(player);
    assert.equal(cards.length,20,'each player keeps all 20 physical Main Deck cards');
    assert.equal(new Set(cards.map(card=>card.uid)).size,20,'no UID is duplicated across a player\'s zones');
  }
}
function persistFixtureState(record,state){
  db.prepare('UPDATE duels SET state=?,updated=? WHERE id=?')
    .run(JSON.stringify(state),Date.now(),record.id);
  return store.getDuel(record.id);
}
function assertTerminalCleanup(record,owner,opponent,expectedWinner,expectedReason){
  assert.equal(record.status,'finished');
  assert.equal(record.state.phase,'finished');
  assert.equal(record.state.winner,expectedWinner);
  assert.match(record.state.reason,expectedReason);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(record.id).n,0,
    'a terminal 1v1 duel releases both physical-player locks');
  assert.equal(store.currentDuel(owner),undefined);
  assert.equal(store.currentDuel(opponent),undefined);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members m LEFT JOIN duels d ON d.id=m.duel_id WHERE d.id IS NULL').get().n,0,
    'terminal cleanup leaves no orphan membership rows');
  const finished=store.duelEventsAt(record.id,record.revision).filter(event=>event.type==='duelFinished');
  assert.equal(finished.length,1,'one terminal transition is persisted');
  assert.equal(finished[0].winner,expectedWinner);
}
function assertFinalDiscordPayload(record,state){
  const payload=duelPublicMessage(record);
  validateDiscordPayload(payload);
  assert.equal(payload.components.length,0,'finished duels expose no active Accept, action or quit controls');
  const serialized=JSON.stringify(payload.embeds.map(embed=>embed.toJSON()));
  for(const player of state.players)for(const card of physicalCards(player)){
    assert.equal(serialized.includes(card.uid),false,'public result never exposes private physical UIDs');
  }
}

test('battle victory persists one terminal revision, releases both locks and safely replays its action receipt',()=>{
  const {owner,opponent,started}=startDuel('m534-battle');
  const state=structuredClone(started.state);
  const attacker=state.players.find(player=>player.id===owner);
  const candidate=attacker.hand.find(card=>getCard(card.id)?.kind==='monster'&&(getCard(card.id)?.atk??0)>0)
    ??attacker.deck.find(card=>getCard(card.id)?.kind==='monster'&&(getCard(card.id)?.atk??0)>0);
  assert.ok(candidate,'the starter Deck contains a usable monster');
  const handIndex=attacker.hand.findIndex(card=>card.uid===candidate.uid);
  if(handIndex>=0)attacker.hand.splice(handIndex,1);
  else attacker.deck.splice(attacker.deck.findIndex(card=>card.uid===candidate.uid),1);
  attacker.monsters.push({
    uid:candidate.uid,id:candidate.id,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  });
  state.turn=3;state.phase='battle';state.current=0;state.priority=0;state.passes=0;
  state.pending={kind:'none'};state.chain=[];
  state.players.find(player=>player.id===opponent).lp=1;
  const prepared=persistFixtureState(started,state);
  const physicalBefore=physicalSnapshot(prepared.state);
  const privateUids=prepared.state.players.flatMap(player=>player.hand.map(card=>card.uid));
  const beforeAssets=assetSnapshot();
  const actions=engine.legalActions(prepared.state,owner);
  const actionIndex=actions.findIndex(action=>action.kind==='attack'&&action.card===candidate.uid);
  assert.notEqual(actionIndex,-1,'the prepared battle state offers the physical monster\'s direct attack');
  const requestId='m534-battle-victory-receipt';

  const first=store.performDuelAction(started.id,owner,GUILD,prepared.revision,actionIndex,requestId);
  assert.deepEqual(first.receipt,{requestId,committedRevision:first.revision,replayed:false});
  assert.equal(first.revision,prepared.revision+1);
  assertTerminalCleanup(first,owner,opponent,owner,/pontos de vida/i);
  assertPhysicalConserved(first.state,physicalBefore);

  const replay=store.performDuelAction(started.id,owner,GUILD,prepared.revision,actionIndex,requestId);
  assert.equal(replay.status,'finished');
  assert.equal(replay.revision,first.revision,'a duplicate request does not create a second terminal revision');
  assert.deepEqual(replay.receipt,{requestId,committedRevision:first.revision,replayed:true});
  assert.equal(store.duelEventsAt(started.id,first.revision).filter(event=>event.type==='duelFinished').length,1);
  assertTerminalCleanup(replay,owner,opponent,owner,/pontos de vida/i);
  assertPhysicalConserved(replay.state,physicalBefore);
  assertFinalDiscordPayload(replay,replay.state);
  assert.deepEqual(assetSnapshot(),beforeAssets,'battle victory and receipt replay do not mutate players, collection, grants or Decks');
});

test('deck-out victory releases both locks and publishes a terminal panel without replaying the draw',()=>{
  const {owner,opponent,started}=startDuel('m534-deckout');
  const state=structuredClone(started.state);
  const losingPlayer=state.players.find(player=>player.id===opponent);
  losingPlayer.grave.push(...losingPlayer.deck.map(card=>({uid:card.uid,id:card.id})));
  losingPlayer.deck=[];
  state.current=0;state.priority=0;state.phase='main';state.pending={kind:'none'};state.chain=[];
  const prepared=persistFixtureState(started,state);
  const physicalBefore=physicalSnapshot(prepared.state);
  const beforeAssets=assetSnapshot();
  const actions=engine.legalActions(prepared.state,owner);
  const actionIndex=actions.findIndex(action=>action.kind==='end');
  assert.notEqual(actionIndex,-1,'the active player can end the turn that forces the empty-deck draw');
  const requestId='m534-deckout-victory-receipt';

  const first=store.performDuelAction(started.id,owner,GUILD,prepared.revision,actionIndex,requestId);
  assert.deepEqual(first.receipt,{requestId,committedRevision:first.revision,replayed:false});
  assert.equal(first.revision,prepared.revision+1);
  assertTerminalCleanup(first,owner,opponent,owner,/comprar|deck|baralho/i);
  assertPhysicalConserved(first.state,physicalBefore);

  const replay=store.performDuelAction(started.id,owner,GUILD,prepared.revision,actionIndex,requestId);
  assert.equal(replay.status,'finished');
  assert.equal(replay.revision,first.revision,'receipt replay cannot draw or finish the duel twice');
  assert.deepEqual(replay.receipt,{requestId,committedRevision:first.revision,replayed:true});
  assert.equal(store.duelEventsAt(started.id,first.revision).filter(event=>event.type==='duelFinished').length,1);
  assertTerminalCleanup(replay,owner,opponent,owner,/comprar|deck|baralho/i);
  assertPhysicalConserved(replay.state,physicalBefore);
  assertFinalDiscordPayload(replay,replay.state);
  assert.deepEqual(assetSnapshot(),beforeAssets,'deck-out and receipt replay do not mutate player inventory or Deck rows');
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
