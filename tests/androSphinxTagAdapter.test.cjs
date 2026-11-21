const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  ANDRO_SPHINX_CARD_ID,
  PYRAMID_OF_LIGHT_CARD_ID,
  physicalSeatFromTagUid,
  projectAndroSphinxTagState,
  planTagAndroSphinxSummon,
  resolveTagAndroSphinxSummon,
  canTagAndroSphinxAttack,
  resolveTagAndroSphinxBattleDamage,
}=require('../dist/androSphinxTagAdapter.js');
const {createTagDuel,assertTagDuel,tagNormalCardIds}=require('../dist/tagDuel.js');

function makeGame(classic=true,first=2){
  const cards=tagNormalCardIds.slice(0,20);
  assert.ok(cards.length>=20);
  const game=createTagDuel([
    {id:'m436-seat-0',name:'Seat 0',cards:[...cards]},
    {id:'m436-seat-1',name:'Seat 1',cards:[...cards]},
    {id:'m436-seat-2',name:'Seat 2',cards:[...cards]},
    {id:'m436-seat-3',name:'Seat 3',cards:[...cards]},
  ],{seed:'m436-andro-sphinx-tag',first,classic});
  assertTagDuel(game);
  return game;
}
function held(game,seat){
  const team=seat%2;
  return game.active[team]===seat?game.core.players[team]:game.reserves[String(seat)];
}
function takePhysical(game,seat){
  const player=held(game,seat);
  for(const zone of ['deck','hand']){
    if(player[zone].length)return player[zone].pop();
  }
  throw new Error('no physical card for seat '+seat);
}
function cardAs(game,seat,id){
  return {...takePhysical(game,seat),id};
}
function putAndroInHand(game,seat=2){
  const card=cardAs(game,seat,ANDRO_SPHINX_CARD_ID);
  held(game,seat).hand.push(card);
  return card;
}
function putPyramid(game,team=0,seat=2,faceUp=true){
  const card=cardAs(game,seat,PYRAMID_OF_LIGHT_CARD_ID);
  game.core.players[team].field={...card,faceUp,setTurn:1};
  return card;
}
function addMonster(game,team,seat,id=tagNormalCardIds[0],extra={}){
  const ref=cardAs(game,seat,id);
  const monster={...ref,position:'atk',faceUp:true,entered:game.core.turn,changed:game.core.turn,
    attacked:0,atkBoost:0,defBoost:0,owner:team,...extra};
  game.core.players[team].monsters.push(monster);
  return monster;
}
function addBackrow(game,team,seat,faceUp=false){
  const ref=cardAs(game,seat,tagNormalCardIds[0]);
  const card={...ref,id:'53129443',faceUp,setTurn:1};
  game.core.players[team].backrow.push(card);
  return card;
}

test('physical UID parser accepts only four physical seats',()=>{
  assert.deepEqual([0,1,2,3].map(seat=>physicalSeatFromTagUid('m'+seat+':card')),[0,1,2,3]);
  assert.equal(physicalSeatFromTagUid('m4:card'),null);
  assert.equal(physicalSeatFromTagUid('seat:card'),null);
});

test('projection reads the active representative hand, shared LP and both shared fields',()=>{
  const game=makeGame();
  putAndroInHand(game,2);
  putPyramid(game,0,0,true);
  const projection=projectAndroSphinxTagState(game);
  assert.ok(projection);
  assert.equal(projection.teamIndex,0);
  assert.equal(projection.activeSeat,2);
  assert.equal(projection.teamLP,4000);
  assert.equal(projection.hand.some(card=>card.cardId===ANDRO_SPHINX_CARD_ID),true);
  assert.equal(projection.field.some(card=>card.cardId===PYRAMID_OF_LIGHT_CARD_ID&&card.zone==='field'),true);
});

test('partner private hand is not projected or searched for the source',()=>{
  const game=makeGame();
  const partnerSource=putAndroInHand(game,0);
  putPyramid(game,0,2,true);
  const projection=projectAndroSphinxTagState(game);
  assert.ok(projection);
  assert.equal(projection.hand.some(card=>card.uid===partnerSource.uid),false);
  const plan=planTagAndroSphinxSummon(game,partnerSource.uid);
  assert.deepEqual(plan,{allowed:false,reason:'source-not-in-active-hand'});
});

test('a partner-owned card smuggled into the active hand invalidates the projection',()=>{
  const game=makeGame();
  const foreign=cardAs(game,0,ANDRO_SPHINX_CARD_ID);
  game.core.players[0].hand.push(foreign);
  assert.equal(projectAndroSphinxTagState(game),null);
  assert.deepEqual(planTagAndroSphinxSummon(game,foreign.uid),{allowed:false,reason:'invalid-tag-state'});
});

test('Summon plan requires Tag Classic mode and Main Phase',()=>{
  const lab=makeGame(false);
  assert.deepEqual(planTagAndroSphinxSummon(lab,'m2:missing'),{allowed:false,reason:'not-tag-classic'});
  const game=makeGame();
  game.core.phase='battle';
  assert.deepEqual(planTagAndroSphinxSummon(game,'m2:missing'),{allowed:false,reason:'wrong-phase'});
});

test('Andro Sphinx summon requires face-up Pyramid controlled by the same team',()=>{
  const game=makeGame();
  const source=putAndroInHand(game,2);
  putPyramid(game,1,1,true);
  const result=planTagAndroSphinxSummon(game,source.uid);
  assert.deepEqual(result,{allowed:false,reason:'pyramid-not-face-up-for-team'});
});

test('face-down Pyramid identity is not projected and cannot satisfy the summon',()=>{
  const game=makeGame();
  const source=putAndroInHand(game,2);
  const pyramid=putPyramid(game,0,0,false);
  const projection=projectAndroSphinxTagState(game);
  assert.ok(projection);
  assert.equal(projection.field.some(card=>card.uid===pyramid.uid&&card.cardId!==undefined),false);
  assert.deepEqual(planTagAndroSphinxSummon(game,source.uid),{allowed:false,reason:'pyramid-not-face-up-for-team'});
});

test('the active team must have more than 500 shared LP',()=>{
  const game=makeGame();
  const source=putAndroInHand(game,2);
  putPyramid(game,0,2,true);
  game.core.players[0].lp=500;
  assert.deepEqual(planTagAndroSphinxSummon(game,source.uid),{allowed:false,reason:'insufficient-team-lp'});
});

test('the three shared Monster Zones are enforced before planning',()=>{
  const game=makeGame();
  const source=putAndroInHand(game,2);
  putPyramid(game,0,2,true);
  addMonster(game,0,2);
  addMonster(game,0,0,tagNormalCardIds[1]);
  addMonster(game,0,2,tagNormalCardIds[2]);
  assert.deepEqual(planTagAndroSphinxSummon(game,source.uid),{allowed:false,reason:'monster-zone-full'});
});

test('successful summon plan and resolution use active seat 2 and preserve physical UID',()=>{
  const game=makeGame();
  const source=putAndroInHand(game,2);
  putPyramid(game,0,0,true);
  const before=JSON.stringify(game);
  const plan=planTagAndroSphinxSummon(game,source.uid);
  assert.equal(plan.allowed,true);
  if(!plan.allowed)return;
  const resolved=resolveTagAndroSphinxSummon(game,plan.plan,'attack');
  assert.deepEqual(resolved,{
    resolved:true,teamIndex:0,activeSeat:2,sourceUid:source.uid,
    physicalOwnerSeat:2,controllerSeat:2,monsterZoneSlot:0,position:'attack',
    summonedTurn:1,remainingTeamLP:3500,lpCost:500
  });
  assert.equal(JSON.stringify(game),before);
});

test('a stale summon plan cannot resolve after the source leaves the active hand',()=>{
  const game=makeGame();
  const source=putAndroInHand(game,2);
  putPyramid(game,0,2,true);
  const plan=planTagAndroSphinxSummon(game,source.uid);
  assert.equal(plan.allowed,true);
  if(!plan.allowed)return;
  game.core.players[0].hand=game.core.players[0].hand.filter(card=>card.uid!==source.uid);
  const result=resolveTagAndroSphinxSummon(game,plan.plan,'defense');
  assert.deepEqual(result,{resolved:false,reason:'source-not-in-active-hand'});
});

test('the same adapter follows active seat 3 when the odd team has the turn',()=>{
  const game=makeGame(true,1);
  const source=putAndroInHand(game,1);
  putPyramid(game,1,1,true);
  const result=planTagAndroSphinxSummon(game,source.uid);
  assert.equal(result.allowed,true);
  if(result.allowed){
    assert.equal(result.plan.teamIndex,1);
    assert.equal(result.plan.primitive.activeSeat,1);
  }
});

test('face-down monsters keep their identity hidden in the projected field',()=>{
  const game=makeGame();
  const ref=cardAs(game,1,tagNormalCardIds[0]);
  game.core.players[1].monsters.push({...ref,position:'def',faceUp:false,entered:1,changed:1,
    attacked:0,atkBoost:0,defBoost:0,owner:1});
  const projection=projectAndroSphinxTagState(game);
  assert.ok(projection);
  const hidden=projection.field.find(card=>card.uid===ref.uid);
  assert.ok(hidden);
  assert.equal(hidden.cardId,undefined);
});

test('all teams project at most three monster and three backrow slots plus a separate Field Zone',()=>{
  const game=makeGame();
  for(const team of [0,1]){
    const seats=team===0?[0,2]:[1,3];
    for(let i=0;i<3;i++){
      addMonster(game,team,seats[i%2],tagNormalCardIds[(i+3)%tagNormalCardIds.length]);
      addBackrow(game,team,seats[i%2],i===0);
    }
    putPyramid(game,team,seats[0],true);
  }
  const projection=projectAndroSphinxTagState(game);
  assert.ok(projection);
  assert.equal(projection.field.filter(card=>card.zone==='monster').length,6);
  assert.equal(projection.field.filter(card=>card.zone==='backrow').length,6);
  assert.equal(projection.field.filter(card=>card.zone==='field').length,2);
  assert.equal(projection.field.length,14);
});

test('Andro Sphinx cannot attack during the turn it was Normal or Special Summoned',()=>{
  const game=makeGame();
  game.core.turn=2;
  const source=addMonster(game,0,0,ANDRO_SPHINX_CARD_ID,{lastSummonedTurn:2});
  assert.equal(canTagAndroSphinxAttack(game,source.uid),false);
  source.lastSummonedTurn=1;
  assert.equal(canTagAndroSphinxAttack(game,source.uid),true);
});

test('battle damage uses physical owner and current team controller separately',()=>{
  const game=makeGame();
  const source=addMonster(game,0,0,ANDRO_SPHINX_CARD_ID);
  const before=JSON.stringify(game);
  const result=resolveTagAndroSphinxBattleDamage(game,{
    eventId:'m436-battle-1',sourceUid:source.uid,sourceEffectNegated:false,
    destroyedUid:'m1:destroyed',destroyedBySourceUid:source.uid,
    destroyedControllerSeat:1,destroyedPosition:'defense',destroyedMonsterAtk:1901,
    result:'destroyed',byBattle:true
  });
  assert.ok(result&&result.applied);
  assert.equal(result.damage,950);
  assert.equal(result.damagedTeamIndex,1);
  assert.equal(result.sourcePhysicalOwnerSeat,0);
  assert.equal(result.sourceControllerSeat,2);
  assert.equal(result.destroyedPhysicalOwnerSeat,1);
  assert.equal(JSON.stringify(game),before);
});

test('battle damage rejects attack-position destruction and non-battle destruction',()=>{
  const game=makeGame();
  const source=addMonster(game,0,2,ANDRO_SPHINX_CARD_ID);
  const base={eventId:'m436-battle-2',sourceUid:source.uid,destroyedUid:'m1:destroyed',
    destroyedBySourceUid:source.uid,destroyedControllerSeat:1,destroyedMonsterAtk:2000,
    result:'destroyed',byBattle:true};
  assert.deepEqual(resolveTagAndroSphinxBattleDamage(game,{...base,destroyedPosition:'attack'}),
    {applied:false,reason:'not-defense-position'});
  assert.deepEqual(resolveTagAndroSphinxBattleDamage(game,{...base,destroyedPosition:'defense',byBattle:false}),
    {applied:false,reason:'not-battle-destruction'});
});

test('battle damage rejects friendly destruction, negated effect and duplicate event',()=>{
  const game=makeGame();
  const source=addMonster(game,0,2,ANDRO_SPHINX_CARD_ID);
  const base={eventId:'m436-battle-3',sourceUid:source.uid,destroyedUid:'m1:destroyed',
    destroyedBySourceUid:source.uid,destroyedControllerSeat:1,destroyedPosition:'defense',
    destroyedMonsterAtk:1800,result:'destroyed',byBattle:true};
  assert.deepEqual(resolveTagAndroSphinxBattleDamage(game,{...base,destroyedControllerSeat:0}),
    {applied:false,reason:'not-opponent-team'});
  assert.deepEqual(resolveTagAndroSphinxBattleDamage(game,{...base,sourceEffectNegated:true}),
    {applied:false,reason:'source-effect-negated'});
  assert.deepEqual(resolveTagAndroSphinxBattleDamage(game,base,['m436-battle-3']),
    {applied:false,reason:'duplicate-event'});
});

test('missing source and invalid physical destroyed UID fail closed',()=>{
  const game=makeGame();
  assert.deepEqual(resolveTagAndroSphinxBattleDamage(game,{
    eventId:'m436-missing',sourceUid:'m0:missing',destroyedUid:'m1:target',
    destroyedBySourceUid:'m0:missing',destroyedControllerSeat:1,destroyedPosition:'defense',
    destroyedMonsterAtk:1000,result:'destroyed',byBattle:true
  }),{applied:false,reason:'wrong-source'});
  const source=addMonster(game,0,2,ANDRO_SPHINX_CARD_ID);
  assert.equal(resolveTagAndroSphinxBattleDamage(game,{
    eventId:'m436-invalid-owner',sourceUid:source.uid,destroyedUid:'no-owner',
    destroyedBySourceUid:source.uid,destroyedControllerSeat:1,destroyedPosition:'defense',
    destroyedMonsterAtk:1000,result:'destroyed',byBattle:true
  }),null);
});
