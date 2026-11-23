'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {tagInventory}=require('../dist/tagDuel');
const {
  GILASAURUS_ID,
  planGilasaurusSelfSummon,
  resolveGilasaurusSelfSummon,
  getGilasaurusOpponentCandidates,
  planGilasaurusOpponentChoice,
  resolveGilasaurusOpponentChoice
}=require('../dist/gilasaurusTagAdapter');

const lookup=id=>{
  if(id===GILASAURUS_ID)return {kind:'monster',monsterType:'effect'};
  if(id==='spell')return {kind:'spell'};
  if(id==='fusion')return {kind:'monster',monsterType:'fusion'};
  if(id==='ritual')return {kind:'monster',monsterType:'ritual'};
  return {kind:'monster',monsterType:'effect'};
};
const ref=(uid,id='00000001',extra={})=>({uid,id,...extra});
const refs=(seat,prefix,count)=>Array.from({length:count},(_,i)=>ref('m'+seat+':'+prefix+'-'+i));
const monster=(card,owner)=>({
  ...card,owner,position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0
});
function makeState({
  cursor=0,sourceTeam=cursor%2,sourceSeat,sourceUid,sourceId=GILASAURUS_ID,
  hand0,hand1,grave0=[],grave1=[],monsters0=[],monsters1=[],backrow0=[],backrow1=[],
  deck0,deck1,extra0,extra1,reserveHands={},reserveDecks={},sourceInReserve=false,
  field0=null,field1=null
}={}){
  const active=cursor===2?[2,1]:cursor===3?[0,3]:[0,1];
  const ownerSeat=sourceSeat??active[sourceTeam];
  const uid=sourceUid??'m'+ownerSeat+':gilasaurus';
  const source=ref(uid,sourceId);
  const reserves={};
  for(const seat of [0,1,2,3])if(!active.includes(seat)){
    reserves[String(seat)]={
      deck:reserveDecks[seat]??refs(seat,'reserve-deck',2),
      hand:reserveHands[seat]??refs(seat,'reserve-hand',2),
      extra:refs(seat,'reserve-extra',5)
    };
  }
  if(sourceInReserve)reserves[String(ownerSeat)].hand=[source,...(reserveHands[ownerSeat]??refs(ownerSeat,'reserve-hand',2))];
  const activeHand0=hand0??(sourceTeam===0&&!sourceInReserve?[source,...refs(active[0],'hand-a',2)]:refs(active[0],'hand-a',2));
  const activeHand1=hand1??(sourceTeam===1&&!sourceInReserve?[source,...refs(active[1],'hand-b',2)]:refs(active[1],'hand-b',2));
  const players=[
    {
      id:'tag-team-0',name:'Equipe Azul',lp:4000,
      deck:deck0??refs(active[0],'deck-a',8),hand:activeHand0,
      monsters:monsters0,backrow:backrow0,grave:grave0,extra:extra0??refs(active[0],'extra-a',5),
      banished:[],field:field0,summoned:false
    },
    {
      id:'tag-team-1',name:'Equipe Vermelha',lp:4000,
      deck:deck1??refs(active[1],'deck-b',8),hand:activeHand1,
      monsters:monsters1,backrow:backrow1,grave:grave1,extra:extra1??refs(active[1],'extra-b',5),
      banished:[],field:field1,summoned:false
    }
  ];
  const teamRotation={version:1,cursor,active,reserves};
  const core={
    version:1,players,turn:1,current:cursor%2,phase:'main',resume:'main',
    priority:cursor%2,passes:0,pending:{kind:'none'},chain:[],winner:null,reason:'',
    log:[],teamRotation,cardLifetimes:{}
  };
  if(!sourceInReserve)core.cardLifetimes[uid]={zone:'hand',epoch:0};
  const members=[
    {id:'p0',name:'P0',team:0},{id:'p1',name:'P1',team:1},
    {id:'p2',name:'P2',team:0},{id:'p3',name:'P3',team:1}
  ];
  return {version:1,mode:'tag-classic',members,active,cursor,reserves,core};
}
const event=(state,uid='m0:gilasaurus',method='gilasaurus-hand')=>({
  kind:'special-summon',sourceUid:uid,turn:state.core.turn,method,successful:true
});
function summon(state,uid='m0:gilasaurus',activationId='gilasaurus-1'){
  const plan=planGilasaurusSelfSummon(state,event(state,uid),uid,activationId,lookup);
  return resolveGilasaurusSelfSummon(state,plan,lookup);
}
const inventory=state=>tagInventory(state).map(card=>card.uid+'='+card.id).sort();

test('self-Special Summon moves Gilasaurus from the active physical hand to face-up Attack Position',()=>{
  const state=makeState();
  const before=JSON.stringify(state);
  const result=summon(state);
  assert.equal(result.status,'summoned');
  assert.equal(result.state.core.players[0].hand.some(card=>card.uid==='m0:gilasaurus'),false);
  const summoned=result.state.core.players[0].monsters.find(card=>card.uid==='m0:gilasaurus');
  assert.ok(summoned);
  assert.equal(summoned.owner,0);
  assert.equal(summoned.faceUp,true);
  assert.equal(summoned.position,'atk');
  assert.equal(result.state.core.players[0].summoned,false);
  assert.equal(JSON.stringify(state),before);
  assert.deepEqual(inventory(result.state),inventory(state));
  assert.equal(result.trigger.opponentTeam,1);
  assert.equal(result.trigger.opponentSeat,1);
});

test('the active representative may be seat 2 or 3 and physical ownership follows the UID',()=>{
  const blue=summon(makeState({cursor:2,sourceTeam:0,sourceSeat:2}), 'm2:gilasaurus','blue-seat-2');
  assert.equal(blue.state.core.players[0].monsters[0].owner,2);
  assert.equal(blue.trigger.opponentSeat,1);
  const red=summon(makeState({cursor:3,sourceTeam:1,sourceSeat:3}), 'm3:gilasaurus','red-seat-3');
  assert.equal(red.state.core.players[1].monsters[0].owner,3);
  assert.equal(red.trigger.opponentSeat,0);
});

test('Normal Summon and a Special Summon by another effect do not qualify',()=>{
  const state=makeState();
  assert.throws(()=>planGilasaurusSelfSummon(state,event(state,'m0:gilasaurus','normal'),'m0:gilasaurus','normal-1',lookup),/próprio Special Summon/);
  assert.throws(()=>planGilasaurusSelfSummon(state,event(state,'m0:gilasaurus','other-special'),'m0:gilasaurus','other-1',lookup),/próprio Special Summon/);
});

test('Gilasaurus must be in the current representative hand, not an inactive partner reserve',()=>{
  const state=makeState({sourceSeat:2,sourceInReserve:true});
  assert.throws(()=>planGilasaurusSelfSummon(state,event(state,'m2:gilasaurus'),'m2:gilasaurus','reserve-1',lookup),/representante físico ativo/);
});

test('wrong phase, pending decision, chain, or full own field rejects the summon before moving a card',()=>{
  const battle=makeState();battle.core.phase='battle';
  assert.throws(()=>planGilasaurusSelfSummon(battle,event(battle),'m0:gilasaurus','battle-1',lookup),/Main Phase/);
  const pending=makeState();pending.core.pending={kind:'spell',actor:0,card:'x',id:'p'};
  assert.throws(()=>planGilasaurusSelfSummon(pending,event(pending),'m0:gilasaurus','pending-1',lookup),/Main Phase/);
  const chain=makeState();chain.core.chain.push({id:'chain-1'});
  assert.throws(()=>planGilasaurusSelfSummon(chain,event(chain),'m0:gilasaurus','chain-1',lookup),/Main Phase/);
  const full=makeState({monsters0:[0,1,2].map(i=>monster(ref('m0:field-'+i),0))});
  assert.throws(()=>planGilasaurusSelfSummon(full,event(full),'m0:gilasaurus','full-1',lookup),/Zona de Monstro livre/);
  assert.equal(full.core.players[0].hand[0].uid,'m0:gilasaurus');
});

test('the opponent may decline the optional Graveyard Special Summon',()=>{
  const state=summon(makeState()).state;
  const plan=planGilasaurusOpponentChoice(state,'gilasaurus-1',undefined,lookup);
  const result=resolveGilasaurusOpponentChoice(state,plan,false,lookup);
  assert.equal(result.status,'no-legal-monster');
  assert.equal(result.state.core.players[1].monsters.length,0);
  assert.equal(result.state.gilasaurus.pending['gilasaurus-1'],undefined);
  assert.equal(result.state.gilasaurus.resolved['gilasaurus-1'],true);
});

test('the opponent can decline even when a legal monster exists',()=>{
  const state=summon(makeState({grave1:[ref('m1:gy-1')]})).state;
  const plan=planGilasaurusOpponentChoice(state,'gilasaurus-1',undefined,lookup);
  const result=resolveGilasaurusOpponentChoice(state,plan,false,lookup);
  assert.equal(result.status,'declined');
  assert.equal(result.state.core.players[1].grave.length,1);
  assert.equal(result.state.core.players[1].monsters.length,0);
});

test('the opponent chooses at resolution time and revives one monster face-up in Attack Position',()=>{
  const state=summon(makeState()).state;
  state.core.players[1].grave.push(ref('m1:late-grave-card'));
  const candidates=getGilasaurusOpponentCandidates(state,'gilasaurus-1',lookup);
  assert.deepEqual(candidates,['m1:late-grave-card']);
  const plan=planGilasaurusOpponentChoice(state,'gilasaurus-1',candidates[0],lookup);
  const result=resolveGilasaurusOpponentChoice(state,plan,false,lookup);
  assert.equal(result.status,'revived');
  assert.equal(result.summonedUid,'m1:late-grave-card');
  assert.equal(result.ownerSeat,1);
  const revived=result.state.core.players[1].monsters.find(card=>card.uid==='m1:late-grave-card');
  assert.ok(revived);
  assert.equal(revived.owner,1);
  assert.equal(revived.faceUp,true);
  assert.equal(revived.position,'atk');
  assert.equal(result.state.core.players[1].grave.length,0);
});

test('a monster owned by the inactive partner can be revived without changing its physical owner',()=>{
  const state=summon(makeState({grave1:[ref('m3:partner-gy')]})).state;
  const plan=planGilasaurusOpponentChoice(state,'gilasaurus-1','m3:partner-gy',lookup);
  const result=resolveGilasaurusOpponentChoice(state,plan,false,lookup);
  assert.equal(result.status,'revived');
  assert.equal(result.ownerSeat,3);
  assert.equal(result.state.core.players[1].monsters[0].owner,3);
  assert.equal(result.state.core.players[1].monsters[0].uid,'m3:partner-gy');
});

test('the opponent cannot revive a card physically owned by the other team',()=>{
  const state=summon(makeState({grave1:[ref('m0:wrong-team-gy')]})).state;
  assert.deepEqual(getGilasaurusOpponentCandidates(state,'gilasaurus-1',lookup),[]);
  assert.throws(()=>planGilasaurusOpponentChoice(state,'gilasaurus-1','m0:wrong-team-gy',lookup),/não está elegível/);
});

test('only monsters are eligible; tokens, Spells, and improperly summoned Fusion/Ritual monsters are excluded',()=>{
  const grave=[
    ref('m1:spell','spell'),
    ref('m1:token','00000002',{entityKind:'token'}),
    ref('m1:fusion','fusion'),
    ref('m1:ritual','ritual'),
    ref('m1:proper-fusion','fusion',{properlySummoned:true}),
    ref('m1:proper-ritual','ritual',{properlySummoned:true})
  ];
  const state=summon(makeState({grave1:grave})).state;
  assert.deepEqual(
    getGilasaurusOpponentCandidates(state,'gilasaurus-1',lookup),
    ['m1:proper-fusion','m1:proper-ritual']
  );
});

test('a full opposing Monster Zone offers no revival, while the Field Zone remains separate from 3 backrow slots',()=>{
  const monsters=[0,1,2].map(i=>monster(ref('m1:field-'+i),1));
  const state=summon(makeState({
    monsters1:monsters,
    backrow0:refs(0,'backrow',3),
    backrow1:refs(1,'backrow',3),
    field0:ref('m0:field-zone','00000003'),
    field1:ref('m1:field-zone','00000004'),
    grave1:[ref('m1:gy-1')]
  })).state;
  assert.deepEqual(getGilasaurusOpponentCandidates(state,'gilasaurus-1',lookup),[]);
  const plan=planGilasaurusOpponentChoice(state,'gilasaurus-1',undefined,lookup);
  assert.equal(resolveGilasaurusOpponentChoice(state,plan,false,lookup).status,'no-legal-monster');
  assert.equal(state.core.players[0].backrow.length,3);
  assert.equal(state.core.players[1].backrow.length,3);
  assert.ok(state.core.players[0].field);
  assert.ok(state.core.players[1].field);
});

test('the 3+3 zone and Extra Deck 5 boundaries are validated without counting Field Zone as backrow',()=>{
  const valid=makeState({
    backrow0:refs(0,'backrow',3),
    field0:ref('m0:field-zone','00000003'),
    extra0:refs(0,'extra',5)
  });
  assert.equal(summon(valid).status,'summoned');
  const tooManyMonsters=makeState({monsters0:[0,1,2,3].map(i=>monster(ref('m0:too-many-'+i),0))});
  assert.throws(()=>planGilasaurusSelfSummon(tooManyMonsters,event(tooManyMonsters),'m0:gilasaurus','zones-1',lookup),/Estado TagDuel|Zonas 3/);
  const tooMuchBackrow=makeState({backrow0:refs(0,'backrow',4)});
  assert.throws(()=>planGilasaurusSelfSummon(tooMuchBackrow,event(tooMuchBackrow),'m0:gilasaurus','backrow-1',lookup),/Estado TagDuel|Zonas 3/);
  const extraSix=makeState({extra0:refs(0,'extra',6)});
  assert.throws(()=>planGilasaurusSelfSummon(extraSix,event(extraSix),'m0:gilasaurus','extra-1',lookup),/Estado TagDuel|Zonas 3/);
});

test('the effect does not discard an over-six hand early; End Phase owns the hand limit',()=>{
  const state=makeState({hand0:[ref('m0:gilasaurus',GILASAURUS_ID),...refs(0,'extra-hand',7)]});
  const result=summon(state);
  assert.equal(result.state.core.players[0].hand.length,7);
  assert.equal(result.state.core.players[0].grave.length,0);
});

test('a 20-card remaining Deck and all private partner Decks stay unchanged',()=>{
  const state=makeState({
    deck0:refs(0,'deck-a',20),deck1:refs(1,'deck-b',20),
    reserveDecks:{2:refs(2,'reserve-a',20),3:refs(3,'reserve-b',20)}
  });
  const beforeDecks=JSON.stringify({
    active:state.core.players.map(player=>player.deck),
    reserves:state.reserves
  });
  const result=summon(state);
  assert.equal(JSON.stringify({
    active:result.state.core.players.map(player=>player.deck),
    reserves:result.state.reserves
  }),beforeDecks);
});

test('the original state and every physical UID remain unchanged by both resolutions',()=>{
  const state=makeState({grave1:[ref('m1:gy-1')]});
  const before=JSON.stringify(state);
  const summoned=summon(state).state;
  const plan=planGilasaurusOpponentChoice(summoned,'gilasaurus-1','m1:gy-1',lookup);
  const resolved=resolveGilasaurusOpponentChoice(summoned,plan,false,lookup);
  assert.equal(JSON.stringify(state),before);
  assert.deepEqual(inventory(resolved.state),inventory(state));
});

test('the trigger still resolves after Gilasaurus leaves the field or is taken by the opposing controller',()=>{
  const first=summon(makeState({grave1:[ref('m1:gy-1')]})).state;
  const [source]=first.core.players[0].monsters.splice(0,1);
  first.core.players[0].grave.push(ref(source.uid,source.id));
  first.core.cardLifetimes[source.uid]={zone:'grave',epoch:1};
  const plan=planGilasaurusOpponentChoice(first,'gilasaurus-1','m1:gy-1',lookup);
  assert.equal(resolveGilasaurusOpponentChoice(first,plan,false,lookup).status,'revived');

  const second=summon(makeState({grave1:[ref('m1:gy-2')]})).state;
  const [stolen]=second.core.players[0].monsters.splice(0,1);
  second.core.players[1].monsters.push(stolen);
  const stolenPlan=planGilasaurusOpponentChoice(second,'gilasaurus-1','m1:gy-2',lookup);
  const stolenResult=resolveGilasaurusOpponentChoice(second,stolenPlan,false,lookup);
  assert.equal(stolenResult.status,'revived');
  assert.equal(stolenResult.controllerTeam,1);
});

test('negation consumes the activation receipt but changes no Graveyard or field card',()=>{
  const state=summon(makeState({grave1:[ref('m1:gy-1')]})).state;
  const plan=planGilasaurusOpponentChoice(state,'gilasaurus-1','m1:gy-1',lookup);
  const before=inventory(state);
  const result=resolveGilasaurusOpponentChoice(state,plan,true,lookup);
  assert.equal(result.status,'negated');
  assert.deepEqual(inventory(result.state),before);
  assert.equal(result.state.gilasaurus.resolved['gilasaurus-1'],true);
});

test('a JSON save/restore preserves the pending trigger and replay protection',()=>{
  const state=summon(makeState({grave1:[ref('m1:gy-1')]})).state;
  const restored=JSON.parse(JSON.stringify(state));
  const plan=planGilasaurusOpponentChoice(restored,'gilasaurus-1','m1:gy-1',lookup);
  const result=resolveGilasaurusOpponentChoice(restored,plan,false,lookup);
  assert.equal(result.status,'revived');
  assert.throws(()=>planGilasaurusOpponentChoice(result.state,'gilasaurus-1',undefined,lookup),/ausente|resolvida|obsoleta/);
});

test('an activationId cannot be reused while pending or after resolution',()=>{
  const state=makeState();
  const plan=planGilasaurusSelfSummon(state,event(state),'m0:gilasaurus','repeat-1',lookup);
  const summoned=resolveGilasaurusSelfSummon(state,plan,lookup).state;
  assert.throws(()=>planGilasaurusSelfSummon(summoned,event(summoned),'m0:gilasaurus','repeat-1',lookup),/activationId/);
  const declined=resolveGilasaurusOpponentChoice(
    summoned,
    planGilasaurusOpponentChoice(summoned,'repeat-1',undefined,lookup),
    false,lookup
  );
  assert.throws(()=>planGilasaurusOpponentChoice(declined.state,'repeat-1',undefined,lookup),/ausente|resolvida|obsoleta/);
});

test('multiple physical copies may self-Special Summon in one turn with distinct activation IDs',()=>{
  const state=makeState({hand0:[ref('m0:gilasaurus-a',GILASAURUS_ID),ref('m0:gilasaurus-b',GILASAURUS_ID)]});
  const firstPlan=planGilasaurusSelfSummon(state,event(state,'m0:gilasaurus-a'),'m0:gilasaurus-a','copy-a',lookup);
  const first=resolveGilasaurusSelfSummon(state,firstPlan,lookup).state;
  const firstChoice=planGilasaurusOpponentChoice(first,'copy-a',undefined,lookup);
  const afterFirst=resolveGilasaurusOpponentChoice(first,firstChoice,false,lookup).state;
  const secondPlan=planGilasaurusSelfSummon(afterFirst,event(afterFirst,'m0:gilasaurus-b'),'m0:gilasaurus-b','copy-b',lookup);
  const second=resolveGilasaurusSelfSummon(afterFirst,secondPlan,lookup);
  assert.equal(second.state.core.players[0].monsters.filter(card=>card.id===GILASAURUS_ID).length,2);
});

test('malformed, duplicated, wrong-seat, or stale identities are rejected before mutation',()=>{
  const malformed=makeState({sourceUid:'bad:gilasaurus'});
  assert.throws(()=>planGilasaurusSelfSummon(malformed,event(malformed,'bad:gilasaurus'),'bad:gilasaurus','bad-uid',lookup),/UID/);
  const duplicate=makeState();
  duplicate.core.players[0].grave.push(ref('m0:gilasaurus',GILASAURUS_ID));
  assert.throws(()=>planGilasaurusSelfSummon(duplicate,event(duplicate),'m0:gilasaurus','duplicate-uid',lookup),/duplicado/);
  const wrongCard=makeState({sourceId:'00000099'});
  assert.throws(()=>planGilasaurusSelfSummon(wrongCard,event(wrongCard),'m0:gilasaurus','wrong-card',lookup),/não é Gilasaurus/);
  const stale=summon(makeState()).state;
  stale.core.turn=2;
  assert.throws(()=>planGilasaurusOpponentChoice(stale,'gilasaurus-1',undefined,lookup),/turno/);
});

test('a selected GY monster must still be present when the opponent choice resolves',()=>{
  const state=summon(makeState({grave1:[ref('m1:gy-1')]})).state;
  const plan=planGilasaurusOpponentChoice(state,'gilasaurus-1','m1:gy-1',lookup);
  state.core.players[1].grave=[];
  assert.throws(()=>resolveGilasaurusOpponentChoice(state,plan,false,lookup),/obsoleta|Cemitério/);
});

test('a full hand, Deck, Graveyard and separate Field Zone are not rewritten by the opponent choice',()=>{
  const state=summon(makeState({
    hand0:undefined,
    grave1:[ref('m1:gy-1')],
    deck0:refs(0,'deck-a',20),
    deck1:refs(1,'deck-b',20),
    field0:ref('m0:field-zone','00000003'),
    field1:ref('m1:field-zone','00000004')
  })).state;
  const before={
    hand0:JSON.stringify(state.core.players[0].hand),
    hand1:JSON.stringify(state.core.players[1].hand),
    deck0:JSON.stringify(state.core.players[0].deck),
    deck1:JSON.stringify(state.core.players[1].deck),
    field0:JSON.stringify(state.core.players[0].field),
    field1:JSON.stringify(state.core.players[1].field)
  };
  const plan=planGilasaurusOpponentChoice(state,'gilasaurus-1','m1:gy-1',lookup);
  const result=resolveGilasaurusOpponentChoice(state,plan,false,lookup);
  assert.equal(JSON.stringify(result.state.core.players[0].hand),before.hand0);
  assert.equal(JSON.stringify(result.state.core.players[1].hand),before.hand1);
  assert.equal(JSON.stringify(result.state.core.players[0].deck),before.deck0);
  assert.equal(JSON.stringify(result.state.core.players[1].deck),before.deck1);
  assert.equal(JSON.stringify(result.state.core.players[0].field),before.field0);
  assert.equal(JSON.stringify(result.state.core.players[1].field),before.field1);
});
