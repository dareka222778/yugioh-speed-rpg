'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {tagInventory}=require('../dist/tagDuel');
const {
  FIBER_JAR_ID,planFiberJarFlip,resolveFiberJarFlip
}=require('../dist/fiberJarTagAdapter');

const ref=(uid,id='10000001',extra={})=>({uid,id,...extra});
const refs=(seat,prefix,count)=>Array.from({length:count},(_,i)=>ref('m'+seat+':'+prefix+'-'+i));
const lookup=id=>{
  if(id===FIBER_JAR_ID)return {kind:'monster',monsterType:'effect'};
  if(id.startsWith('fusion-'))return {kind:'monster',monsterType:'fusion'};
  if(id.startsWith('spell-'))return {kind:'spell'};
  if(id.startsWith('trap-'))return {kind:'trap'};
  return {kind:'monster',monsterType:'normal'};
};
function activeFor(cursor){
  if(cursor===2)return [2,1];
  if(cursor===3)return [0,3];
  return [0,1];
}
function makeState({
  cursor=0,sourceTeam=cursor%2,ownerSeat=sourceTeam===0?0:1,
  sourceUid='m'+ownerSeat+':fiber-jar',sourceZone='field',sourceFaceUp=true,
  deckCounts=[10,10,10,10],handCounts=[2,3,4,1],extraCounts=[2,2,2,2],
  reserveHands={},reserveDecks={},grave0=[],grave1=[],monsters0=[],monsters1=[],
  backrow0=[],backrow1=[],field0=null,field1=null,banished0=[],banished1=[]
}={}){
  const active=activeFor(cursor);
  const reserves={};
  for(const seat of [0,1,2,3])if(!active.includes(seat)){
    reserves[String(seat)]={
      deck:reserveDecks[seat]??refs(seat,'reserve-deck',deckCounts[seat]),
      hand:reserveHands[seat]??refs(seat,'reserve-hand',handCounts[seat]),
      extra:refs(seat,'reserve-extra',extraCounts[seat])
    };
  }
  const players=[
    {
      id:'tag-team-0',name:'Equipe Azul',lp:4000,
      deck:refs(active[0],'deck-a',deckCounts[active[0]]),
      hand:refs(active[0],'hand-a',handCounts[active[0]]),
      monsters:monsters0,backrow:backrow0,grave:grave0,
      extra:refs(active[0],'extra-a',extraCounts[active[0]]),
      banished:banished0,field:field0,summoned:false
    },
    {
      id:'tag-team-1',name:'Equipe Vermelha',lp:4000,
      deck:refs(active[1],'deck-b',deckCounts[active[1]]),
      hand:refs(active[1],'hand-b',handCounts[active[1]]),
      monsters:monsters1,backrow:backrow1,grave:grave1,
      extra:refs(active[1],'extra-b',extraCounts[active[1]]),
      banished:banished1,field:field1,summoned:false
    }
  ];
  if(sourceZone==='field'){
    players[sourceTeam].monsters.push({
      uid:sourceUid,id:FIBER_JAR_ID,position:'def',faceUp:sourceFaceUp,
      entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0
    });
  }else if(sourceZone==='grave'){
    players[sourceTeam].grave.push(ref(sourceUid,FIBER_JAR_ID));
  }
  const teamRotation={version:1,cursor,active,reserves};
  const core={
    version:1,players,turn:1,current:cursor%2,phase:'main',resume:'main',
    priority:cursor%2,passes:0,pending:{kind:'none'},chain:[],winner:null,reason:'',
    log:[],teamRotation,cardLifetimes:{[sourceUid]:{zone:sourceZone==='field'?'monsters':'grave',epoch:0}}
  };
  const members=[
    {id:'p0',name:'P0',team:0},{id:'p1',name:'P1',team:1},
    {id:'p2',name:'P2',team:0},{id:'p3',name:'P3',team:1}
  ];
  return {version:1,mode:'tag-classic',members,active,cursor,reserves,core};
}
const event=(state,uid='m0:fiber-jar',team=0,cause='flip-summon',activationId='fiber-1')=>({
  kind:'flip',cause,sourceUid:uid,turn:state.core.turn,activationId,
  previousFaceUp:false,faceUp:true,controllerTeam:team,activeSeat:state.active[team]
});
const inventory=state=>tagInventory(state).filter(c=>c.entityKind!=='token').map(c=>c.uid+'='+c.id).sort();
const zeroRandom=()=>0;
function seeded(seed){
  let value=seed>>>0;
  return ()=>{value=(value*1664525+1013904223)>>>0;return value/4294967296;};
}
function removeSourceToGrave(state,team,uid){
  const index=state.core.players[team].monsters.findIndex(card=>card.uid===uid);
  assert.notEqual(index,-1);
  const [card]=state.core.players[team].monsters.splice(index,1);
  state.core.players[team].grave.push(ref(card.uid,card.id));
}

test('FLIP trigger accepts Flip Summon, battle-flip and card-effect flip',()=>{
  for(const cause of ['flip-summon','battle','effect']){
    const state=makeState();
    const plan=planFiberJarFlip(state,event(state,'m0:fiber-jar',0,cause),lookup);
    assert.equal(plan.kind,'fiber-jar-flip');
  }
});
test('a normal face-up summon is not a FLIP event',()=>{
  const state=makeState();
  const e=event(state);e.previousFaceUp=true;
  assert.throws(()=>planFiberJarFlip(state,e,lookup),/FLIP real/);
});
test('reveal-only does not trigger Fiber Jar',()=>{
  const state=makeState();
  const e=event(state);e.cause='reveal';
  assert.throws(()=>planFiberJarFlip(state,e,lookup),/FLIP real/);
});
test('a stale turn event is rejected',()=>{
  const state=makeState();const e=event(state);e.turn=2;
  assert.throws(()=>planFiberJarFlip(state,e,lookup),/FLIP real/);
});
test('all four private hands return to their physical owners before each player draws five',()=>{
  const state=makeState({handCounts:[2,3,4,1],deckCounts:[8,9,7,6]});
  const before=JSON.stringify(state);
  const plan=planFiberJarFlip(state,event(state),lookup);
  const result=resolveFiberJarFlip(state,plan,false,zeroRandom,lookup);
  assert.equal(result.status,'resolved');
  assert.deepEqual(result.returnedUids[0].filter(uid=>uid.includes('hand-a')).length,2);
  assert.equal(result.returnedUids[1].length,3);
  assert.equal(result.returnedUids[2].length,4);
  assert.equal(result.returnedUids[3].length,1);
  for(const seat of [0,1,2,3]){
    const team=seat%2;
    const hand=state.active[team]===seat?result.state.core.players[team].hand:result.state.reserves[String(seat)].hand;
    assert.equal(hand.length,5);
  }
  assert.equal(JSON.stringify(state),before);
});
test('both shared fields and both shared Graveyards are emptied',()=>{
  const state=makeState({
    monsters0:[{uid:'m2:blue-monster',id:'10000002',position:'atk',faceUp:true}],
    monsters1:[{uid:'m3:red-monster',id:'10000003',position:'def',faceUp:false}],
    backrow0:[ref('m0:blue-trap','trap-1',{faceUp:false})],
    backrow1:[ref('m1:red-spell','spell-1',{faceUp:true})],
    grave0:[ref('m2:blue-grave')],grave1:[ref('m3:red-grave')],
    field0:ref('m0:field-blue','spell-2'),field1:ref('m1:field-red','spell-3')
  });
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  for(const team of [0,1]){
    assert.equal(result.state.core.players[team].monsters.length,0);
    assert.equal(result.state.core.players[team].backrow.length,0);
    assert.equal(result.state.core.players[team].grave.length,0);
    assert.equal(result.state.core.players[team].field,null);
  }
  assert.equal(result.returnedUids[0].includes('m0:field-blue'),true);
  assert.equal(result.returnedUids[1].includes('m1:field-red'),true);
});
test('a stolen card on the shared field returns to its physical owner Deck',()=>{
  const state=makeState({monsters0:[{uid:'m3:stolen-monster',id:'10000002',position:'atk',faceUp:true}]});
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  assert.ok(result.returnedUids[3].includes('m3:stolen-monster'));
  assert.ok(result.state.reserves['3'].deck.some(c=>c.uid==='m3:stolen-monster'));
  assert.ok(!result.state.core.players[0].deck.some(c=>c.uid==='m3:stolen-monster'));
});
test('a partner-owned card controlled by the active teammate returns to the partner Deck',()=>{
  const state=makeState({monsters0:[{uid:'m2:partner-card',id:'10000002',position:'atk',faceUp:true}]});
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  assert.ok(result.state.reserves['2'].deck.some(c=>c.uid==='m2:partner-card'));
});
test('Fusion monsters on the field return to their physical Extra Deck',()=>{
  const state=makeState({monsters0:[{uid:'m2:fusion-field',id:'fusion-1',position:'atk',faceUp:true}]});
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  assert.ok(result.state.reserves['2'].extra.some(c=>c.uid==='m2:fusion-field'));
  assert.ok(!result.state.reserves['2'].deck.some(c=>c.uid==='m2:fusion-field'));
});
test('Fusion monsters in the shared Graveyard return to the owner Extra Deck',()=>{
  const state=makeState({grave1:[ref('m3:fusion-grave','fusion-2')]});
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  assert.ok(result.state.reserves['3'].extra.some(c=>c.uid==='m3:fusion-grave'));
});
test('tokens disappear from the field without entering Deck or Graveyard',()=>{
  const token=ref('m0:token-1','token-1',{entityKind:'token'});
  const state=makeState({monsters0:[{...token,position:'atk',faceUp:true}]});
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  assert.deepEqual(result.tokensRemoved,['m0:token-1']);
  assert.ok(!tagInventory(result.state).some(c=>c.uid==='m0:token-1'));
});
test('tokens in a hand or Graveyard are rejected as malformed state',()=>{
  const state=makeState({grave0:[ref('m0:token-bad','token-1',{entityKind:'token'})]});
  const plan=planFiberJarFlip(state,event(state),lookup);
  assert.throws(()=>resolveFiberJarFlip(state,plan,false,zeroRandom,lookup),/Token não pode/);
});
test('banished cards and unrelated Extra Deck cards remain untouched',()=>{
  const banished=ref('m0:banished-card');
  const state=makeState({banished0:[banished],extraCounts:[2,2,2,2]});
  const before=JSON.stringify({banished:state.core.players[0].banished,extra:state.core.players[0].extra});
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  assert.equal(JSON.stringify({banished:result.state.core.players[0].banished,extra:result.state.core.players[0].extra}),before);
});
test('each physical Deck is shuffled independently and draws five cards',()=>{
  const state=makeState({deckCounts:[8,8,8,8],handCounts:[0,0,0,0]});
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,seeded(7),lookup);
  for(const seat of [0,1,2,3])assert.equal(result.drawnUids[seat].length,5);
  assert.notDeepEqual(result.drawnUids[0],result.drawnUids[1]);
});
test('exactly five cards in every physical Deck is a successful draw',()=>{
  const state=makeState({deckCounts:[5,5,5,5],handCounts:[0,0,0,0]});
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  assert.deepEqual(result.deckOutSeats,[]);
  assert.equal(result.state.core.phase,'main');
});
test('one physical seat with fewer than five cards loses for its team',()=>{
  const state=makeState({ownerSeat:2,sourceUid:'m2:fiber-jar',deckCounts:[4,8,8,8],handCounts:[0,0,0,0]});
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  assert.deepEqual(result.deckOutSeats,[0]);
  assert.deepEqual(result.deckOutTeams,[0]);
  assert.equal(result.state.core.winner,'tag-team-1');
  assert.equal(result.state.core.phase,'finished');
});
test('either physical player deck-out causes that team to lose',()=>{
  const state=makeState({deckCounts:[8,4,8,8],handCounts:[0,0,0,0]});
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  assert.deepEqual(result.deckOutSeats,[1]);
  assert.deepEqual(result.deckOutTeams,[1]);
  assert.equal(result.state.core.winner,'tag-team-0');
});
test('simultaneous deck-out on both teams produces a draw',()=>{
  const state=makeState({ownerSeat:2,sourceUid:'m2:fiber-jar',deckCounts:[4,8,8,3],handCounts:[0,0,0,0]});
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  assert.deepEqual(result.deckOutTeams,[0,1]);
  assert.equal(result.state.core.winner,null);
  assert.equal(result.state.core.phase,'finished');
});
test('the source may be destroyed after activation and the effect still resolves',()=>{
  const state=makeState();
  const plan=planFiberJarFlip(state,event(state),lookup);
  const after=structuredClone(state);
  removeSourceToGrave(after,0,'m0:fiber-jar');
  const result=resolveFiberJarFlip(after,plan,false,zeroRandom,lookup);
  assert.equal(result.status,'resolved');
  assert.ok(result.returnedUids[0].includes('m0:fiber-jar'));
});
test('a battle-destroyed source already in the Graveyard can register its FLIP trigger',()=>{
  const state=makeState({sourceZone:'grave'});
  const result=planFiberJarFlip(state,event(state,'m0:fiber-jar',0,'battle'),lookup);
  assert.equal(result.sourceUid,'m0:fiber-jar');
});
test('a stolen Fiber Jar resolves for the controller team while retaining physical owner',()=>{
  const state=makeState({cursor:1,sourceTeam:1,ownerSeat:0,sourceUid:'m0:stolen-fiber'});
  const plan=planFiberJarFlip(state,event(state,'m0:stolen-fiber',1),lookup);
  assert.equal(plan.ownerSeat,0);
  assert.equal(plan.controllerTeam,1);
  const result=resolveFiberJarFlip(state,plan,false,zeroRandom,lookup);
  assert.ok(result.returnedUids[0].includes('m0:stolen-fiber'));
});
test('rotation uses the active and reserve physical Decks, not the former representative',()=>{
  const state=makeState({cursor:2,sourceTeam:0,ownerSeat:2,sourceUid:'m2:rotated-fiber'});
  const plan=planFiberJarFlip(state,event(state,'m2:rotated-fiber',0),lookup);
  const result=resolveFiberJarFlip(state,plan,false,zeroRandom,lookup);
  assert.equal(result.state.core.players[0].hand.length,5);
  assert.equal(result.state.reserves['0'].hand.length,5);
  assert.equal(result.state.core.players[0].deck.every(c=>c.uid.startsWith('m2:')),true);
  assert.equal(result.state.reserves['0'].deck.every(c=>c.uid.startsWith('m0:')),true);
});
test('negation leaves hands, fields, Graveyards and Decks unchanged while consuming receipt',()=>{
  const state=makeState({handCounts:[3,4,2,5]});
  const before=inventory(state);
  const plan=planFiberJarFlip(state,event(state),lookup);
  const result=resolveFiberJarFlip(state,plan,true,zeroRandom,lookup);
  assert.equal(result.status,'negated');
  assert.deepEqual(inventory(result.state),before);
  assert.throws(()=>resolveFiberJarFlip(result.state,plan,false,zeroRandom,lookup),/Replay/);
});
test('a successful activation cannot be replayed after JSON restoration',()=>{
  const state=makeState();
  const plan=planFiberJarFlip(state,event(state),lookup);
  const result=resolveFiberJarFlip(state,plan,false,zeroRandom,lookup);
  const restored=JSON.parse(JSON.stringify(result.state));
  assert.throws(()=>planFiberJarFlip(restored,event(restored),lookup),/já foi resolvida/);
  assert.throws(()=>resolveFiberJarFlip(restored,plan,false,zeroRandom,lookup),/Replay/);
});
test('activationId is mandatory and bounded',()=>{
  const state=makeState();
  const empty=event(state);empty.activationId='';
  assert.throws(()=>planFiberJarFlip(state,empty,lookup),/activationId único/);
  const long=event(state);long.activationId='x'.repeat(129);
  assert.throws(()=>planFiberJarFlip(state,long,lookup),/activationId único/);
});
test('stale physical representative plans are rejected',()=>{
  const state=makeState();
  const plan=planFiberJarFlip(state,event(state),lookup);
  const rotated=makeState({cursor:2,sourceTeam:0,ownerSeat:0,sourceUid:'m0:fiber-jar'});
  assert.throws(()=>resolveFiberJarFlip(rotated,plan,false,zeroRandom,lookup),/Plano Fiber Jar/);
});
test('invalid controller snapshot is rejected',()=>{
  const state=makeState();const e=event(state);e.activeSeat=3;
  assert.throws(()=>planFiberJarFlip(state,e,lookup),/Representante físico ativo/);
});
test('an unknown card identity aborts atomically before any state mutation',()=>{
  const state=makeState({monsters0:[{uid:'m2:unknown',id:'unknown-card',position:'atk',faceUp:true}]});
  const before=JSON.stringify(state);
  const plan=planFiberJarFlip(state,event(state),lookup);
  assert.throws(()=>resolveFiberJarFlip(state,plan,false,zeroRandom,()=>undefined),/sem metadata/);
  assert.equal(JSON.stringify(state),before);
});
test('invalid random source is rejected without mutating the input',()=>{
  const state=makeState();const before=JSON.stringify(state);
  const plan=planFiberJarFlip(state,event(state),lookup);
  assert.throws(()=>resolveFiberJarFlip(state,plan,false,()=>1,lookup),/valor em \[0,1\)/);
  assert.equal(JSON.stringify(state),before);
});
test('all physical UIDs and card identities are conserved',()=>{
  const state=makeState({
    handCounts:[4,3,2,5],monsters0:[{uid:'m2:field-monster',id:'10000002',position:'atk',faceUp:true}],
    backrow1:[ref('m3:field-trap','trap-1')],grave0:[ref('m0:grave-a'),ref('m2:grave-b')],
    grave1:[ref('m1:grave-c'),ref('m3:grave-d')]
  });
  const before=inventory(state);
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,seeded(11),lookup);
  assert.deepEqual(inventory(result.state),before);
});
test('Fiber Jar itself returns to its physical owner Deck',()=>{
  const state=makeState();
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  assert.ok(result.state.core.players[0].deck.some(c=>c.uid==='m0:fiber-jar'));
});
test('the six-card hand limit is not applied during this resolving effect',()=>{
  const state=makeState({handCounts:[6,6,6,6],deckCounts:[10,10,10,10]});
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  for(const seat of [0,1,2,3]){
    const team=seat%2;
    const hand=state.active[team]===seat?result.state.core.players[team].hand:result.state.reserves[String(seat)].hand;
    assert.equal(hand.length,5);
  }
  assert.equal(result.handLimitDeferred,false);
});
test('the Field Zone remains separate from the three Spell/Trap Zones',()=>{
  const state=makeState({field0:ref('m0:field-spell','spell-1'),backrow0:[ref('m0:backrow-spell','spell-2')]});
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  assert.equal(result.state.core.players[0].field,null);
  assert.equal(result.state.core.players[0].backrow.length,0);
  assert.ok(result.returnedUids[0].includes('m0:field-spell'));
  assert.ok(result.returnedUids[0].includes('m0:backrow-spell'));
});
test('more than three Monster Zones are rejected',()=>{
  const state=makeState({monsters0:[
    {uid:'m0:fiber-jar',id:FIBER_JAR_ID,position:'def',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0},
    {uid:'m0:extra-a',id:'10000002',position:'atk',faceUp:true},
    {uid:'m0:extra-b',id:'10000003',position:'atk',faceUp:true},
    {uid:'m0:extra-c',id:'10000004',position:'atk',faceUp:true}
  ]});
  assert.throws(()=>planFiberJarFlip(state,event(state),lookup),/Estado TagDuel/);
});
test('more than three Spell/Trap Zones are rejected',()=>{
  const state=makeState({backrow0:refs(0,'overflow',4).map(c=>({...c,faceUp:false}))});
  assert.throws(()=>planFiberJarFlip(state,event(state),lookup),/Estado TagDuel/);
});
test('an Extra Deck above five is rejected',()=>{
  const state=makeState({extraCounts:[6,2,2,2]});
  assert.throws(()=>planFiberJarFlip(state,event(state),lookup),/Estado TagDuel/);
});
test('the adapter never mutates the input or grants inventory',()=>{
  const state=makeState();const before=JSON.stringify(state);const count=tagInventory(state).length;
  const result=resolveFiberJarFlip(state,planFiberJarFlip(state,event(state),lookup),false,zeroRandom,lookup);
  assert.equal(JSON.stringify(state),before);
  assert.equal(tagInventory(result.state).length,count);
});
