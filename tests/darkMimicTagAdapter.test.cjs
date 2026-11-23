'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {tagInventory}=require('../dist/tagDuel');
const {
  DARK_MIMIC_LV1_ID:LV1,DARK_MIMIC_LV3_ID:LV3,
  planDarkMimicLv1Flip,resolveDarkMimicLv1Flip,
  planDarkMimicLv1Standby,payDarkMimicLv1StandbyCost,resolveDarkMimicLv1Standby,
  planDarkMimicLv3BattleDraw,resolveDarkMimicLv3BattleDraw
}=require('../dist/darkMimicTagAdapter');

const NORMAL='91152256';
const lookup=id=>id===LV1||id===LV3?{kind:'monster',monsterType:'effect'}:id===NORMAL?{kind:'monster',monsterType:'normal'}:undefined;
const ref=(uid,id=NORMAL)=>({uid,id});
const physicalSeat=uid=>Number(/^m([0-3]):/.exec(uid)?.[1]);
function makeState({
  sourceUid='m0:lv1-source',sourceId=LV1,sourceTeam=0,currentTeam=0,phase='main',
  sourceFaceUp=true,sourceEpoch=0,targetZone='deck',targetUid='m0:lv3-target',
  deck0Length=15,hand0Length=5,deckTopUid='m0:draw-top',deckTopId=NORMAL
}={}){
  const physical=[];
  for(let seat=0;seat<4;seat++){
    physical[seat]={
      deck:Array.from({length:15},(_,i)=>ref('m'+seat+':d'+i)),
      hand:Array.from({length:5},(_,i)=>ref('m'+seat+':h'+i)),
      extra:Array.from({length:5},(_,i)=>ref('m'+seat+':e'+i))
    };
  }
  const owner=physicalSeat(sourceUid);
  physical[owner].deck.pop(); // the source is now on the field, not a new inventory grant
  const active=[0,1],reserves={'2':physical[2],'3':physical[3]};
  const players=[
    {id:'tag-team-0',name:'Equipe Azul',lp:4000,deck:physical[0].deck,hand:physical[0].hand,monsters:[],backrow:[],grave:[],extra:physical[0].extra,banished:[],field:null,summoned:false},
    {id:'tag-team-1',name:'Equipe Vermelha',lp:4000,deck:physical[1].deck,hand:physical[1].hand,monsters:[],backrow:[],grave:[],extra:physical[1].extra,banished:[],field:null,summoned:false}
  ];
  const cursor=currentTeam;
  const core={
    version:1,players,turn:1,current:currentTeam,phase,resume:'main',priority:currentTeam,passes:0,
    pending:{kind:'none'},chain:[],winner:null,reason:'',log:[],
    teamRotation:{version:1,cursor,active,reserves},
    cardLifetimes:{[sourceUid]:{zone:'monsters',epoch:sourceEpoch}}
  };
  players[sourceTeam].monsters.push({uid:sourceUid,id:sourceId,position:'atk',faceUp:sourceFaceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0});
  const targetSeat=active[sourceTeam];
  const targetPool=targetZone==='hand'?players[sourceTeam].hand:players[sourceTeam].deck;
  if(targetZone!=='none'){
    targetPool[1]={uid:targetUid,id:LV3};
    core.cardLifetimes[targetUid]={zone:targetZone,epoch:0};
  }
  if(players[0].deck.length)players[0].deck[0]={uid:deckTopUid,id:deckTopId};
  if(deck0Length>=0)players[0].deck=players[0].deck.slice(0,deck0Length);
  if(hand0Length>=0)players[0].hand=players[0].hand.slice(0,hand0Length);
  // Keep the team-rotation reserve references identical to the public TagDuel snapshot.
  const state={version:1,mode:'tag-classic',members:[
    {id:'p0',name:'P0',team:0},{id:'p1',name:'P1',team:1},
    {id:'p2',name:'P2',team:0},{id:'p3',name:'P3',team:1}
  ],active,cursor,reserves,core};
  core.teamRotation.reserves=reserves;
  // A full three-card backrow and separate Field Zone exercise the 3+3 layout.
  players[0].backrow=[ref('m0:b0'),ref('m0:b1'),ref('m0:b2')].map(card=>({...card,setTurn:0,faceUp:false}));
  players[0].field={...ref('m0:field'),setTurn:0,faceUp:true};
  return state;
}
const event=(state,uid,eventId='flip-1')=>({kind:'flip-summon',eventId,sourceUid:uid,turn:state.core.turn,summonType:'flip',previousFaceUp:false,faceUp:true});
function battleDestroy(state,uid,controllerTeam,eventId='battle-1'){
  const owner=physicalSeat(uid)%2;
  const team=state.core.players.findIndex(player=>player.monsters.some(card=>card.uid===uid));
  assert.notEqual(team,-1);
  const index=state.core.players[team].monsters.findIndex(card=>card.uid===uid);
  const [monster]=state.core.players[team].monsters.splice(index,1);
  const sourceEpoch=state.core.cardLifetimes[uid].epoch;
  state.core.players[owner].grave.push({uid:monster.uid,id:monster.id});
  state.core.cardLifetimes[uid]={zone:'grave',epoch:sourceEpoch+1};
  return {kind:'battle-destroyed',eventId,sourceUid:uid,sourceEpoch,turn:state.core.turn,controllerTeam,destroyedByBattle:true,sentToGY:true};
}
const inventory=state=>tagInventory(state).map(card=>card.uid+'='+card.id).sort();

test('Dark Mimic LV1 draws exactly one card on a real Flip Summon',()=>{
  const state=makeState();
  const before=inventory(state);
  const plan=planDarkMimicLv1Flip(state,event(state,'m0:lv1-source'),'m0:lv1-source',lookup);
  const result=resolveDarkMimicLv1Flip(state,plan);
  assert.equal(result.status,'resolved');assert.deepEqual(result.drawnUids,['m0:draw-top']);
  assert.equal(result.state.core.players[0].hand.length,6);
  assert.deepEqual(inventory(result.state),before);
});
test('LV1 Flip draw belongs to the active representative, not the inactive partner Deck',()=>{
  const state=makeState({sourceUid:'m2:partner-lv1',sourceTeam:0});
  state.reserves['2'].deck[0]={uid:'m2:partner-top',id:NORMAL};
  const result=resolveDarkMimicLv1Flip(state,planDarkMimicLv1Flip(state,event(state,'m2:partner-lv1'),'m2:partner-lv1',lookup));
  assert.equal(result.drawnUids[0],'m0:draw-top');
  assert.equal(result.state.reserves['2'].deck[0].uid,'m2:partner-top');
});
test('Normal Summon, effect-flip, stale event and face-down source do not trigger LV1',()=>{
  const state=makeState();
  assert.throws(()=>planDarkMimicLv1Flip(state,{...event(state,'m0:lv1-source'),summonType:'normal'},'m0:lv1-source',lookup),/Invocação-Virar/);
  assert.throws(()=>planDarkMimicLv1Flip(state,{...event(state,'m0:lv1-source'),kind:'effect-flip'},'m0:lv1-source',lookup),/Invocação-Virar/);
  assert.throws(()=>planDarkMimicLv1Flip(state,{...event(state,'m0:lv1-source'),turn:2},'m0:lv1-source',lookup),/Invocação-Virar/);
  const down=makeState({sourceFaceUp:false});
  assert.throws(()=>planDarkMimicLv1Flip(down,event(down,'m0:lv1-source'),'m0:lv1-source',lookup),/face-up/);
});
test('LV1 Flip event is idempotent and a negated trigger does not draw',()=>{
  const state=makeState();
  const plan=planDarkMimicLv1Flip(state,event(state,'m0:lv1-source'),'m0:lv1-source',lookup);
  const negated=resolveDarkMimicLv1Flip(state,plan,true);
  assert.equal(negated.status,'negated');assert.equal(negated.drawnUids.length,0);
  assert.throws(()=>resolveDarkMimicLv1Flip(negated.state,plan),/já foi resolvido/);
});
test('an activated FLIP trigger still resolves after its source leaves the field',()=>{
  const state=makeState();
  const plan=planDarkMimicLv1Flip(state,event(state,'m0:lv1-source'),'m0:lv1-source',lookup);
  const moved=structuredClone(state);
  moved.core.players[0].monsters=[];moved.core.players[0].grave.push({uid:'m0:lv1-source',id:LV1});
  moved.core.cardLifetimes['m0:lv1-source']={zone:'grave',epoch:1};
  const result=resolveDarkMimicLv1Flip(moved,plan);
  assert.equal(result.drawnUids.length,1);
});
test('empty Deck on mandatory LV1 draw causes a deck-out loss',()=>{
  const state=makeState({deck0Length:0});
  const result=resolveDarkMimicLv1Flip(state,planDarkMimicLv1Flip(state,event(state,'m0:lv1-source'),'m0:lv1-source',lookup));
  assert.equal(result.deckOut,true);assert.equal(result.state.core.phase,'finished');assert.equal(result.state.core.winner,'tag-team-1');
});
test('LV1 Standby effect is optional, face-up, in Standby Phase and requires a free zone plus an LV3',()=>{
  const wrongPhase=makeState({phase:'main'});
  assert.throws(()=>planDarkMimicLv1Standby(wrongPhase,'m0:lv1-source',lookup),/Fase de Apoio/);
  const down=makeState({phase:'standby',sourceFaceUp:false});
  assert.throws(()=>planDarkMimicLv1Standby(down,'m0:lv1-source',lookup),/face-up/);
  const noTarget=makeState({phase:'standby',targetZone:'none'});
  assert.throws(()=>planDarkMimicLv1Standby(noTarget,'m0:lv1-source',lookup),/Não há Dark Mimic LV3/);
  const full=makeState({phase:'standby'});
  full.core.players[0].monsters.push(
    {uid:'m0:extra-a',id:NORMAL,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0},
    {uid:'m0:extra-b',id:NORMAL,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0}
  );
  assert.throws(()=>planDarkMimicLv1Standby(full,'m0:lv1-source',lookup),/Zona de Monstro livre/);
});
test('LV1 Standby pays its send-to-GY cost and Special Summons LV3 from the active Deck',()=>{
  const state=makeState({phase:'standby'});
  const before=inventory(state);
  const activation=planDarkMimicLv1Standby(state,'m0:lv1-source',lookup);
  const paid=payDarkMimicLv1StandbyCost(state,activation,lookup);
  assert.equal(paid.state.core.players[0].monsters.length,0);
  assert.equal(paid.state.core.players[0].grave.at(-1).uid,'m0:lv1-source');
  const result=resolveDarkMimicLv1Standby(paid.state,paid.resolutionPlan,{targetUid:'m0:lv3-target'});
  assert.equal(result.status,'summoned');assert.equal(result.summonedUid,'m0:lv3-target');
  assert.equal(result.state.core.players[0].monsters.at(-1).id,LV3);
  assert.deepEqual(inventory(result.state),before);
});
test('LV1 owned by inactive partner pays to the owner GY but summons from active teammate Deck',()=>{
  const state=makeState({phase:'standby',sourceUid:'m2:partner-lv1'});
  const paid=payDarkMimicLv1StandbyCost(state,planDarkMimicLv1Standby(state,'m2:partner-lv1',lookup),lookup);
  assert.equal(paid.state.core.players[0].grave.at(-1).uid,'m2:partner-lv1');
  const result=resolveDarkMimicLv1Standby(paid.state,paid.resolutionPlan,{targetUid:'m0:lv3-target'});
  assert.equal(result.status,'summoned');assert.equal(result.state.core.players[0].monsters.at(-1).uid,'m0:lv3-target');
});
test('LV1 cannot summon LV3 from the inactive partner private Deck or Hand',()=>{
  const state=makeState({phase:'standby',targetZone:'none'});
  state.reserves['2'].deck[0]={uid:'m2:partner-lv3',id:LV3};
  assert.throws(()=>planDarkMimicLv1Standby(state,'m0:lv1-source',lookup),/Não há Dark Mimic LV3/);
});
test('LV1 once-per-turn use is keyed by physical instance and survives JSON restore',()=>{
  const state=makeState({phase:'standby'});
  const plan=planDarkMimicLv1Standby(state,'m0:lv1-source',lookup);
  const paid=payDarkMimicLv1StandbyCost(state,plan,lookup);
  const restored=JSON.parse(JSON.stringify(paid.state));
  assert.equal(restored.darkMimic.lv1StandbyUsedTurnByInstance['m0:lv1-source@0'],1);
  assert.throws(()=>planDarkMimicLv1Standby(restored,'m0:lv1-source',lookup),/face-up|Zona de Monstro/);
});
test('a negated LV1 Standby effect still pays the cost but does not Special Summon',()=>{
  const state=makeState({phase:'standby'});
  const paid=payDarkMimicLv1StandbyCost(state,planDarkMimicLv1Standby(state,'m0:lv1-source',lookup),lookup);
  const result=resolveDarkMimicLv1Standby(paid.state,paid.resolutionPlan,{effectNegated:true});
  assert.equal(result.status,'negated');assert.equal(result.state.core.players[0].grave.at(-1).uid,'m0:lv1-source');
  assert.equal(result.state.core.players[0].monsters.length,0);
});
test('LV1 Standby resolution does not summon if its selected LV3 left the active hand/Deck',()=>{
  const state=makeState({phase:'standby'});
  const paid=payDarkMimicLv1StandbyCost(state,planDarkMimicLv1Standby(state,'m0:lv1-source',lookup),lookup);
  paid.state.core.players[0].deck=paid.state.core.players[0].deck.filter(card=>card.uid!=='m0:lv3-target');
  const result=resolveDarkMimicLv1Standby(paid.state,paid.resolutionPlan,{targetUid:'m0:lv3-target'});
  assert.equal(result.status,'no-target');assert.equal(result.state.core.players[0].monsters.length,0);
});
test('LV1 Standby resolution rechecks the 3 Monster Zone limit and never discards above six immediately',()=>{
  const state=makeState({phase:'standby',hand0Length:6});
  const paid=payDarkMimicLv1StandbyCost(state,planDarkMimicLv1Standby(state,'m0:lv1-source',lookup),lookup);
  paid.state.core.players[0].monsters.push(
    {uid:'m0:extra-a',id:NORMAL,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0},
    {uid:'m0:extra-b',id:NORMAL,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0}
  );
  const result=resolveDarkMimicLv1Standby(paid.state,paid.resolutionPlan,{targetUid:'m0:lv3-target'});
  assert.equal(result.status,'no-zone');
  assert.equal(result.state.core.players[0].hand.length,6);
});
test('LV3 battle trigger draws one when it was not Special Summoned by Dark Mimic LV1',()=>{
  const state=makeState({sourceUid:'m0:lv3-source',sourceId:LV3,currentTeam:1});
  state.core.current=1;state.cursor=1;state.core.teamRotation.cursor=1;
  const event=battleDestroy(state,'m0:lv3-source',0);
  const result=resolveDarkMimicLv3BattleDraw(state,planDarkMimicLv3BattleDraw(state,event,lookup));
  assert.equal(result.drawnUids.length,1);assert.equal(result.drawnUids[0],'m0:draw-top');
});
test('LV3 Special Summoned by LV1 draws two after battle destruction',()=>{
  const state=makeState({phase:'standby'});
  const paid=payDarkMimicLv1StandbyCost(state,planDarkMimicLv1Standby(state,'m0:lv1-source',lookup),lookup);
  const summoned=resolveDarkMimicLv1Standby(paid.state,paid.resolutionPlan,{targetUid:'m0:lv3-target'});
  const event=battleDestroy(summoned.state,'m0:lv3-target',0);
  const result=resolveDarkMimicLv3BattleDraw(summoned.state,planDarkMimicLv3BattleDraw(summoned.state,event,lookup));
  assert.equal(result.drawnUids.length,2);assert.equal(result.drawnUids[0],'m0:draw-top');
  assert.equal(result.drawnUids[1],'m0:d2');
});
test('LV3 summoned by LV1 draws for its current controller when stolen, but returns to owner GY',()=>{
  const state=makeState({sourceUid:'m1:stolen-lv3',sourceId:LV3,currentTeam:1});
  state.core.current=1;state.cursor=1;state.core.teamRotation.cursor=1;
  state.core.players[0].monsters=[];state.core.players[1].monsters=[state.core.players[0].monsters[0]].filter(Boolean);
  state.core.players[1].monsters=[{uid:'m1:stolen-lv3',id:LV3,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0}];
  state.core.cardLifetimes['m1:stolen-lv3']={zone:'monsters',epoch:3};
  state.darkMimic={lv1StandbyUsedTurnByInstance:{},lv3SummonedByLv1ByInstance:{'m1:stolen-lv3@3':true},lv1FlipEvents:{},lv3BattleEvents:{}};
  const event=battleDestroy(state,'m1:stolen-lv3',1);
  const result=resolveDarkMimicLv3BattleDraw(state,planDarkMimicLv3BattleDraw(state,event,lookup));
  assert.equal(result.drawnUids.length,2);
  assert.equal(result.state.core.players[1].grave.length,1);
  assert.equal(result.state.core.players[0].hand.length,7);
});
test('LV3 draw-two overflow is deferred to End Phase, never discarded by the adapter',()=>{
  const state=makeState({sourceUid:'m0:lv3-source',sourceId:LV3,currentTeam:1,hand0Length:6});
  state.core.current=1;state.cursor=1;state.core.teamRotation.cursor=1;
  state.darkMimic={lv1StandbyUsedTurnByInstance:{},lv3SummonedByLv1ByInstance:{'m0:lv3-source@0':true},lv1FlipEvents:{},lv3BattleEvents:{}};
  const event=battleDestroy(state,'m0:lv3-source',0);
  const result=resolveDarkMimicLv3BattleDraw(state,planDarkMimicLv3BattleDraw(state,event,lookup));
  assert.equal(result.state.core.players[0].hand.length,8);
  assert.equal(result.handLimitDeferred,true);
});
test('LV3 draw-two with one remaining card draws what is available then loses on the failed second draw',()=>{
  const state=makeState({sourceUid:'m0:lv3-source',sourceId:LV3,currentTeam:1,deck0Length:1});
  state.core.current=1;state.cursor=1;state.core.teamRotation.cursor=1;
  state.darkMimic={lv1StandbyUsedTurnByInstance:{},lv3SummonedByLv1ByInstance:{'m0:lv3-source@0':true},lv1FlipEvents:{},lv3BattleEvents:{}};
  const event=battleDestroy(state,'m0:lv3-source',0);
  const result=resolveDarkMimicLv3BattleDraw(state,planDarkMimicLv3BattleDraw(state,event,lookup));
  assert.equal(result.drawnUids.length,1);assert.equal(result.deckOut,true);
  assert.equal(result.state.core.phase,'finished');assert.equal(result.state.core.winner,'tag-team-1');
});
test('LV3 event must be battle destruction and sent to the owner Graveyard',()=>{
  const state=makeState({sourceUid:'m0:lv3-source',sourceId:LV3,currentTeam:1});
  state.core.current=1;state.cursor=1;state.core.teamRotation.cursor=1;
  const event=battleDestroy(state,'m0:lv3-source',0);
  assert.throws(()=>planDarkMimicLv3BattleDraw(state,{...event,destroyedByBattle:false},lookup),/destruição por batalha/);
  assert.throws(()=>planDarkMimicLv3BattleDraw(state,{...event,sentToGY:false},lookup),/destruição por batalha/);
});
test('LV3 battle event is idempotent and negation consumes the trigger without drawing',()=>{
  const state=makeState({sourceUid:'m0:lv3-source',sourceId:LV3,currentTeam:1});
  state.core.current=1;state.cursor=1;state.core.teamRotation.cursor=1;
  const event=battleDestroy(state,'m0:lv3-source',0);
  const plan=planDarkMimicLv3BattleDraw(state,event,lookup);
  const negated=resolveDarkMimicLv3BattleDraw(state,plan,true);
  assert.equal(negated.status,'negated');assert.equal(negated.drawnUids.length,0);
  assert.throws(()=>resolveDarkMimicLv3BattleDraw(negated.state,plan),/já foi resolvido/);
});
test('the LV3 battle trigger resolves after the source leaves the GY following activation',()=>{
  const state=makeState({sourceUid:'m0:lv3-source',sourceId:LV3,currentTeam:1});
  state.core.current=1;state.cursor=1;state.core.teamRotation.cursor=1;
  const event=battleDestroy(state,'m0:lv3-source',0);
  const plan=planDarkMimicLv3BattleDraw(state,event,lookup);
  const moved=structuredClone(state);moved.core.players[0].grave=[];
  const result=resolveDarkMimicLv3BattleDraw(moved,plan);
  assert.equal(result.drawnUids.length,1);
});
test('a stolen LV3 returns to its physical owner Graveyard but draws for its controller team',()=>{
  const state=makeState({sourceUid:'m1:stolen-lv3',sourceId:LV3,currentTeam:1});
  state.core.current=1;state.cursor=1;state.core.teamRotation.cursor=1;
  const event=battleDestroy(state,'m1:stolen-lv3',0);
  const plan=planDarkMimicLv3BattleDraw(state,event,lookup);
  assert.equal(plan.sourceOwnerTeam,1);assert.equal(plan.controllerTeam,0);
  const result=resolveDarkMimicLv3BattleDraw(state,plan);
  assert.equal(result.drawnUids[0],'m0:draw-top');
  assert.equal(result.state.core.players[1].grave.at(-1).uid,'m1:stolen-lv3');
});
test('the same physical LV3 copy loses its LV1 origin bonus after leaving and re-entering the field',()=>{
  const state=makeState({sourceUid:'m0:lv3-source',sourceId:LV3,currentTeam:1});
  state.core.current=1;state.cursor=1;state.core.teamRotation.cursor=1;
  state.core.cardLifetimes['m0:lv3-source']={zone:'monsters',epoch:4};
  state.darkMimic={lv1StandbyUsedTurnByInstance:{},lv3SummonedByLv1ByInstance:{'m0:lv3-source@3':true},lv1FlipEvents:{},lv3BattleEvents:{}};
  const event=battleDestroy(state,'m0:lv3-source',0);
  const plan=planDarkMimicLv3BattleDraw(state,event,lookup);
  assert.equal(plan.drawCount,1);
});
test('Dark Mimic preserves all physical UIDs, 3+3 zones, Field Zone and Extra Deck without grants',()=>{
  const state=makeState();
  const before=inventory(state);
  const plan=planDarkMimicLv1Flip(state,event(state,'m0:lv1-source'),'m0:lv1-source',lookup);
  const result=resolveDarkMimicLv1Flip(state,plan);
  assert.deepEqual(inventory(result.state),before);
  assert.equal(result.state.core.players[0].backrow.length,3);
  assert.ok(result.state.core.players[0].field);
  assert.equal(result.state.core.players[0].extra.length,5);
  assert.equal(result.state.core.players[0].monsters.length,1);
});
test('LV1 Standby can Special Summon LV3 from the active representative Hand',()=>{
  const state=makeState({phase:'standby',targetZone:'hand',targetUid:'m0:lv3-hand'});
  const before=inventory(state);
  const paid=payDarkMimicLv1StandbyCost(state,planDarkMimicLv1Standby(state,'m0:lv1-source',lookup),lookup);
  const result=resolveDarkMimicLv1Standby(paid.state,paid.resolutionPlan,{targetUid:'m0:lv3-hand'});
  assert.equal(result.status,'summoned');
  assert.deepEqual(inventory(result.state),before);
});
test('planning is pure and does not mutate the saved duel snapshot',()=>{
  const state=makeState({phase:'standby'});
  const before=JSON.stringify(state);
  planDarkMimicLv1Standby(state,'m0:lv1-source',lookup);
  assert.equal(JSON.stringify(state),before);
  const battle=makeState({sourceUid:'m0:lv3-source',sourceId:LV3,currentTeam:1});
  battle.core.current=1;battle.cursor=1;battle.core.teamRotation.cursor=1;
  const event=battleDestroy(battle,'m0:lv3-source',0);
  const afterEvent=JSON.stringify(battle);
  planDarkMimicLv3BattleDraw(battle,event,lookup);
  assert.equal(JSON.stringify(battle),afterEvent);
});
test('LV3 battle draw rejects a forged draw count even when the event identity is valid',()=>{
  const state=makeState({sourceUid:'m0:lv3-source',sourceId:LV3,currentTeam:1});
  state.core.current=1;state.cursor=1;state.core.teamRotation.cursor=1;
  const event=battleDestroy(state,'m0:lv3-source',0);
  const plan=planDarkMimicLv3BattleDraw(state,event,lookup);
  assert.throws(()=>resolveDarkMimicLv3BattleDraw(state,{...plan,drawCount:2}),/adulterada/);
});
test('a once-per-turn LV1 instance may use its Standby effect again only after leaving and re-entering',()=>{
  const state=makeState({phase:'standby'});
  const plan=planDarkMimicLv1Standby(state,'m0:lv1-source',lookup);
  const paid=payDarkMimicLv1StandbyCost(state,plan,lookup);
  const returned=structuredClone(paid.state);
  returned.core.players[0].grave=returned.core.players[0].grave.filter(card=>card.uid!=='m0:lv1-source');
  returned.core.players[0].monsters.push({uid:'m0:lv1-source',id:LV1,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0});
  returned.core.cardLifetimes['m0:lv1-source']={zone:'monsters',epoch:2};
  const next=planDarkMimicLv1Standby(returned,'m0:lv1-source',lookup);
  assert.equal(next.sourceInstanceKey,'m0:lv1-source@2');
});
test('all four physical seats retain 20-card Main Deck ownership and Extra Deck limit 5 in the fixture',()=>{
  const state=makeState();
  const mainCounts=[0,1,2,3].map(seat=>{
    const held=state.active.includes(seat)?state.core.players[seat%2]:state.reserves[String(seat)];
    return held.deck.length+held.hand.length+(state.core.players[0].monsters.some(m=>m.uid.startsWith('m'+seat+':'))?1:0);
  });
  assert.deepEqual(mainCounts,[20,20,20,20]);
  assert.deepEqual([state.core.players[0].extra.length,state.core.players[1].extra.length,state.reserves['2'].extra.length,state.reserves['3'].extra.length],[5,5,5,5]);
});
