const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  ANCIENT_LAMP_CARD_ID,LA_JINN_CARD_ID,
  physicalSeatFromAncientLampUid,projectAncientLampTagState,
  planTagAncientLampSummon,resolveTagAncientLampSummon,
  captureTagAncientLampAttackStart,planTagAncientLampAttackRedirect,
  resolveTagAncientLampAttackRedirect
}=require('../dist/ancientLampTagAdapter.js');
const {createTagDuel,assertTagDuel,tagNormalCardIds}=require('../dist/tagDuel.js');

function makeGame(first=2){
  const cards=tagNormalCardIds.slice(0,20);
  assert.ok(cards.length>=20);
  const game=createTagDuel([
    {id:'m437-seat-0',name:'Seat 0',cards:[...cards]},
    {id:'m437-seat-1',name:'Seat 1',cards:[...cards]},
    {id:'m437-seat-2',name:'Seat 2',cards:[...cards]},
    {id:'m437-seat-3',name:'Seat 3',cards:[...cards]},
  ],{seed:'m437-ancient-lamp-tag',first,classic:true});
  assertTagDuel(game);
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
function putLaJinnInHand(game,seat=2){
  const card=cardAs(game,seat,LA_JINN_CARD_ID);
  held(game,seat).hand.push(card);
  return card;
}
function addMonster(game,team,seat,id=tagNormalCardIds[0],extra={}){
  const ref=cardAs(game,seat,id);
  const monster={...ref,position:'atk',faceUp:true,entered:game.core.turn,changed:game.core.turn,
    attacked:0,atkBoost:0,defBoost:0,owner:team,...extra};
  game.core.players[team].monsters.push(monster);
  return monster;
}
function addLamp(game,team=0,seat=0,faceUp=true){
  return addMonster(game,team,seat,ANCIENT_LAMP_CARD_ID,{position:'def',faceUp});
}
function makeAttackWindow(){
  const game=makeGame();
  const attacker=addMonster(game,0,2,tagNormalCardIds[0],{position:'atk',faceUp:true});
  const lamp=addLamp(game,1,1,false);
  game.core.phase='battle';
  game.core.pending={kind:'attack',actor:0,card:attacker.uid,target:lamp.uid,stage:'declare'};
  game.core.damageStep=false;
  const snapshot=captureTagAncientLampAttackStart(game,'m437-attack-event-1');
  assert.ok(snapshot);
  lamp.faceUp=true;
  game.core.pending.stage='damage';
  game.core.phase='response';
  game.core.damageStep=true;
  const target=addMonster(game,0,0,tagNormalCardIds[1],{position:'def',faceUp:false});
  return {game,attacker,lamp,target,snapshot};
}

test('physical UID parser accepts only the four physical seats',()=>{
  assert.deepEqual([0,1,2,3].map(seat=>physicalSeatFromAncientLampUid('m'+seat+':card')),[0,1,2,3]);
  assert.equal(physicalSeatFromAncientLampUid('m4:card'),null);
  assert.equal(physicalSeatFromAncientLampUid('unowned'),null);
});

test('projection uses the active physical hand and both shared Monster Fields',()=>{
  const game=makeGame();
  putLaJinnInHand(game,2);
  addLamp(game,0,0,true);
  addMonster(game,1,1,tagNormalCardIds[2]);
  const projection=projectAncientLampTagState(game);
  assert.ok(projection);
  assert.equal(projection.team,0);
  assert.equal(projection.activeSeat,2);
  assert.equal(projection.hand.some(card=>card.cardId===LA_JINN_CARD_ID),true);
  assert.equal(projection.field.some(card=>card.cardId===ANCIENT_LAMP_CARD_ID),true);
  assert.equal(projection.field.length,2);
});

test('partner private hand is excluded and cannot pay the La Jinn summon',()=>{
  const game=makeGame();
  const partnerCard=cardAs(game,0,LA_JINN_CARD_ID);
  held(game,0).hand.push(partnerCard);
  addLamp(game,0,2,true);
  const projection=projectAncientLampTagState(game);
  assert.ok(projection);
  assert.equal(projection.hand.some(card=>card.uid===partnerCard.uid),false);
  assert.deepEqual(planTagAncientLampSummon(game,game.core.players[0].monsters[0].uid,partnerCard.uid,false),
    {allowed:false,reason:'la-jinn-not-in-active-hand'});
});

test('a foreign physical card in the active hand invalidates the projection',()=>{
  const game=makeGame();
  const foreign=cardAs(game,0,LA_JINN_CARD_ID);
  game.core.players[0].hand.push(foreign);
  assert.equal(projectAncientLampTagState(game),null);
});

test('Ancient Lamp Special Summon is Main Phase only',()=>{
  const game=makeGame();
  const lamp=addLamp(game,0,0,true);
  const laJinn=putLaJinnInHand(game,2);
  game.core.phase='battle';
  assert.deepEqual(planTagAncientLampSummon(game,lamp.uid,laJinn.uid,false),
    {allowed:false,reason:'wrong-phase'});
});

test('La Jinn summon requires a face-up Ancient Lamp controlled by the active team',()=>{
  const game=makeGame();
  const lamp=addLamp(game,1,1,true);
  const laJinn=putLaJinnInHand(game,2);
  assert.deepEqual(planTagAncientLampSummon(game,lamp.uid,laJinn.uid,false),
    {allowed:false,reason:'source-not-controlled-by-team'});
});

test('negated Ancient Lamp cannot summon La Jinn',()=>{
  const game=makeGame();
  const lamp=addLamp(game,0,0,true);
  const laJinn=putLaJinnInHand(game,2);
  assert.deepEqual(planTagAncientLampSummon(game,lamp.uid,laJinn.uid,true),
    {allowed:false,reason:'source-effect-negated'});
});

test('three shared Monster Zones block the La Jinn summon',()=>{
  const game=makeGame();
  const lamp=addLamp(game,0,0,true);
  addMonster(game,0,2,tagNormalCardIds[1]);
  addMonster(game,0,0,tagNormalCardIds[2]);
  const laJinn=putLaJinnInHand(game,2);
  assert.deepEqual(planTagAncientLampSummon(game,lamp.uid,laJinn.uid,false),
    {allowed:false,reason:'monster-zone-full'});
});

test('successful summon preserves La Jinn UID and active physical ownership without mutating state',()=>{
  const game=makeGame();
  const lamp=addLamp(game,0,0,true);
  const laJinn=putLaJinnInHand(game,2);
  const before=JSON.stringify(game);
  const plan=planTagAncientLampSummon(game,lamp.uid,laJinn.uid,false);
  assert.equal(plan.allowed,true);
  if(!plan.allowed)return;
  const result=resolveTagAncientLampSummon(game,plan.plan,'attack',false);
  assert.deepEqual(result,{
    resolved:true,team:0,activeSeat:2,sourceUid:laJinn.uid,
    physicalOwnerSeat:2,controllerSeat:2,monsterZoneSlot:1,position:'attack'
  });
  assert.equal(JSON.stringify(game),before);
});

test('stale La Jinn plan fails when the card leaves the active hand',()=>{
  const game=makeGame();
  const lamp=addLamp(game,0,0,true);
  const laJinn=putLaJinnInHand(game,2);
  const plan=planTagAncientLampSummon(game,lamp.uid,laJinn.uid,false);
  assert.equal(plan.allowed,true);
  if(!plan.allowed)return;
  game.core.players[0].hand=game.core.players[0].hand.filter(card=>card.uid!==laJinn.uid);
  assert.deepEqual(resolveTagAncientLampSummon(game,plan.plan,'defense',false),
    {resolved:false,reason:'la-jinn-not-in-active-hand'});
});

test('odd team uses its active physical representative and private hand',()=>{
  const game=makeGame(1);
  const lamp=addLamp(game,1,3,true);
  const laJinn=putLaJinnInHand(game,1);
  const plan=planTagAncientLampSummon(game,lamp.uid,laJinn.uid,false);
  assert.equal(plan.allowed,true);
  if(plan.allowed){
    assert.equal(plan.plan.team,1);
    assert.equal(plan.plan.primitive.activeSeat,1);
  }
});

test('attack snapshot captures a face-down Ancient Lamp before it is revealed without exposing its identity',()=>{
  const game=makeGame();
  const attacker=addMonster(game,0,2,tagNormalCardIds[0]);
  const lamp=addLamp(game,1,1,false);
  game.core.phase='battle';
  game.core.pending={kind:'attack',actor:0,card:attacker.uid,target:lamp.uid,stage:'declare'};
  const snapshot=captureTagAncientLampAttackStart(game,'m437-capture-1');
  assert.ok(snapshot);
  assert.equal(snapshot.wasFaceDownAtDamageStepStart,true);
  assert.equal('cardId' in snapshot,false);
  assert.equal('id' in snapshot,false);
});

test('attack snapshot refuses a face-up Lamp or a different defender',()=>{
  const game=makeGame();
  const attacker=addMonster(game,0,2,tagNormalCardIds[0]);
  const lamp=addLamp(game,1,1,true);
  game.core.phase='battle';
  game.core.pending={kind:'attack',actor:0,card:attacker.uid,target:lamp.uid,stage:'declare'};
  assert.equal(captureTagAncientLampAttackStart(game,'m437-faceup'),null);
  lamp.faceUp=false;
  game.core.pending.target=addMonster(game,1,3,tagNormalCardIds[1]).uid;
  assert.equal(captureTagAncientLampAttackStart(game,'m437-other-target'),null);
});

test('Ancient Lamp redirects before damage calculation to another monster of the attacking team',()=>{
  const {game,attacker,lamp,target,snapshot}=makeAttackWindow();
  const before=JSON.stringify(game);
  const plan=planTagAncientLampAttackRedirect(game,snapshot,target.uid,false);
  assert.equal(plan.allowed,true);
  if(!plan.allowed)return;
  const result=resolveTagAncientLampAttackRedirect(game,snapshot,plan.plan,false);
  assert.equal(result.redirected,true);
  if(result.redirected){
    assert.equal(result.team,0);
    assert.equal(result.attackerUid,attacker.uid);
    assert.equal(result.lampUid,lamp.uid);
    assert.equal(result.targetUid,target.uid);
    assert.equal(result.targetFaceUp,false);
    assert.deepEqual(result.processedEventIds,['m437-attack-event-1']);
  }
  assert.equal(JSON.stringify(game),before);
});

test('negated Ancient Lamp cannot redirect an attack',()=>{
  const {game,target,snapshot}=makeAttackWindow();
  assert.deepEqual(planTagAncientLampAttackRedirect(game,snapshot,target.uid,true),
    {allowed:false,reason:'lamp-effect-negated'});
});

test('attack redirect is rejected outside the pre-calculation Damage Step window',()=>{
  const {game,target,snapshot}=makeAttackWindow();
  game.core.pending.stage='calculation';
  assert.deepEqual(planTagAncientLampAttackRedirect(game,snapshot,target.uid,false),
    {allowed:false,reason:'invalid-tag-state'});
  game.core.pending.stage='damage';
  game.core.damageStep=false;
  assert.deepEqual(planTagAncientLampAttackRedirect(game,snapshot,target.uid,false),
    {allowed:false,reason:'invalid-tag-state'});
});

test('stale attack target or missing Lamp cannot be redirected',()=>{
  const {game,target,snapshot}=makeAttackWindow();
  game.core.pending.target=target.uid;
  assert.deepEqual(planTagAncientLampAttackRedirect(game,snapshot,target.uid,false),
    {allowed:false,reason:'invalid-tag-state'});
});

test('redirect rejects attacker, Lamp and monsters outside the attacking team',()=>{
  const {game,attacker,lamp,target,snapshot}=makeAttackWindow();
  assert.deepEqual(planTagAncientLampAttackRedirect(game,snapshot,attacker.uid,false),
    {allowed:false,reason:'invalid-redirect-target'});
  assert.deepEqual(planTagAncientLampAttackRedirect(game,snapshot,lamp.uid,false),
    {allowed:false,reason:'invalid-redirect-target'});
  const enemy=addMonster(game,1,3,tagNormalCardIds[3]);
  assert.deepEqual(planTagAncientLampAttackRedirect(game,snapshot,enemy.uid,false),
    {allowed:false,reason:'invalid-redirect-target'});
});

test('redirect resolution rechecks target presence and event idempotency',()=>{
  const {game,target,snapshot}=makeAttackWindow();
  const plan=planTagAncientLampAttackRedirect(game,snapshot,target.uid,false);
  assert.equal(plan.allowed,true);
  if(!plan.allowed)return;
  game.core.players[0].monsters=game.core.players[0].monsters.filter(card=>card.uid!==target.uid);
  assert.deepEqual(resolveTagAncientLampAttackRedirect(game,snapshot,plan.plan,false),
    {redirected:false,reason:'target-missing'});
  const again=makeAttackWindow();
  const second=planTagAncientLampAttackRedirect(again.game,again.snapshot,again.target.uid,false);
  assert.equal(second.allowed,true);
  if(second.allowed)assert.deepEqual(resolveTagAncientLampAttackRedirect(again.game,again.snapshot,second.plan,false,['m437-attack-event-1']),
    {redirected:false,reason:'duplicate-event'});
});

test('a face-down redirect target remains identity-redacted in the projection',()=>{
  const {game,target}=makeAttackWindow();
  const projection=projectAncientLampTagState(game);
  assert.ok(projection);
  const hidden=projection.field.find(card=>card.uid===target.uid);
  assert.ok(hidden);
  assert.equal(hidden.faceUp,false);
  assert.equal(hidden.cardId,undefined);
});

test('projection rejects a missing partner field instead of throwing',()=>{
  const game=makeGame();
  game.core.players[1]=undefined;
  assert.equal(projectAncientLampTagState(game),null);
});

test('projection rejects malformed private hand and malformed monster arrays',()=>{
  const badHand=makeGame();
  badHand.core.players[0].hand=null;
  assert.equal(projectAncientLampTagState(badHand),null);
  const badField=makeGame();
  badField.core.players[1].monsters=null;
  assert.equal(projectAncientLampTagState(badField),null);
});

test('projection rejects duplicate physical UIDs across shared team fields',()=>{
  const game=makeGame();
  const original=addMonster(game,0,0,tagNormalCardIds[0]);
  game.core.players[1].monsters.push({...original,owner:1});
  assert.equal(projectAncientLampTagState(game),null);
});

test('attack snapshot safely rejects a missing pending attack record',()=>{
  const game=makeGame();
  delete game.core.pending;
  assert.equal(captureTagAncientLampAttackStart(game,'m437-no-pending'),null);
});

test('attack snapshot safely rejects a missing opponent monster collection',()=>{
  const game=makeGame();
  const attacker=addMonster(game,0,2,tagNormalCardIds[0]);
  game.core.phase='battle';
  game.core.pending={kind:'attack',actor:0,card:attacker.uid,target:'m1:missing',stage:'declare'};
  game.core.players[1].monsters=null;
  assert.equal(captureTagAncientLampAttackStart(game,'m437-no-opponent-field'),null);
});
