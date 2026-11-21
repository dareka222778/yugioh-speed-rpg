const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  AMAZONESS_SWORDS_WOMAN_ID,AIRKNIGHT_PARSHATH_ID,ASWAN_APPARITION_ID,ATOMIC_FIREFLY_ID,
  captureTagBattleDamageSnapshot,resolveTagAmazonessSwordsWomanDamage,
  resolveTagAtomicFireflyRetaliation,resolveTagAirknightParshathDraw,
  projectTagAswanApparitionOptions,resolveTagAswanApparitionRecovery
}=require('../dist/battleDamageTagAdapter.js');
const {createTagDuel,tagNormalCardIds}=require('../dist/tagDuel.js');

const TRAP='fixture-trap',SPELL='fixture-spell';
const metadata=new Map([
  [TRAP,{id:TRAP,kind:'trap',race:null,level:null}],
  [SPELL,{id:SPELL,kind:'spell',race:null,level:null}]
]);
const getCard=id=>metadata.get(id);
function makeGame(first=2){
  const cards=tagNormalCardIds.slice(0,20);
  const game=createTagDuel([
    {id:'m440-seat-0',name:'Seat 0',cards:[...cards]},
    {id:'m440-seat-1',name:'Seat 1',cards:[...cards]},
    {id:'m440-seat-2',name:'Seat 2',cards:[...cards]},
    {id:'m440-seat-3',name:'Seat 3',cards:[...cards]},
  ],{seed:'m440-battle-damage',first,classic:true});
  game.core.phase='battle';
  return game;
}
function held(game,seat){
  const team=seat%2;
  return game.active[team]===seat?game.core.players[team]:game.reserves[String(seat)];
}
function takePhysical(game,seat){
  const player=held(game,seat);
  for(const zone of ['deck','hand'])if(player[zone].length)return player[zone].pop();
  throw new Error('no physical card for seat '+seat);
}
function addSource(game,team,seat,id){
  const ref={...takePhysical(game,seat),id};
  const monster={...ref,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0,owner:team};
  game.core.players[team].monsters.push(monster);
  return monster;
}
function addOpponent(game,team,seat){
  return addSource(game,team,seat,tagNormalCardIds[0]);
}
function capture(game,team,source,attacker,defender,event='m440-battle-event'){
  return captureTagBattleDamageSnapshot(game,event,team,source.uid,attacker.uid,defender?.uid??null);
}
function addTrapToGrave(game,team,seat=0){
  const ref={...takePhysical(game,seat),id:TRAP};
  game.core.players[team].grave.push(ref);
  return ref;
}
const deep=value=>structuredClone(value);

test('Amazoness Swords Woman redirects the team battle damage and conserves the total',()=>{
  const game=makeGame();
  const source=addSource(game,0,0,AMAZONESS_SWORDS_WOMAN_ID);
  const defender=addOpponent(game,1,1);
  const snap=capture(game,0,source,source,defender);
  assert.ok(snap);
  if(!snap)return;
  const result=resolveTagAmazonessSwordsWomanDamage(game,snap,[700,0]);
  assert.equal(result.resolved,true);
  if(result.resolved){
    assert.deepEqual(result.battleDamageByTeam,[0,700]);
    assert.equal(result.redirectedDamage,700);
    assert.equal(result.recipientTeam,1);
    assert.deepEqual(result.processedEventIds,['m440-battle-event']);
  }
});

test('Amazoness does not redirect when its team would take no damage',()=>{
  const game=makeGame();
  const source=addSource(game,0,0,AMAZONESS_SWORDS_WOMAN_ID);
  const defender=addOpponent(game,1,1);
  const snap=capture(game,0,source,source,defender);
  assert.ok(snap);
  if(!snap)return;
  const result=resolveTagAmazonessSwordsWomanDamage(game,snap,[0,300]);
  assert.equal(result.resolved,true);
  if(result.resolved){
    assert.deepEqual(result.battleDamageByTeam,[0,300]);
    assert.equal(result.redirectedDamage,0);
  }
});

test('Atomic Firefly retaliates against the destroying team, not the physical owner',()=>{
  const game=makeGame();
  const source=addSource(game,0,0,ATOMIC_FIREFLY_ID);
  const attacker=addOpponent(game,1,1);
  const snap=capture(game,0,source,attacker,source);
  assert.ok(snap);
  if(!snap)return;
  const result=resolveTagAtomicFireflyRetaliation(game,snap,[0,250],true,1);
  assert.equal(result.resolved,true);
  if(result.resolved){
    assert.equal(result.triggered,true);
    assert.equal(result.retaliationDamage,1000);
    assert.deepEqual(result.battleDamageByTeam,[0,1250]);
    assert.equal(result.recipientTeam,1);
  }
});

test('Atomic Firefly does not retaliate when removed by an effect',()=>{
  const game=makeGame();
  const source=addSource(game,0,0,ATOMIC_FIREFLY_ID);
  const attacker=addOpponent(game,1,1);
  const snap=capture(game,0,source,attacker,source);
  assert.ok(snap);
  if(!snap)return;
  const result=resolveTagAtomicFireflyRetaliation(game,snap,[0,0],false,1);
  assert.equal(result.resolved,true);
  if(result.resolved)assert.equal(result.triggered,false);
});

test('Airknight draws from the active physical seat Deck, not the owner partner Deck',()=>{
  const game=makeGame();
  const source=addSource(game,0,0,AIRKNIGHT_PARSHATH_ID);
  const defender=addOpponent(game,1,1);
  const top=game.core.players[0].deck[0];
  const partnerDeck=deep(game.reserves[2].deck);
  const snap=capture(game,0,source,source,defender);
  assert.ok(snap);
  if(!snap)return;
  const result=resolveTagAirknightParshathDraw(game,snap,'battle',300);
  assert.equal(result.resolved,true);
  if(result.resolved){
    assert.equal(result.shouldDraw,true);
    assert.equal(result.drawSeat,2);
    assert.equal(result.drawUid,top.uid);
    assert.equal(result.sourcePhysicalOwnerSeat,0);
    assert.deepEqual(game.reserves[2].deck,partnerDeck);
  }
});

test('Airknight does not draw for effect damage or zero battle damage',()=>{
  const game=makeGame();
  const source=addSource(game,0,0,AIRKNIGHT_PARSHATH_ID);
  const defender=addOpponent(game,1,1);
  const snap=capture(game,0,source,source,defender);
  assert.ok(snap);
  if(!snap)return;
  const effect=resolveTagAirknightParshathDraw(game,snap,'effect',500);
  const zero=resolveTagAirknightParshathDraw(game,snap,'battle',0);
  assert.equal(effect.resolved,true);
  assert.equal(zero.resolved,true);
  if(effect.resolved&&zero.resolved){
    assert.equal(effect.shouldDraw,false);
    assert.equal(zero.shouldDraw,false);
    assert.equal(effect.drawUid,null);
    assert.equal(zero.drawUid,null);
  }
});

test('Airknight requires itself to be the attacker',()=>{
  const game=makeGame();
  const source=addSource(game,0,0,AIRKNIGHT_PARSHATH_ID);
  const attacker=addOpponent(game,1,1);
  const snap=capture(game,0,source,attacker,source);
  assert.ok(snap);
  if(!snap)return;
  assert.deepEqual(resolveTagAirknightParshathDraw(game,snap,'battle',100),
    {resolved:false,reason:'invalid-trigger'});
});

test('Aswan offers only Traps from the shared Graveyard',()=>{
  const game=makeGame();
  const source=addSource(game,0,0,ASWAN_APPARITION_ID);
  const trap=addTrapToGrave(game,0,0);
  game.core.players[0].grave.push({...takePhysical(game,2),id:SPELL});
  const defender=addOpponent(game,1,1);
  const snap=capture(game,0,source,source,defender);
  assert.ok(snap);
  if(!snap)return;
  const options=projectTagAswanApparitionOptions(game,snap,'battle',200,getCard);
  assert.ok(options);
  if(options){
    assert.equal(options.available,true);
    assert.deepEqual(options.targets.map(card=>card.uid),[trap.uid]);
    assert.equal(options.deckTopSeat,2);
  }
});

test('Aswan returns the selected Trap to the active physical Deck top and preserves UID/owner',()=>{
  const game=makeGame();
  const source=addSource(game,0,0,ASWAN_APPARITION_ID);
  const trap=addTrapToGrave(game,0,0);
  const defender=addOpponent(game,1,1);
  const before=deep(game);
  const snap=capture(game,0,source,source,defender);
  assert.ok(snap);
  if(!snap)return;
  const result=resolveTagAswanApparitionRecovery(game,snap,trap.uid,'battle',200,[],getCard);
  assert.equal(result.resolved,true);
  if(result.resolved&&!result.noOp){
    assert.equal(result.card.uid,trap.uid);
    assert.equal(result.card.physicalOwnerSeat,0);
    assert.equal(result.deckTopSeat,2);
    assert.equal(result.nextGame.core.players[0].deck[0].uid,trap.uid);
    assert.ok(!result.nextGame.core.players[0].grave.some(card=>card.uid===trap.uid));
    assert.deepEqual(result.nextGame.reserves,before.reserves);
    assert.deepEqual(game,before);
  }
});

test('Aswan does not offer recovery after zero battle damage',()=>{
  const game=makeGame();
  const source=addSource(game,0,0,ASWAN_APPARITION_ID);
  addTrapToGrave(game,0,0);
  const defender=addOpponent(game,1,1);
  const snap=capture(game,0,source,source,defender);
  assert.ok(snap);
  if(!snap)return;
  const options=projectTagAswanApparitionOptions(game,snap,'battle',0,getCard);
  assert.equal(options?.available,false);
  const result=resolveTagAswanApparitionRecovery(game,snap,null,'battle',0,[],getCard);
  assert.equal(result.resolved,true);
  if(result.resolved&&result.noOp)assert.deepEqual(result.nextGame,game);
});

test('Aswan no-target mandatory trigger resolves as a no-op without mutation',()=>{
  const game=makeGame();
  const source=addSource(game,0,0,ASWAN_APPARITION_ID);
  const defender=addOpponent(game,1,1);
  const snap=capture(game,0,source,source,defender);
  assert.ok(snap);
  if(!snap)return;
  const before=deep(game);
  const result=resolveTagAswanApparitionRecovery(game,snap,null,'battle',200,[],getCard);
  assert.equal(result.resolved,true);
  if(result.resolved&&result.noOp)assert.deepEqual(result.nextGame,before);
});

test('battle event IDs are idempotent for damage and draw results',()=>{
  const game=makeGame();
  const source=addSource(game,0,0,AMAZONESS_SWORDS_WOMAN_ID);
  const defender=addOpponent(game,1,1);
  const snap=capture(game,0,source,source,defender);
  assert.ok(snap);
  if(!snap)return;
  assert.deepEqual(resolveTagAmazonessSwordsWomanDamage(game,snap,[100,0],['m440-battle-event']),
    {resolved:false,reason:'duplicate-event'});
});

test('stale battle snapshot is rejected after turn changes',()=>{
  const game=makeGame();
  const source=addSource(game,0,0,ATOMIC_FIREFLY_ID);
  const attacker=addOpponent(game,1,1);
  const snap=capture(game,0,source,attacker,source);
  assert.ok(snap);
  if(!snap)return;
  game.core.turn++;
  assert.deepEqual(resolveTagAtomicFireflyRetaliation(game,snap,[0,0],true,1),
    {resolved:false,reason:'invalid-trigger'});
});
