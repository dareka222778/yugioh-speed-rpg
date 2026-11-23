'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {tagInventory}=require('../dist/tagDuel');
const {
  GUARDIAN_SPHINX_ID,planGuardianSphinxFlipSummon,resolveGuardianSphinxFlipSummon,
  planGuardianSphinxSelfSet,resolveGuardianSphinxSelfSet
}=require('../dist/guardianSphinxMassReturnTagAdapter');

const lookup=id=>id===GUARDIAN_SPHINX_ID?{kind:'monster',monsterType:'effect'}:undefined;
const ref=(uid,id='00000001')=>({uid,id});
function makeState({sourceUid='m0:guardian',sourceTeam=0,currentTeam=sourceTeam,sourceFaceUp=true,phase='main',lp=[4000,4000],hand0=[],hand1=[],epoch=0}={}){
  const active=[0,1];
  const reserves={
    '2':{deck:[ref('m2:reserve-deck')],hand:[],extra:[]},
    '3':{deck:[ref('m3:reserve-deck')],hand:[],extra:[]}
  };
  const players=[
    {id:'tag-team-0',name:'Equipe Azul',lp:lp[0],deck:[ref('m0:deck')],hand:hand0,monsters:[],backrow:[],grave:[],extra:[],banished:[],field:null,summoned:false},
    {id:'tag-team-1',name:'Equipe Vermelha',lp:lp[1],deck:[ref('m1:deck')],hand:hand1,monsters:[],backrow:[],grave:[],extra:[],banished:[],field:null,summoned:false}
  ];
  players[sourceTeam].monsters.push({uid:sourceUid,id:GUARDIAN_SPHINX_ID,position:'atk',faceUp:sourceFaceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0});
  const cursor=active[currentTeam],teamRotation={version:1,cursor,active,reserves};
  const core={version:1,players,turn:1,current:currentTeam,phase,resume:'main',priority:currentTeam,passes:0,pending:{kind:'none'},chain:[],winner:null,reason:'',log:[],teamRotation,cardLifetimes:{[sourceUid]:{zone:'monsters',epoch}}};
  const members=[{id:'p0',name:'P0',team:0},{id:'p1',name:'P1',team:1},{id:'p2',name:'P2',team:0},{id:'p3',name:'P3',team:1}];
  return {version:1,mode:'tag-classic',members,active,cursor,reserves,core};
}
const event=(state,uid,summonType='flip')=>({kind:'flip-summon',sourceUid:uid,turn:state.core.turn,summonType,previousFaceUp:false,faceUp:true});
const addMonster=(state,team,uid,id='00000002',faceUp=true,entityKind)=>{
  state.core.players[team].monsters.push({uid,id,position:'def',faceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0,...(entityKind?{entityKind}:{})});
  state.core.cardLifetimes[uid]={zone:'monsters',epoch:0};
};
const moveSourceToGrave=state=>{
  const source=state.core.players.find(player=>player.monsters.some(monster=>monster.uid==='m0:guardian'));
  const index=source?.monsters.findIndex(monster=>monster.uid==='m0:guardian')??-1;
  assert.notEqual(index,-1);
  const [card]=source.monsters.splice(index,1);source.grave.push({uid:card.uid,id:card.id});
  state.core.cardLifetimes['m0:guardian']={zone:'grave',epoch:1};
};
const physicalInventory=state=>tagInventory(state).filter(card=>card.entityKind!=='token').map(card=>card.uid+'='+card.id).sort();

test('Flip Summon plan is explicitly non-targeting and stores no target list',()=>{
  const state=makeState();const plan=planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup);
  assert.equal(plan.targeting,false);assert.equal(Object.hasOwn(plan,'targets'),false);
});

test('all opposing monsters present at resolution are returned, including ones added after activation',()=>{
  const state=makeState();addMonster(state,1,'m1:first');const plan=planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup);
  addMonster(state,1,'m3:later');
  const result=resolveGuardianSphinxFlipSummon(state,plan);
  assert.equal(result.returnedUids.length,2);assert.equal(result.state.core.players[1].monsters.length,0);
  assert.ok(result.returnedUids.includes('m1:first'));assert.ok(result.returnedUids.includes('m3:later'));
});

test('face-down monsters are included without being selected or revealed',()=>{
  const state=makeState();addMonster(state,1,'m1:face-down','00000003',false);
  const result=resolveGuardianSphinxFlipSummon(state,planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup));
  assert.equal(result.affectedCount,1);
  assert.ok(result.returnedUids.includes('m1:face-down'));
  assert.equal(result.state.core.players[1].hand.at(-1).uid,'m1:face-down');
});

test('each returned monster goes to its physical owner active or reserve hand, including stolen cards',()=>{
  const state=makeState();
  addMonster(state,1,'m1:active-owner');
  addMonster(state,1,'m3:inactive-owner');
  addMonster(state,1,'m0:stolen-from-controller');
  const result=resolveGuardianSphinxFlipSummon(state,planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup));
  assert.ok(result.state.core.players[1].hand.some(card=>card.uid==='m1:active-owner'));
  assert.ok(result.state.reserves['3'].hand.some(card=>card.uid==='m3:inactive-owner'));
  assert.ok(result.state.core.players[0].hand.some(card=>card.uid==='m0:stolen-from-controller'));
});

test('a Guardian Sphinx controlled by team 1 returns every team 0 monster',()=>{
  const state=makeState({sourceUid:'m1:stolen-guardian',sourceTeam:1,currentTeam:1});
  addMonster(state,0,'m0:opponent');
  const result=resolveGuardianSphinxFlipSummon(state,planGuardianSphinxFlipSummon(state,event(state,'m1:stolen-guardian'),'m1:stolen-guardian',lookup));
  assert.equal(result.state.core.players[0].monsters.length,0);
  assert.ok(result.state.core.players[0].hand.some(card=>card.uid==='m0:opponent'));
});

test('zero opposing monsters resolves successfully with no targets',()=>{
  const state=makeState();const result=resolveGuardianSphinxFlipSummon(state,planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup));
  assert.equal(result.status,'resolved');assert.equal(result.affectedCount,0);assert.deepEqual(result.returnedUids,[]);
});

test('negated Flip Summon effect leaves the opposing field untouched',()=>{
  const state=makeState();addMonster(state,1,'m1:opponent');
  const result=resolveGuardianSphinxFlipSummon(state,planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup),true);
  assert.equal(result.status,'negated');assert.equal(result.state.core.players[1].monsters.length,1);
});

test('source removal after activation does not stop the non-targeting effect',()=>{
  const state=makeState();addMonster(state,1,'m1:opponent');
  const plan=planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup);
  const after=structuredClone(state);moveSourceToGrave(after);
  const result=resolveGuardianSphinxFlipSummon(after,plan);
  assert.equal(result.returnedUids.length,1);assert.equal(result.state.core.players[1].monsters.length,0);
});

test('a monster removed before resolution is not returned',()=>{
  const state=makeState();addMonster(state,1,'m1:stays');addMonster(state,1,'m3:leaves');
  const plan=planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup);
  const after=structuredClone(state);
  const index=after.core.players[1].monsters.findIndex(monster=>monster.uid==='m3:leaves');
  const [card]=after.core.players[1].monsters.splice(index,1);after.core.players[1].grave.push({uid:card.uid,id:card.id});
  after.core.cardLifetimes['m3:leaves']={zone:'grave',epoch:1};
  const result=resolveGuardianSphinxFlipSummon(after,plan);
  assert.deepEqual(result.returnedUids,['m1:stays']);
  assert.ok(result.state.core.players[1].grave.some(card=>card.uid==='m3:leaves'));
});

test('tokens disappear instead of entering a physical hand',()=>{
  const state=makeState();addMonster(state,1,'token:temporary','00000000',true,'token');
  const result=resolveGuardianSphinxFlipSummon(state,planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup));
  assert.deepEqual(result.removedTokenUids,['token:temporary']);
  assert.equal(result.state.core.players[1].hand.some(card=>card.uid==='token:temporary'),false);
});

test('returned cards may take a hand above six; discard remains deferred to End Phase',()=>{
  const hand=Array.from({length:6},(_,i)=>ref('m0:h'+i));
  const state=makeState({hand0:hand});addMonster(state,1,'m0:returned-to-active');
  const result=resolveGuardianSphinxFlipSummon(state,planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup));
  assert.equal(result.state.core.players[0].hand.length,7);
  assert.deepEqual(result.handLimitDeferredSeats,[0]);
});

test('self-set uses M550 per-UID marker and survives JSON restoration',()=>{
  const state=makeState();
  const plan=planGuardianSphinxSelfSet(state,'m0:guardian',lookup);
  const result=resolveGuardianSphinxSelfSet(state,plan);
  const restored=JSON.parse(JSON.stringify(result.state));
  assert.equal(restored.core.players[0].monsters[0].faceUp,false);
  assert.throws(()=>planGuardianSphinxSelfSet(restored,'m0:guardian',lookup),/já usou/);
});

test('negated Guardian Sphinx self-set consumes its once-per-turn marker',()=>{
  const state=makeState();
  const result=resolveGuardianSphinxSelfSet(state,planGuardianSphinxSelfSet(state,'m0:guardian',lookup),true);
  assert.equal(result.status,'negated');assert.equal(result.state.core.players[0].monsters[0].faceUp,true);
  assert.throws(()=>planGuardianSphinxSelfSet(result.state,'m0:guardian',lookup),/já usou/);
});

test('normal summon and effect-flip events do not activate the mass return',()=>{
  const state=makeState();
  assert.throws(()=>planGuardianSphinxFlipSummon(state,event(state,'m0:guardian','normal'),'m0:guardian',lookup),/Invocação-Virar/);
  assert.throws(()=>planGuardianSphinxFlipSummon(state,{...event(state,'m0:guardian'),kind:'effect-flip'},'m0:guardian',lookup),/Invocação-Virar/);
});

test('stale turn and wrong controller team are rejected',()=>{
  const state=makeState();
  assert.throws(()=>planGuardianSphinxFlipSummon(state,{...event(state,'m0:guardian'),turn:2},'m0:guardian',lookup),/Invocação-Virar/);
  const wrong=makeState({currentTeam:1});
  assert.throws(()=>planGuardianSphinxFlipSummon(wrong,event(wrong,'m0:guardian'),'m0:guardian',lookup),/equipe ativa/);
});

test('face-down source and wrong card identity are rejected',()=>{
  const faceDown=makeState({sourceFaceUp:false});
  assert.throws(()=>planGuardianSphinxFlipSummon(faceDown,event(faceDown,'m0:guardian'),'m0:guardian',lookup),/face-up/);
  const wrong=makeState();
  wrong.core.players[0].monsters[0].id='00000002';
  assert.throws(()=>planGuardianSphinxFlipSummon(wrong,event(wrong,'m0:guardian'),'m0:guardian',lookup),/fonte não é Guardian/);
});

test('duplicate source UID and malformed physical owner fail closed',()=>{
  const duplicate=makeState();duplicate.core.players[1].monsters.push({...duplicate.core.players[0].monsters[0]});
  assert.throws(()=>planGuardianSphinxFlipSummon(duplicate,event(duplicate,'m0:guardian'),'m0:guardian',lookup),/única Zona de Monstro/);
  const malformed=makeState({sourceUid:'m4:bad'});
  assert.throws(()=>planGuardianSphinxFlipSummon(malformed,event(malformed,'m4:bad'),'m4:bad',lookup),/proprietário físico válido/);
});

test('invalid target owner fails closed without partial movement',()=>{
  const state=makeState();addMonster(state,1,'m4:bad');
  const before=JSON.stringify(state);
  assert.throws(()=>resolveGuardianSphinxFlipSummon(state,planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup)),/UID sem proprietário físico válido/);
  assert.equal(JSON.stringify(state),before);
});

test('duplicate target UID fails closed',()=>{
  const state=makeState();addMonster(state,1,'m1:duplicate');addMonster(state,1,'m1:duplicate');
  const plan=planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup);
  assert.throws(()=>resolveGuardianSphinxFlipSummon(state,plan),/UID duplicado|Monstro adversário duplicado|Inventário físico duplicado/);
});

test('more than three opposing Monster Zones are rejected',()=>{
  const state=makeState();addMonster(state,1,'m1:a');addMonster(state,1,'m1:b');addMonster(state,1,'m1:c');addMonster(state,1,'m1:d');
  assert.throws(()=>planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup),/Estado TagDuel/);
});

test('all physical UIDs are conserved and the input state remains immutable',()=>{
  const state=makeState();addMonster(state,1,'m1:one');addMonster(state,1,'m3:two');
  const before=JSON.stringify(state),inventory=physicalInventory(state);
  const result=resolveGuardianSphinxFlipSummon(state,planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup));
  assert.equal(JSON.stringify(state),before);
  assert.deepEqual(physicalInventory(result.state),inventory);
});

test('hand, deck, extra and Spell/Trap zones are not granted or rebuilt',()=>{
  const state=makeState();addMonster(state,1,'m1:opponent');
  const deck0=state.core.players[0].deck.map(card=>card.uid),extra0=state.core.players[0].extra.map(card=>card.uid);
  const backrow0=state.core.players[0].backrow.map(card=>card.uid);
  const result=resolveGuardianSphinxFlipSummon(state,planGuardianSphinxFlipSummon(state,event(state,'m0:guardian'),'m0:guardian',lookup));
  assert.deepEqual(result.state.core.players[0].deck.map(card=>card.uid),deck0);
  assert.deepEqual(result.state.core.players[0].extra.map(card=>card.uid),extra0);
  assert.deepEqual(result.state.core.players[0].backrow.map(card=>card.uid),backrow0);
});
