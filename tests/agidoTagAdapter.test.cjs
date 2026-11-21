const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDuelRandom}=require('../dist/duelRandom.js');
const {
  AGIDO_CARD_ID,physicalSeatFromAgidoUid,rollTagAgidoDie,
  captureTagAgidoBattleTrigger,projectTagAgidoState,
  planTagAgidoRecruit,resolveTagAgidoRecruit
}=require('../dist/agidoTagAdapter.js');
const {createTagDuel,assertTagDuel,tagNormalCardIds}=require('../dist/tagDuel.js');

const FAIRY4='fixture-agido-fairy-4';
const FAIRY6='fixture-agido-fairy-6';
const FAIRY7='fixture-agido-fairy-7';
const metadata=new Map([
  [AGIDO_CARD_ID,{id:AGIDO_CARD_ID,kind:'monster',race:'Fairy',level:4}],
  [FAIRY4,{id:FAIRY4,kind:'monster',race:'Fairy',level:4}],
  [FAIRY6,{id:FAIRY6,kind:'monster',race:'Fairy',level:6}],
  [FAIRY7,{id:FAIRY7,kind:'monster',race:'Fairy',level:7}],
  ['fixture-warrior',{id:'fixture-warrior',kind:'monster',race:'Warrior',level:4}],
  ['fixture-spell',{id:'fixture-spell',kind:'spell',race:null,level:null}]
]);
const lookup=id=>metadata.get(id);
function makeGame(first=2){
  const cards=tagNormalCardIds.slice(0,20);
  assert.ok(cards.length>=20);
  const game=createTagDuel([
    {id:'m438-seat-0',name:'Seat 0',cards:[...cards]},
    {id:'m438-seat-1',name:'Seat 1',cards:[...cards]},
    {id:'m438-seat-2',name:'Seat 2',cards:[...cards]},
    {id:'m438-seat-3',name:'Seat 3',cards:[...cards]},
  ],{seed:'m438-agido-tag',first,classic:true});
  assertTagDuel(game);
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
function cardAs(game,seat,id){return {...takePhysical(game,seat),id};}
function addSource(game,team,seat=0){
  const source=cardAs(game,seat,AGIDO_CARD_ID);
  game.core.players[team].grave.push(source);
  return source;
}
function addCandidate(game,team,seat,id){
  const candidate=cardAs(game,seat,id);
  game.core.players[team].grave.push(candidate);
  return candidate;
}
function trigger(game,team,source,event='m438-agido-event'){
  return captureTagAgidoBattleTrigger(game,event,team,source.uid,true,true);
}

test('physical UID parser recognizes only four seats',()=>{
  assert.deepEqual([0,1,2,3].map(seat=>physicalSeatFromAgidoUid('m'+seat+':card')),[0,1,2,3]);
  assert.equal(physicalSeatFromAgidoUid('m4:card'),null);
  assert.equal(physicalSeatFromAgidoUid('unowned'),null);
});

test('die roll uses a cloned persisted stream and does not mutate the input',()=>{
  const random=createDuelRandom('2'.repeat(64));
  const before={...random};
  const result=rollTagAgidoDie(random);
  assert.equal(random.counter,before.counter);
  assert.equal(result.nextRandom.counter,before.counter+1);
  assert.ok(result.roll>=1&&result.roll<=6);
  assert.deepEqual(rollTagAgidoDie(random),result);
});

test('only battle destruction sent to the shared Graveyard creates a trigger snapshot',()=>{
  const game=makeGame();
  const source=addSource(game,0,0);
  assert.equal(captureTagAgidoBattleTrigger(game,'bad-1',0,source.uid,false,true),null);
  assert.equal(captureTagAgidoBattleTrigger(game,'bad-2',0,source.uid,true,false),null);
  assert.equal(captureTagAgidoBattleTrigger(game,'bad-3',0,'m0:missing',true,true),null);
  assert.ok(trigger(game,0,source));
});

test('team projection reads the shared Graveyard and shared three Monster Zones only',()=>{
  const game=makeGame();
  const source=addSource(game,0,0);
  addCandidate(game,0,2,FAIRY6);
  const projection=projectTagAgidoState(game,0);
  assert.ok(projection);
  assert.equal(projection.activeSeat,2);
  assert.deepEqual(projection.graveyard.map(card=>card.physicalOwnerSeat),[0,2]);
  assert.equal(projection.field.length,0);
  assert.equal(projection.graveyard.some(card=>card.uid===source.uid),true);
});

test('a Level 6 Fairy from the partner physical owner is summoned to the active team field',()=>{
  const game=makeGame();
  const source=addSource(game,0,0);
  const candidate=addCandidate(game,0,2,FAIRY6);
  const snapshot=trigger(game,0,source);
  assert.ok(snapshot);
  if(!snapshot)return;
  const plan=planTagAgidoRecruit(game,snapshot,6,candidate.uid,lookup);
  assert.equal(plan.allowed,true);
  if(!plan.allowed)return;
  const before=JSON.stringify(game);
  const result=resolveTagAgidoRecruit(game,snapshot,plan.plan,[],lookup);
  assert.equal(result.resolved,true);
  if(result.resolved){
    assert.equal(result.summoned,true);
    assert.equal(result.team,0);
    assert.equal(result.activeSeat,2);
    assert.equal(result.selectedUid,candidate.uid);
    assert.deepEqual(result.field[0],{
      uid:candidate.uid,cardId:FAIRY6,physicalOwnerSeat:2,controllerSeat:2,
      zone:'monster',zoneSlot:0,faceUp:true,position:'attack'
    });
    assert.equal(result.graveyard.some(card=>card.uid===candidate.uid),false);
    assert.equal(result.graveyard.some(card=>card.uid===source.uid),true);
    assert.deepEqual(result.processedEventIds,['m438-agido-event']);
  }
  assert.equal(JSON.stringify(game),before);
});

test('Agido itself may be selected when the die result is four',()=>{
  const game=makeGame();
  const source=addSource(game,0,0);
  const snapshot=trigger(game,0,source);
  assert.ok(snapshot);
  if(!snapshot)return;
  const plan=planTagAgidoRecruit(game,snapshot,4,source.uid,lookup);
  assert.equal(plan.allowed,true);
  if(!plan.allowed)return;
  const result=resolveTagAgidoRecruit(game,snapshot,plan.plan,[],lookup);
  assert.equal(result.resolved,true);
  if(result.resolved){
    assert.equal(result.summoned,true);
    assert.equal(result.selectedUid,source.uid);
    assert.equal(result.graveyard.some(card=>card.uid===source.uid),false);
    assert.equal(result.field[0].physicalOwnerSeat,0);
  }
});

test('a result of six accepts Level 7 but a result of five rejects it',()=>{
  const game=makeGame();
  const source=addSource(game,0,0);
  const candidate=addCandidate(game,0,2,FAIRY7);
  const snapshot=trigger(game,0,source);
  assert.ok(snapshot);
  if(!snapshot)return;
  assert.equal(planTagAgidoRecruit(game,snapshot,5,candidate.uid,lookup).allowed,false);
  assert.equal(planTagAgidoRecruit(game,snapshot,6,candidate.uid,lookup).allowed,true);
});

test('non-Fairy cards and wrong Levels cannot be selected',()=>{
  const game=makeGame();
  const source=addSource(game,0,0);
  const warrior=addCandidate(game,0,2,'fixture-warrior');
  const spell=addCandidate(game,0,0,'fixture-spell');
  const snapshot=trigger(game,0,source);
  assert.ok(snapshot);
  if(!snapshot)return;
  assert.equal(planTagAgidoRecruit(game,snapshot,4,warrior.uid,lookup).allowed,false);
  assert.equal(planTagAgidoRecruit(game,snapshot,4,spell.uid,lookup).allowed,false);
});

test('a full shared Monster Field blocks the optional Special Summon',()=>{
  const game=makeGame();
  const source=addSource(game,0,0);
  const candidate=addCandidate(game,0,2,FAIRY6);
  for(let i=0;i<3;i++){
    const monster=cardAs(game,i%2,tagNormalCardIds[i]);
    game.core.players[0].monsters.push({...monster,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0,owner:0});
  }
  const snapshot=trigger(game,0,source);
  assert.ok(snapshot);
  if(!snapshot)return;
  assert.deepEqual(planTagAgidoRecruit(game,snapshot,6,candidate.uid,lookup),
    {allowed:false,reason:'monster-zone-full'});
});

test('the player may decline without moving any physical card',()=>{
  const game=makeGame();
  const source=addSource(game,0,0);
  addCandidate(game,0,2,FAIRY6);
  const snapshot=trigger(game,0,source);
  assert.ok(snapshot);
  if(!snapshot)return;
  const plan=planTagAgidoRecruit(game,snapshot,6,null,lookup);
  assert.equal(plan.allowed,true);
  if(!plan.allowed)return;
  const result=resolveTagAgidoRecruit(game,snapshot,plan.plan,[],lookup);
  assert.equal(result.resolved,true);
  if(result.resolved){
    assert.equal(result.summoned,false);
    assert.equal(result.selectedUid,null);
    assert.equal(result.graveyard.length,2);
    assert.equal(result.field.length,0);
  }
});

test('a stale target is rejected if it leaves the shared Graveyard before resolution',()=>{
  const game=makeGame();
  const source=addSource(game,0,0);
  const candidate=addCandidate(game,0,2,FAIRY6);
  const snapshot=trigger(game,0,source);
  assert.ok(snapshot);
  if(!snapshot)return;
  const plan=planTagAgidoRecruit(game,snapshot,6,candidate.uid,lookup);
  assert.equal(plan.allowed,true);
  if(!plan.allowed)return;
  game.core.players[0].grave=game.core.players[0].grave.filter(card=>card.uid!==candidate.uid);
  assert.deepEqual(resolveTagAgidoRecruit(game,snapshot,plan.plan,[],lookup),
    {resolved:false,reason:'selected-card-missing'});
});

test('duplicate event IDs cannot summon twice',()=>{
  const game=makeGame();
  const source=addSource(game,0,0);
  const candidate=addCandidate(game,0,2,FAIRY6);
  const snapshot=trigger(game,0,source);
  assert.ok(snapshot);
  if(!snapshot)return;
  const plan=planTagAgidoRecruit(game,snapshot,6,candidate.uid,lookup);
  assert.equal(plan.allowed,true);
  if(!plan.allowed)return;
  assert.deepEqual(resolveTagAgidoRecruit(game,snapshot,plan.plan,['m438-agido-event'],lookup),
    {resolved:false,reason:'duplicate-event'});
});

test('odd team uses the odd active seat and preserves the partner physical owner',()=>{
  const game=makeGame(1);
  const source=addSource(game,1,3);
  const candidate=addCandidate(game,1,1,FAIRY6);
  const snapshot=trigger(game,1,source);
  assert.ok(snapshot);
  if(!snapshot)return;
  const plan=planTagAgidoRecruit(game,snapshot,6,candidate.uid,lookup);
  assert.equal(plan.allowed,true);
  if(!plan.allowed)return;
  const result=resolveTagAgidoRecruit(game,snapshot,plan.plan,[],lookup);
  assert.equal(result.resolved,true);
  if(result.resolved){
    assert.equal(result.activeSeat,1);
    assert.equal(result.field[0].physicalOwnerSeat,1);
    assert.equal(result.field[0].controllerSeat,1);
  }
});

test('trigger snapshot becomes stale after the turn or active physical seat changes',()=>{
  const game=makeGame();
  const source=addSource(game,0,0);
  const snapshot=trigger(game,0,source);
  assert.ok(snapshot);
  if(!snapshot)return;
  const plan=planTagAgidoRecruit(game,snapshot,4,null,lookup);
  assert.equal(plan.allowed,true);
  if(!plan.allowed)return;
  game.core.turn++;
  assert.deepEqual(resolveTagAgidoRecruit(game,snapshot,plan.plan,[],lookup),
    {resolved:false,reason:'stale-trigger'});
});
