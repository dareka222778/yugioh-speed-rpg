'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {tagInventory}=require('../dist/tagDuel');
const {
  STEALTH_BIRD_ID,DES_LACOODA_ID,planFlipSummon,resolveFlipSummon,planSelfSet,resolveSelfSet
}=require('../dist/flipCycleTagAdapter');

const lookup=id=>[STEALTH_BIRD_ID,DES_LACOODA_ID].includes(id)?{kind:'monster',monsterType:'effect'}:undefined;
const ref=(uid,id='00000001')=>({uid,id});
function makeState({
  cardId=STEALTH_BIRD_ID,sourceUid='m0:source',sourceTeam=0,ownerSeat=0,currentTeam=sourceTeam,
  phase='main',lp=[4000,4000],deck0=[ref('m0:deck-top')],deck1=[ref('m1:deck-top')],
  hand0=[],hand1=[],sourceFaceUp=true,sourcePosition='atk',epoch=0
}={}){
  const active=[0,1];
  const reserves={
    '2':{deck:[ref('m2:reserve-deck')],hand:[],extra:[]},
    '3':{deck:[ref('m3:reserve-deck')],hand:[],extra:[]}
  };
  const players=[
    {id:'tag-team-0',name:'Equipe Azul',lp:lp[0],deck:deck0,hand:hand0,monsters:[],backrow:[],grave:[],extra:[],banished:[],field:null,summoned:false},
    {id:'tag-team-1',name:'Equipe Vermelha',lp:lp[1],deck:deck1,hand:hand1,monsters:[],backrow:[],grave:[],extra:[],banished:[],field:null,summoned:false}
  ];
  players[sourceTeam].monsters.push({uid:sourceUid,id:cardId,position:sourcePosition,faceUp:sourceFaceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0});
  const cursor=active[currentTeam];
  const teamRotation={version:1,cursor,active,reserves};
  const core={version:1,players,turn:1,current:currentTeam,phase,resume:'main',priority:currentTeam,passes:0,pending:{kind:'none'},chain:[],winner:null,reason:'',log:[],teamRotation,cardLifetimes:{[sourceUid]:{zone:'monsters',epoch}}};
  const members=[
    {id:'p0',name:'P0',team:0},{id:'p1',name:'P1',team:1},
    {id:'p2',name:'P2',team:0},{id:'p3',name:'P3',team:1}
  ];
  return {version:1,mode:'tag-classic',members,active,cursor,reserves,core};
}
const event=(state,uid,summonType='flip')=>({kind:'flip-summon',sourceUid:uid,turn:state.core.turn,summonType,previousFaceUp:false,faceUp:true});
const source=(state,team=0)=>state.core.players[team].monsters[0];
const ids=state=>tagInventory(state).map(card=>card.uid+'='+card.id).sort();

test('Stealth Bird only plans 1000 damage on a real Flip Summon',()=>{
  const state=makeState({cardId:STEALTH_BIRD_ID});
  const plan=planFlipSummon(state,event(state,'m0:source'),'m0:source',lookup);
  assert.equal(plan.outcome,'burn');assert.equal(plan.amount,1000);assert.equal(plan.controllerTeam,0);
  const result=resolveFlipSummon(state,plan);
  assert.equal(result.damage,1000);assert.equal(result.state.core.players[1].lp,3000);
});

test('Des Lacooda draws exactly one card for the active controller team',()=>{
  const state=makeState({cardId:DES_LACOODA_ID,deck0:[ref('m0:drawn')],deck1:[ref('m1:untouched')]});
  const plan=planFlipSummon(state,event(state,'m0:source'),'m0:source',lookup);
  const result=resolveFlipSummon(state,plan);
  assert.equal(result.drawnUid,'m0:drawn');assert.equal(result.state.core.players[0].hand.at(-1).uid,'m0:drawn');
  assert.equal(result.state.core.players[0].deck.length,0);assert.equal(result.state.core.players[1].deck[0].uid,'m1:untouched');
});

test('a hand can exceed six after Des Lacooda; discard is deferred to End Phase',()=>{
  const hand=Array.from({length:6},(_,i)=>ref('m0:h'+i));
  const state=makeState({cardId:DES_LACOODA_ID,hand0:hand,deck0:[ref('m0:drawn')]});
  const result=resolveFlipSummon(state,planFlipSummon(state,event(state,'m0:source'),'m0:source',lookup));
  assert.equal(result.state.core.players[0].hand.length,7);
  assert.equal(result.handLimitDeferred,true);
  assert.equal(result.state.core.players[0].deck.length,0);
});

test('an empty Deck on mandatory draw causes a deck-out loss',()=>{
  const state=makeState({cardId:DES_LACOODA_ID,deck0:[]});
  const result=resolveFlipSummon(state,planFlipSummon(state,event(state,'m0:source'),'m0:source',lookup));
  assert.equal(result.state.core.phase,'finished');assert.equal(result.state.core.winner,'tag-team-1');
  assert.equal(result.state.core.reason,'não conseguiu comprar uma carta');
});

test('Stealth Bird lethal damage ends the duel for its controller team',()=>{
  const state=makeState({lp:[4000,500]});
  const result=resolveFlipSummon(state,planFlipSummon(state,event(state,'m0:source'),'m0:source',lookup));
  assert.equal(result.state.core.players[1].lp,-500);assert.equal(result.state.core.winner,'tag-team-0');
  assert.equal(result.state.core.phase,'finished');
});

test('a stolen Flip Cycle monster resolves for the controlling team, not its physical owner team',()=>{
  const state=makeState({sourceUid:'m0:stolen',sourceTeam:1,ownerSeat:0,currentTeam:1});
  const result=resolveFlipSummon(state,planFlipSummon(state,event(state,'m0:stolen'),'m0:stolen',lookup));
  assert.equal(result.state.core.players[0].lp,3000);assert.equal(result.state.core.players[1].lp,4000);
});

test('an inactive partner-owned Des Lacooda draws for the active representative',()=>{
  const state=makeState({cardId:DES_LACOODA_ID,sourceUid:'m2:partner',sourceTeam:0,ownerSeat:2,currentTeam:0,deck0:[ref('m0:active-draw')]});
  const result=resolveFlipSummon(state,planFlipSummon(state,event(state,'m2:partner'),'m2:partner',lookup));
  assert.equal(result.state.core.players[0].hand.at(-1).uid,'m0:active-draw');
  assert.equal(result.state.reserves['2'].hand.length,0);
});

test('a trigger plan still resolves if the source leaves the field after activation',()=>{
  const state=makeState({cardId:DES_LACOODA_ID,deck0:[ref('m0:drawn')]});
  const plan=planFlipSummon(state,event(state,'m0:source'),'m0:source',lookup);
  const afterActivation=structuredClone(state);afterActivation.core.players[0].monsters=[];
  const result=resolveFlipSummon(afterActivation,plan);
  assert.equal(result.drawnUid,'m0:drawn');
});

test('a negated Flip Summon trigger performs no draw or damage',()=>{
  const state=makeState({cardId:DES_LACOODA_ID,deck0:[ref('m0:drawn')]});
  const result=resolveFlipSummon(state,planFlipSummon(state,event(state,'m0:source'),'m0:source',lookup),true);
  assert.equal(result.status,'negated');assert.equal(result.state.core.players[0].deck.length,1);
  const bird=makeState({lp:[4000,4000]});
  const negated=resolveFlipSummon(bird,planFlipSummon(bird,event(bird,'m0:source'),'m0:source',lookup),true);
  assert.equal(negated.state.core.players[1].lp,4000);
});

test('Normal Summon and effect-flip events do not trigger either card',()=>{
  const state=makeState();
  assert.throws(()=>planFlipSummon(state,event(state,'m0:source','normal'),'m0:source',lookup),/Invocação-Virar/);
  assert.throws(()=>planFlipSummon(state,{...event(state,'m0:source'),kind:'effect-flip'},'m0:source',lookup),/Invocação-Virar/);
});

test('stale turn events and events from another team are rejected',()=>{
  const state=makeState();
  assert.throws(()=>planFlipSummon(state,{...event(state,'m0:source'),turn:2},'m0:source',lookup),/Invocação-Virar/);
  const wrongTeam=makeState({currentTeam:1});
  assert.throws(()=>planFlipSummon(wrongTeam,event(wrongTeam,'m0:source'),'m0:source',lookup),/equipe ativa/);
});

test('face-down source cannot trigger or self-set again',()=>{
  const state=makeState({sourceFaceUp:false,sourcePosition:'def'});
  assert.throws(()=>planSelfSet(state,'m0:source',lookup),/face para cima/);
  assert.throws(()=>planFlipSummon(state,event(state,'m0:source'),'m0:source',lookup),/face para cima/);
});

test('self-set is a Main Phase ignition and changes the source to face-down Defense',()=>{
  const state=makeState({cardId:STEALTH_BIRD_ID,sourcePosition:'atk'});
  const plan=planSelfSet(state,'m0:source',lookup);
  const result=resolveSelfSet(state,plan);
  assert.equal(result.status,'set-face-down');
  assert.equal(source(result.state).position,'def');assert.equal(source(result.state).faceUp,false);
});

test('self-set is unavailable outside Main Phase or while a chain is pending',()=>{
  const battle=makeState({phase:'battle'});
  assert.throws(()=>planSelfSet(battle,'m0:source',lookup),/Fase Principal/);
  const chain=makeState();chain.core.chain.push({});
  assert.throws(()=>planSelfSet(chain,'m0:source',lookup),/Fase Principal/);
  const pending=makeState();pending.core.pending={kind:'attack'};
  assert.throws(()=>planSelfSet(pending,'m0:source',lookup),/Fase Principal/);
});

test('the self-set once-per-turn marker is per UID, not per card name',()=>{
  const state=makeState();
  const second={...source(state),uid:'m0:second'};
  state.core.players[0].monsters.push(second);
  const firstPlan=planSelfSet(state,'m0:source',lookup);
  const secondPlan=planSelfSet(state,'m0:second',lookup);
  const first=resolveSelfSet(state,firstPlan);
  const secondResult=resolveSelfSet(first.state,secondPlan);
  assert.equal(source(first.state).faceUp,false);
  assert.equal(secondResult.state.core.players[0].monsters[1].faceUp,false);
});

test('negated self-set consumes the once-per-turn use without changing position',()=>{
  const state=makeState();
  const result=resolveSelfSet(state,planSelfSet(state,'m0:source',lookup),true);
  assert.equal(result.status,'negated');assert.equal(source(result.state).faceUp,true);
  assert.throws(()=>planSelfSet(result.state,'m0:source',lookup),/já usou/);
});

test('self-set marker survives JSON restoration and blocks a second use',()=>{
  const state=makeState();
  const result=resolveSelfSet(state,planSelfSet(state,'m0:source',lookup));
  const restored=JSON.parse(JSON.stringify(result.state));
  assert.throws(()=>planSelfSet(restored,'m0:source',lookup),/já usou/);
});

test('source removal before self-set resolution consumes the use but does not move a missing card',()=>{
  const state=makeState();
  const plan=planSelfSet(state,'m0:source',lookup);
  const afterActivation=structuredClone(state);afterActivation.core.players[0].monsters=[];
  const result=resolveSelfSet(afterActivation,plan);
  assert.equal(result.status,'source-left-field');
  assert.equal(result.state.core.players[0].monsters.length,0);
  assert.throws(()=>planSelfSet(result.state,'m0:source',lookup),/Zona de Monstro/);
});

test('a new zone epoch allows a returned physical copy to use self-set again',()=>{
  const state=makeState();
  const first=resolveSelfSet(state,planSelfSet(state,'m0:source',lookup));
  const returned=structuredClone(first.state);
  returned.core.cardLifetimes['m0:source']={zone:'monsters',epoch:1};
  source(returned).faceUp=true;source(returned).position='atk';
  const second=planSelfSet(returned,'m0:source',lookup);
  assert.notEqual(second.instanceKey,first.instanceKey);
  assert.equal(resolveSelfSet(returned,second).status,'set-face-down');
});

test('the adapter rejects duplicate UIDs, malformed physical owners and more than three monster zones',()=>{
  const duplicate=makeState();
  duplicate.core.players[1].monsters.push({...source(duplicate)});
  assert.throws(()=>planSelfSet(duplicate,'m0:source',lookup),/única Zona de Monstro/);
  const malformed=makeState({sourceUid:'m4:bad'});
  assert.throws(()=>planSelfSet(malformed,'m4:bad',lookup),/proprietário físico válido/);
  const overflow=makeState();
  overflow.core.players[0].monsters.push(
    {...source(overflow),uid:'m0:two'},{...source(overflow),uid:'m0:three'},{...source(overflow),uid:'m0:four'}
  );
  assert.throws(()=>planSelfSet(overflow,'m0:source',lookup),/Estado TagDuel/);
});

test('Flip Cycle effects conserve all physical UIDs and never mutate the input state',()=>{
  const state=makeState({cardId:DES_LACOODA_ID,deck0:[ref('m0:drawn')]});
  const before=JSON.stringify(state),inventory=ids(state);
  const result=resolveFlipSummon(state,planFlipSummon(state,event(state,'m0:source'),'m0:source',lookup));
  assert.equal(JSON.stringify(state),before);
  assert.deepEqual(ids(result.state),inventory);
});
