'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {tagInventory}=require('../dist/tagDuel');
const {
  MORPHING_JAR_ID,planMorphingJarFlip,resolveMorphingJarFlip
}=require('../dist/morphingJarTagAdapter');

const lookup=id=>id===MORPHING_JAR_ID?{kind:'monster',monsterType:'effect'}:undefined;
const ref=(uid,id='00000001')=>({uid,id});
const refs=(seat,prefix,count)=>Array.from({length:count},(_,i)=>ref('m'+seat+':'+prefix+'-'+i));
function makeState({
  cursor=0,sourceTeam=cursor%2,ownerSeat=sourceTeam===0?0:1,
  sourceUid='m'+ownerSeat+':morphing-jar',sourceFaceUp=true,sourceId=MORPHING_JAR_ID,
  deck0,deck1,hand0,hand1,grave0=[],grave1=[],extra0,extra1,reserveHands,reserveDecks
}={}){
  const active=cursor===2?[2,1]:cursor===3?[0,3]:[0,1];
  const reserves={};
  for(const seat of [0,1,2,3])if(!active.includes(seat)){
    reserves[String(seat)]={
      deck:reserveDecks?.[seat]??refs(seat,'reserve-deck',2),
      hand:reserveHands?.[seat]??refs(seat,'reserve-hand',2),
      extra:refs(seat,'reserve-extra',5)
    };
  }
  const players=[
    {
      id:'tag-team-0',name:'Equipe Azul',lp:4000,
      deck:deck0??refs(active[0],'deck-a',8),hand:hand0??refs(active[0],'hand-a',2),
      monsters:[],backrow:[],grave:grave0,extra:extra0??refs(active[0],'extra-a',5),
      banished:[],field:null,summoned:false
    },
    {
      id:'tag-team-1',name:'Equipe Vermelha',lp:4000,
      deck:deck1??refs(active[1],'deck-b',8),hand:hand1??refs(active[1],'hand-b',2),
      monsters:[],backrow:[],grave:grave1,extra:extra1??refs(active[1],'extra-b',5),
      banished:[],field:null,summoned:false
    }
  ];
  players[sourceTeam].monsters.push({
    uid:sourceUid,id:sourceId,position:'def',faceUp:sourceFaceUp,
    entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0
  });
  const teamRotation={version:1,cursor,active,reserves};
  const core={
    version:1,players,turn:1,current:cursor%2,phase:'main',resume:'main',
    priority:cursor%2,passes:0,pending:{kind:'none'},chain:[],winner:null,reason:'',
    log:[],teamRotation,cardLifetimes:{[sourceUid]:{zone:'monsters',epoch:0}}
  };
  const members=[
    {id:'p0',name:'P0',team:0},{id:'p1',name:'P1',team:1},
    {id:'p2',name:'P2',team:0},{id:'p3',name:'P3',team:1}
  ];
  return {version:1,mode:'tag-classic',members,active,cursor,reserves,core};
}
const event=(state,uid='m0:morphing-jar',activationId='activation-1',summonType='flip')=>({
  kind:'flip-summon',sourceUid:uid,turn:state.core.turn,activationId,
  summonType,previousFaceUp:false,faceUp:true
});
const source=(state,team=0)=>state.core.players[team].monsters[0];
const inventory=state=>tagInventory(state).map(card=>card.uid+'='+card.id).sort();
function removeSource(state,team,uid){
  const index=state.core.players[team].monsters.findIndex(card=>card.uid===uid);
  assert.notEqual(index,-1);
  const [card]=state.core.players[team].monsters.splice(index,1);
  state.core.players[team].grave.push({uid:card.uid,id:card.id});
  state.core.cardLifetimes[uid]={zone:'grave',epoch:1};
}

test('a real Flip Summon discards both active hands before each team draws five',()=>{
  const state=makeState({hand0:refs(0,'h0',6),hand1:refs(1,'h1',3),deck0:refs(0,'d0',6),deck1:refs(1,'d1',7)});
  const before=JSON.stringify(state);
  const plan=planMorphingJarFlip(state,event(state), 'm0:morphing-jar',lookup);
  const result=resolveMorphingJarFlip(state,plan);
  assert.equal(result.status,'resolved');
  assert.deepEqual(result.discardedUids[0],refs(0,'h0',6).map(c=>c.uid));
  assert.deepEqual(result.discardedUids[1],refs(1,'h1',3).map(c=>c.uid));
  assert.equal(result.state.core.players[0].grave.length,6);
  assert.equal(result.state.core.players[1].grave.length,3);
  assert.equal(result.state.core.players[0].hand.length,5);
  assert.equal(result.state.core.players[1].hand.length,5);
  assert.deepEqual(result.drawnUids[0],refs(0,'d0',5).map(c=>c.uid));
  assert.deepEqual(result.drawnUids[1],refs(1,'d1',5).map(c=>c.uid));
  assert.equal(result.state.core.players[0].deck.length,1);
  assert.equal(result.state.core.players[1].deck.length,2);
  assert.equal(JSON.stringify(state),before);
});

test('both hands are discarded even when one active hand is empty',()=>{
  const state=makeState({hand0:[],hand1:refs(1,'h1',4),deck0:refs(0,'d0',5),deck1:refs(1,'d1',5)});
  const result=resolveMorphingJarFlip(state,planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup));
  assert.deepEqual(result.discardedUids[0],[]);
  assert.equal(result.discardedUids[1].length,4);
  assert.equal(result.state.core.players[0].hand.length,5);
  assert.equal(result.state.core.players[1].hand.length,5);
});

test('inactive partner reserve hands, Decks and Extra Decks are not affected',()=>{
  const reserveHands={2:refs(2,'partner-hand',3),3:refs(3,'partner-hand',2)};
  const reserveDecks={2:refs(2,'partner-deck',7),3:refs(3,'partner-deck',6)};
  const state=makeState({reserveHands,reserveDecks});
  const before=JSON.stringify(state.reserves);
  const result=resolveMorphingJarFlip(state,planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup));
  assert.equal(JSON.stringify(result.state.reserves),before);
});

test('the first five Deck cards are drawn in order by both active representatives',()=>{
  const state=makeState({deck0:refs(0,'blue',7),deck1:refs(1,'red',8)});
  const result=resolveMorphingJarFlip(state,planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup));
  assert.deepEqual(result.state.core.players[0].hand.slice(-5).map(c=>c.uid),refs(0,'blue',5).map(c=>c.uid));
  assert.deepEqual(result.state.core.players[1].hand.slice(-5).map(c=>c.uid),refs(1,'red',5).map(c=>c.uid));
});

test('exactly five remaining cards is a successful draw, not deck-out',()=>{
  const state=makeState({deck0:refs(0,'d0',5),deck1:refs(1,'d1',5)});
  const result=resolveMorphingJarFlip(state,planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup));
  assert.deepEqual(result.deckOutTeams,[]);
  assert.equal(result.state.core.phase,'main');
  assert.equal(result.state.core.players[0].hand.length,5);
  assert.equal(result.state.core.players[1].hand.length,5);
});

test('a team with fewer than five cards draws what remains and loses by failed draw',()=>{
  const state=makeState({deck0:refs(0,'short',4),deck1:refs(1,'full',6)});
  const result=resolveMorphingJarFlip(state,planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup));
  assert.deepEqual(result.deckOutTeams,[0]);
  assert.equal(result.drawnUids[0].length,4);
  assert.equal(result.drawnUids[1].length,5);
  assert.equal(result.state.core.phase,'finished');
  assert.equal(result.state.core.winner,'tag-team-1');
  assert.equal(result.state.core.players[0].hand.length,4);
  assert.equal(result.state.core.players[1].hand.length,5);
});

test('if both teams cannot draw five, the simultaneous failed draws produce a draw',()=>{
  const state=makeState({deck0:refs(0,'short-a',4),deck1:refs(1,'short-b',3)});
  const result=resolveMorphingJarFlip(state,planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup));
  assert.deepEqual(result.deckOutTeams,[0,1]);
  assert.equal(result.state.core.phase,'finished');
  assert.equal(result.state.core.winner,null);
  assert.equal(result.state.core.reason,'ambas as equipes não conseguiram comprar cinco cartas');
  assert.equal(result.state.core.players[0].hand.length,4);
  assert.equal(result.state.core.players[1].hand.length,3);
});

test('an empty Deck is a failed draw while the opposing team still resolves its five draws',()=>{
  const state=makeState({deck0:[],deck1:refs(1,'full',5)});
  const result=resolveMorphingJarFlip(state,planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup));
  assert.deepEqual(result.deckOutTeams,[0]);
  assert.equal(result.drawnUids[0].length,0);
  assert.equal(result.drawnUids[1].length,5);
  assert.equal(result.state.core.winner,'tag-team-1');
});

test('a stolen Morphing Jar resolves for its controller team, not its physical owner team',()=>{
  const state=makeState({sourceTeam:1,ownerSeat:0,sourceUid:'m0:stolen-jar',cursor:1,deck0:refs(0,'blue',5),deck1:refs(1,'red',5)});
  const plan=planMorphingJarFlip(state,event(state,'m0:stolen-jar'),'m0:stolen-jar',lookup);
  assert.equal(plan.ownerSeat,0);
  assert.equal(plan.controllerTeam,1);
  assert.equal(plan.activeSeat,1);
  const result=resolveMorphingJarFlip(state,plan);
  assert.equal(result.state.core.players[0].hand.length,5);
  assert.equal(result.state.core.players[1].hand.length,5);
});

test('a Flip Summon trigger resolves after the source leaves the Monster Zone',()=>{
  const state=makeState({deck0:refs(0,'blue',5),deck1:refs(1,'red',5)});
  const plan=planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup);
  const afterActivation=structuredClone(state);
  removeSource(afterActivation,0,'m0:morphing-jar');
  const result=resolveMorphingJarFlip(afterActivation,plan);
  assert.equal(result.status,'resolved');
  assert.equal(result.state.core.players[0].hand.length,5);
  assert.equal(result.state.core.players[1].hand.length,5);
});

test('effect negation preserves both hands and Decks while consuming the activation receipt',()=>{
  const state=makeState({hand0:refs(0,'h0',3),hand1:refs(1,'h1',4),deck0:refs(0,'d0',7),deck1:refs(1,'d1',8)});
  const before=JSON.stringify(state.core.players.map(p=>({deck:p.deck,hand:p.hand,grave:p.grave})));
  const plan=planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup);
  const result=resolveMorphingJarFlip(state,plan,true);
  assert.equal(result.status,'negated');
  assert.equal(JSON.stringify(result.state.core.players.map(p=>({deck:p.deck,hand:p.hand,grave:p.grave}))),before);
  assert.throws(()=>planMorphingJarFlip(result.state,event(result.state,'m0:morphing-jar','activation-1'),'m0:morphing-jar',lookup),/já foi resolvida/);
});

test('a successful activation cannot be replayed',()=>{
  const state=makeState();
  const plan=planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup);
  const result=resolveMorphingJarFlip(state,plan);
  assert.throws(()=>resolveMorphingJarFlip(result.state,plan),/Replay/);
});

test('a negated activation cannot be replayed after JSON restoration',()=>{
  const state=makeState();
  const plan=planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup);
  const negated=resolveMorphingJarFlip(state,plan,true);
  const restored=JSON.parse(JSON.stringify(negated.state));
  assert.throws(()=>resolveMorphingJarFlip(restored,plan),/Replay/);
});

test('a JSON-restored successful receipt blocks the same activationId',()=>{
  const state=makeState();
  const plan=planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup);
  const resolved=resolveMorphingJarFlip(state,plan);
  const restored=JSON.parse(JSON.stringify(resolved.state));
  assert.throws(()=>planMorphingJarFlip(restored,event(restored,'m0:morphing-jar','activation-1'),'m0:morphing-jar',lookup),/já foi resolvida/);
});

test('a normal summon is not a Flip Summon trigger',()=>{
  const state=makeState();
  assert.throws(()=>planMorphingJarFlip(state,event(state,'m0:morphing-jar','normal-id','normal'),'m0:morphing-jar',lookup),/Invocação-Virar/);
});

test('an effect-flip is not a Flip Summon trigger',()=>{
  const state=makeState();
  const e=event(state);e.kind='effect-flip';
  assert.throws(()=>planMorphingJarFlip(state,e,'m0:morphing-jar',lookup),/Invocação-Virar/);
});

test('stale turn events are rejected',()=>{
  const state=makeState();
  const e=event(state);e.turn=2;
  assert.throws(()=>planMorphingJarFlip(state,e,'m0:morphing-jar',lookup),/Invocação-Virar/);
});

test('a Morphing Jar controlled by the inactive team cannot activate',()=>{
  const state=makeState({sourceTeam:0,cursor:1});
  assert.throws(()=>planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup),/equipe ativa/);
});

test('a face-down Morphing Jar cannot trigger',()=>{
  const state=makeState({sourceFaceUp:false});
  assert.throws(()=>planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup),/face-up/);
});

test('a different monster cannot use the Morphing Jar adapter',()=>{
  const state=makeState({sourceId:'00000002'});
  assert.throws(()=>planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup),/não é Morphing Jar/);
});

test('the source UID must identify a physical owner seat',()=>{
  const state=makeState({sourceUid:'m4:bad-uid',ownerSeat:0});
  assert.throws(()=>planMorphingJarFlip(state,event(state,'m4:bad-uid'),'m4:bad-uid',lookup),/UID Morphing Jar/);
});

test('duplicate source UID in two Monster Zones is rejected',()=>{
  const state=makeState();
  state.core.players[1].monsters.push({...source(state),uid:'m0:morphing-jar'});
  assert.throws(()=>planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup),/UID duplicado|exatamente uma Zona/);
});

test('more than three Monster Zones are rejected',()=>{
  const state=makeState();
  state.core.players[0].monsters.push(
    {...source(state),uid:'m0:second'},
    {...source(state),uid:'m0:third'},
    {...source(state),uid:'m0:fourth'}
  );
  assert.throws(()=>planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup),/Estado TagDuel/);
});

test('more than three Spell/Trap Zones are rejected',()=>{
  const state=makeState();
  state.core.players[0].backrow=[...refs(0,'backrow',4).map(c=>({...c,faceUp:false,setTurn:1}))];
  assert.throws(()=>planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup),/Estado TagDuel/);
});

test('an Extra Deck above five is rejected',()=>{
  const state=makeState({extra0:refs(0,'extra-overflow',6)});
  assert.throws(()=>planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup),/Zonas da equipe/);
});

test('the current representative seat and its private Deck are respected after rotation',()=>{
  const state=makeState({cursor:2,sourceTeam:0,ownerSeat:2,sourceUid:'m2:jar',deck0:refs(2,'active-blue',5),deck1:refs(1,'active-red',5)});
  const plan=planMorphingJarFlip(state,event(state,'m2:jar'),'m2:jar',lookup);
  assert.equal(plan.activeSeat,2);
  const result=resolveMorphingJarFlip(state,plan);
  assert.equal(result.state.core.players[0].hand.at(-1).uid,'m2:active-blue-4');
  assert.equal(result.state.reserves['0'].deck[0].uid,'m0:reserve-deck-0');
});

test('a plan cannot resolve after the physical representative changes',()=>{
  const first=makeState({cursor:0,sourceTeam:0,ownerSeat:0,sourceUid:'m0:jar'});
  const plan=planMorphingJarFlip(first,event(first,'m0:jar'),'m0:jar',lookup);
  const rotated=makeState({cursor:2,sourceTeam:0,ownerSeat:0,sourceUid:'m0:jar'});
  assert.throws(()=>resolveMorphingJarFlip(rotated,plan),/Plano Morphing Jar/);
});

test('activationId is mandatory and bounded',()=>{
  const state=makeState();
  const empty=event(state);empty.activationId='';
  assert.throws(()=>planMorphingJarFlip(state,empty,'m0:morphing-jar',lookup),/activationId único/);
  const long=event(state);long.activationId='x'.repeat(129);
  assert.throws(()=>planMorphingJarFlip(state,long,'m0:morphing-jar',lookup),/activationId único/);
});

test('all physical UIDs and card identities are conserved through discard and draw',()=>{
  const state=makeState({hand0:refs(0,'h0',6),hand1:refs(1,'h1',5),deck0:refs(0,'d0',7),deck1:refs(1,'d1',8)});
  const before=inventory(state);
  const result=resolveMorphingJarFlip(state,planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup));
  assert.deepEqual(inventory(result.state),before);
});

test('the separate Field Zone is not confused with the three backrow zones',()=>{
  const state=makeState();
  state.core.players[0].field=ref('m0:field-zone');
  const result=resolveMorphingJarFlip(state,planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup));
  assert.equal(result.state.core.players[0].field.uid,'m0:field-zone');
  assert.equal(result.state.core.players[0].backrow.length,0);
});

test('discarded cards retain their physical owner UID in the team Graveyard',()=>{
  const state=makeState({hand0:[ref('m0:owned-by-active'),ref('m0:owned-by-partner')],hand1:[ref('m1:red-hand')]});
  const result=resolveMorphingJarFlip(state,planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup));
  assert.deepEqual(result.state.core.players[0].grave.map(c=>c.uid),['m0:owned-by-active','m0:owned-by-partner']);
  assert.equal(result.state.core.players[1].grave[0].uid,'m1:red-hand');
});

test('the effect never mutates its input and does not grant inventory',()=>{
  const state=makeState();
  const before=JSON.stringify(state);
  const result=resolveMorphingJarFlip(state,planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup));
  assert.equal(JSON.stringify(state),before);
  assert.equal(tagInventory(result.state).length,tagInventory(state).length);
});

test('a malformed active-seat UID in a private Deck is rejected',()=>{
  const state=makeState({deck0:[ref('m2:wrong-seat')]});
  assert.throws(()=>planMorphingJarFlip(state,event(state),'m0:morphing-jar',lookup),/representante físico ativo/);
});
