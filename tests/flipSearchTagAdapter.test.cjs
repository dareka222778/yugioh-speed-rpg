const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  NECROVALLEY_CARD_ID,physicalSeatFromFlipSearchUid,
  captureTagFlipSearchTrigger,projectTagFlipSearchState,resolveTagFlipSearch
}=require('../dist/flipSearchTagAdapter.js');
const {createTagDuel,tagNormalCardIds}=require('../dist/tagDuel.js');

const CAT='24140059',OWL='23927567';
const TRAP='fixture-trap',FIELD='fixture-field-spell',SPELL='fixture-normal-spell';
const metadata=new Map([
  [TRAP,{id:TRAP,kind:'trap',race:null,level:null,field:false}],
  [FIELD,{id:FIELD,kind:'spell',race:null,level:null,field:true}],
  [SPELL,{id:SPELL,kind:'spell',race:null,level:null,field:false}]
]);
const getCard=id=>metadata.get(id);
function makeGame(first=2){
  const cards=tagNormalCardIds.slice(0,20);
  assert.ok(cards.length>=20);
  const game=createTagDuel([
    {id:'m439-seat-0',name:'Seat 0',cards:[...cards]},
    {id:'m439-seat-1',name:'Seat 1',cards:[...cards]},
    {id:'m439-seat-2',name:'Seat 2',cards:[...cards]},
    {id:'m439-seat-3',name:'Seat 3',cards:[...cards]},
  ],{seed:'m439-flip-search',first,classic:true});
  game.core.phase='response';
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
function addSource(game,team,seat,cardId,faceUp=true){
  const ref={...takePhysical(game,seat),id:cardId};
  const monster={...ref,position:'def',faceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0,owner:team};
  game.core.players[team].monsters.push(monster);
  return monster;
}
function putSearchTargets(game,team,seat){
  const deck=game.core.players[team].deck;
  assert.equal(game.active[team],seat);
  deck[0].id=TRAP;deck[1].id=FIELD;deck[2].id=SPELL;
  return deck;
}
function snapshot(game,team,source,event='m439-flip-event'){
  return captureTagFlipSearchTrigger(game,event,team,source.uid,true);
}
function setNecrovalley(game,team,seat){
  const ref={...takePhysical(game,seat),id:NECROVALLEY_CARD_ID,faceUp:true};
  game.core.players[team].field=ref;
  return ref;
}
const deep=state=>structuredClone(state);

test('physical UID parser accepts only the four physical seats',()=>{
  assert.deepEqual([0,1,2,3].map(i=>physicalSeatFromFlipSearchUid('m'+i+':card')),[0,1,2,3]);
  assert.equal(physicalSeatFromFlipSearchUid('m4:card'),null);
  assert.equal(physicalSeatFromFlipSearchUid('foreign'),null);
});

test('only a real face-down to face-up FLIP of Cat or Owl captures a snapshot',()=>{
  const game=makeGame();
  const cat=addSource(game,0,0,CAT,true);
  assert.ok(snapshot(game,0,cat));
  assert.equal(captureTagFlipSearchTrigger(game,'not-flipped',0,cat.uid,false),null);
  const other=addSource(game,1,1,tagNormalCardIds[0],true);
  assert.equal(captureTagFlipSearchTrigger(game,'not-card',1,other.uid,true),null);
  const down=addSource(game,0,0,OWL,false);
  assert.equal(captureTagFlipSearchTrigger(game,'still-down',0,down.uid,true),null);
});

test('Cat candidates are only Traps from the active physical seat Deck',()=>{
  const game=makeGame();
  const cat=addSource(game,0,0,CAT);
  const deck=putSearchTargets(game,0,2);
  const before2=deep(game.reserves[2]);
  const before3=deep(game.reserves[3]);
  const snap=snapshot(game,0,cat);
  assert.ok(snap);
  if(!snap)return;
  const view=projectTagFlipSearchState(game,snap,getCard);
  assert.ok(view);
  if(view){
    assert.deepEqual(view.candidates.map(x=>x.uid),[deck[0].uid]);
    assert.equal(view.candidates[0].physicalOwnerSeat,2);
    assert.equal(view.necrovalleyFaceUpAtResolution,false);
    assert.deepEqual(game.reserves[2],before2);
    assert.deepEqual(game.reserves[3],before3);
  }
});

test('Owl candidates are only Field Spells from the active physical seat Deck',()=>{
  const game=makeGame();
  const owl=addSource(game,0,0,OWL);
  const deck=putSearchTargets(game,0,2);
  const snap=snapshot(game,0,owl);
  assert.ok(snap);
  if(!snap)return;
  const view=projectTagFlipSearchState(game,snap,getCard);
  assert.ok(view);
  if(view)assert.deepEqual(view.candidates.map(x=>x.uid),[deck[1].uid]);
});

test('Necrovalley on either team Field Zone enables the optional hand alternative at resolution',()=>{
  const game=makeGame();
  const cat=addSource(game,0,0,CAT);
  putSearchTargets(game,0,2);
  setNecrovalley(game,1,3);
  const snap=snapshot(game,0,cat);
  assert.ok(snap);
  if(!snap)return;
  const view=projectTagFlipSearchState(game,snap,getCard);
  assert.equal(view?.necrovalleyFaceUpAtResolution,true);
  assert.equal(view?.handAlternativeAvailable,true);
});

test('Cat may choose deck-top without Necrovalley and keeps the original UID',()=>{
  const game=makeGame();
  const cat=addSource(game,0,0,CAT);
  const deck=putSearchTargets(game,0,2);
  const selected=deck[0];
  const before=deep(game);
  const snap=snapshot(game,0,cat);
  assert.ok(snap);
  if(!snap)return;
  const result=resolveTagFlipSearch(game,snap,selected.uid,'deck-top',[],getCard);
  assert.equal(result.resolved,true);
  if(result.resolved&&!result.noOp){
    assert.equal(result.destination,'deck-top');
    assert.equal(result.shuffleDeck,false);
    assert.equal(result.selectedUid,selected.uid);
    assert.equal(result.physicalOwnerSeat,2);
    assert.equal(result.nextGame.core.players[0].deck[0].uid,selected.uid);
    assert.deepEqual(result.nextGame.reserves,before.reserves);
    assert.deepEqual(result.nextGame.core.teamRotation,before.core.teamRotation);
    assert.deepEqual(game,before);
  }
});

test('Necrovalley hand choice moves the selected Trap into the active private hand and requests shuffle',()=>{
  const game=makeGame();
  const cat=addSource(game,0,0,CAT);
  const deck=putSearchTargets(game,0,2);
  const selected=deck[0];
  setNecrovalley(game,1,3);
  const before=deep(game);
  const snap=snapshot(game,0,cat);
  assert.ok(snap);
  if(!snap)return;
  const result=resolveTagFlipSearch(game,snap,selected.uid,'hand',[],getCard);
  assert.equal(result.resolved,true);
  if(result.resolved&&!result.noOp){
    assert.equal(result.destination,'hand');
    assert.equal(result.shuffleDeck,true);
    assert.ok(result.nextGame.core.players[0].hand.some(card=>card.uid===selected.uid));
    assert.ok(!result.nextGame.core.players[0].deck.some(card=>card.uid===selected.uid));
    assert.deepEqual(result.nextGame.reserves,before.reserves);
    assert.deepEqual(game,before);
  }
});

test('Necrovalley does not force hand; deck-top remains a legal optional choice',()=>{
  const game=makeGame();
  const owl=addSource(game,0,0,OWL);
  const deck=putSearchTargets(game,0,2);
  const selected=deck[1];
  setNecrovalley(game,1,3);
  const snap=snapshot(game,0,owl);
  assert.ok(snap);
  if(!snap)return;
  const result=resolveTagFlipSearch(game,snap,selected.uid,'deck-top',[],getCard);
  assert.equal(result.resolved,true);
  if(result.resolved&&!result.noOp){
    assert.equal(result.destination,'deck-top');
    assert.equal(result.shuffleDeck,false);
    assert.equal(result.nextGame.core.players[0].deck[0].uid,selected.uid);
  }
});

test('hand alternative is rejected when Necrovalley is absent at resolution',()=>{
  const game=makeGame();
  const cat=addSource(game,0,0,CAT);
  const selected=putSearchTargets(game,0,2)[0];
  const snap=snapshot(game,0,cat);
  assert.ok(snap);
  if(!snap)return;
  assert.deepEqual(resolveTagFlipSearch(game,snap,selected.uid,'hand'),{resolved:false,reason:'invalid-choice'});
});

test('a stale source or stale Deck UID cannot resolve after the state changes',()=>{
  const game=makeGame();
  const cat=addSource(game,0,0,CAT);
  const selected=putSearchTargets(game,0,2)[0];
  const snap=snapshot(game,0,cat);
  assert.ok(snap);
  if(!snap)return;
  const staleSource=deep(game);
  staleSource.core.players[0].monsters=[];
  assert.deepEqual(resolveTagFlipSearch(staleSource,snap,selected.uid,'deck-top',[],getCard),
    {resolved:false,reason:'stale-trigger'});
  const staleDeck=deep(game);
  staleDeck.core.players[0].deck=staleDeck.core.players[0].deck.filter(card=>card.uid!==selected.uid);
  assert.deepEqual(resolveTagFlipSearch(staleDeck,snap,selected.uid,'deck-top',[],getCard),
    {resolved:false,reason:'no-target'});
});

test('event IDs are idempotent and a valid result can be committed only once',()=>{
  const game=makeGame();
  const owl=addSource(game,0,0,OWL);
  const selected=putSearchTargets(game,0,2)[1];
  const snap=snapshot(game,0,owl);
  assert.ok(snap);
  if(!snap)return;
  assert.deepEqual(resolveTagFlipSearch(game,snap,selected.uid,'deck-top',['m439-flip-event'],getCard),
    {resolved:false,reason:'duplicate-event'});
  const result=resolveTagFlipSearch(game,snap,selected.uid,'deck-top',[],getCard);
  assert.equal(result.resolved,true);
  if(result.resolved&&!result.noOp){
    assert.equal(result.cardId,OWL);
    assert.equal(result.selectedUid,selected.uid);
    assert.deepEqual(result.processedEventIds,['m439-flip-event']);
  }
});

test('odd team resolves from its active physical seat and never searches the partner reserve',()=>{
  const game=makeGame(1);
  const owl=addSource(game,1,3,OWL);
  const deck=putSearchTargets(game,1,1);
  const snap=snapshot(game,1,owl);
  assert.ok(snap);
  if(!snap)return;
  const view=projectTagFlipSearchState(game,snap,getCard);
  assert.ok(view);
  if(view)assert.deepEqual(view.candidates.map(x=>x.uid),[deck[1].uid]);
  const before3=deep(game.reserves[3]);
  const result=resolveTagFlipSearch(game,snap,deck[1].uid,'deck-top',[],getCard);
  assert.equal(result.resolved,true);
  if(result.resolved&&!result.noOp){
    assert.equal(result.physicalOwnerSeat,1);
    assert.equal(result.nextGame.core.players[1].deck[0].uid,deck[1].uid);
    assert.deepEqual(result.nextGame.reserves[3],before3);
  }
});

test('a mandatory FLIP effect with no legal target resolves as a no-op',()=>{
  const game=makeGame();
  const cat=addSource(game,0,0,CAT);
  const deck=game.core.players[0].deck;
  for(const card of deck)card.id=SPELL;
  const snap=snapshot(game,0,cat);
  assert.ok(snap);
  if(!snap)return;
  const view=projectTagFlipSearchState(game,snap,getCard);
  assert.deepEqual(view?.candidates,[]);
  const before=deep(game);
  const result=resolveTagFlipSearch(game,snap,null,'deck-top',[],getCard);
  assert.equal(result.resolved,true);
  if(result.resolved&&result.noOp){
    assert.equal(result.selectedUid,null);
    assert.deepEqual(result.nextGame,before);
  }
});

test('invalid source and hidden source identity are rejected',()=>{
  const game=makeGame();
  const down=addSource(game,0,0,CAT,false);
  assert.equal(captureTagFlipSearchTrigger(game,'down',0,down.uid,true),null);
  assert.equal(captureTagFlipSearchTrigger(game,'wrong-team',1,down.uid,true),null);
});
