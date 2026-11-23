'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {tagInventory}=require('../dist/tagDuel');
const {
  CYBER_JAR_ID,planCyberJarFlip,resolveCyberJarFlip
}=require('../dist/cyberJarTagAdapter');

const ids={normal4:'normal4',effect3:'effect3',spell:'spell',high5:'high5',fusion4:'fusion4',ritual4:'ritual4',normal2:'normal2',effect4:'effect4',normal1:'normal1'};
const metadata=new Map([
  [ids.normal4,{kind:'monster',monsterType:'normal',level:4}],
  [ids.effect3,{kind:'monster',monsterType:'effect',level:3}],
  [ids.spell,{kind:'spell',level:null}],
  [ids.high5,{kind:'monster',monsterType:'effect',level:5}],
  [ids.fusion4,{kind:'monster',monsterType:'fusion',level:4}],
  [ids.ritual4,{kind:'monster',monsterType:'ritual',level:4}],
  [ids.normal2,{kind:'monster',monsterType:'normal',level:2}],
  [ids.effect4,{kind:'monster',monsterType:'effect',level:4}],
  [ids.normal1,{kind:'monster',monsterType:'normal',level:1}]
]);
const lookup=id=>id===CYBER_JAR_ID?{kind:'monster',monsterType:'effect',level:3}:metadata.get(id);
const ref=(uid,id='unknown')=>({uid,id});
const refs=(seat,prefix,count,id='unknown')=>Array.from({length:count},(_,i)=>ref('m'+seat+':'+prefix+'-'+i,id));
const monster=(uid,id='00000001',faceUp=true,entityKind)=>({
  uid,id,position:faceUp?'atk':'def',faceUp,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0,
  ...(entityKind?{entityKind}:{})
});
function makeState({
  cursor=0,sourceTeam=cursor%2,ownerSeat=sourceTeam===0?0:1,
  sourceUid='m'+ownerSeat+':cyber-jar',sourceFaceUp=true,sourceId=CYBER_JAR_ID,
  deck0,deck1,hand0,hand1,monsters0=[],monsters1=[],extra0,extra1,
  reserveHands,reserveDecks
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
      monsters:[monster(sourceUid,sourceId,sourceFaceUp),...monsters0],backrow:[],grave:[],
      extra:extra0??refs(active[0],'extra-a',5),banished:[],field:null,summoned:false
    },
    {
      id:'tag-team-1',name:'Equipe Vermelha',lp:4000,
      deck:deck1??refs(active[1],'deck-b',8),hand:hand1??refs(active[1],'hand-b',2),
      monsters:monsters1,backrow:[],grave:[],extra:extra1??refs(active[1],'extra-b',5),
      banished:[],field:null,summoned:false
    }
  ];
  if(sourceTeam===1){
    players[0].monsters=monsters0;
    players[1].monsters=[monster(sourceUid,sourceId,sourceFaceUp),...monsters1];
  }
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
const event=(state,uid='m0:cyber-jar',activationId='cyber-activation-1',summonType='flip')=>({
  kind:'flip-summon',sourceUid:uid,turn:state.core.turn,activationId,
  summonType,previousFaceUp:false,faceUp:true
});
const inventory=state=>tagInventory(state).filter(c=>c.entityKind!=='token').map(c=>c.uid+'='+c.id).sort();

test('real Flip Summon destroys both fields, reveals five and resolves both teams',()=>{
  const deck0=[ref('m0:n4',ids.normal4),ref('m0:e3',ids.effect3),ref('m0:spell',ids.spell),ref('m0:high',ids.high5),ref('m0:fusion',ids.fusion4)];
  const deck1=[ref('m1:n2',ids.normal2),ref('m1:e4',ids.effect4),ref('m1:ritual',ids.ritual4),ref('m1:spell',ids.spell),ref('m1:n1',ids.normal1)];
  const state=makeState({deck0,deck1,monsters0:[monster('m2:blue-down','00000002',false)],monsters1:[monster('m3:red-up','00000003',true)]});
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(state),'m0:cyber-jar',lookup),false,{
    'm0:n4':'def','m0:e3':'atk','m1:n2':'def','m1:e4':'atk','m1:n1':'atk'
  });
  assert.deepEqual(result.destroyedUids[0],['m0:cyber-jar','m2:blue-down']);
  assert.deepEqual(result.destroyedUids[1],['m3:red-up']);
  assert.deepEqual(result.revealedUids[0],deck0.map(c=>c.uid));
  assert.deepEqual(result.revealedUids[1],deck1.map(c=>c.uid));
  assert.deepEqual(result.summonedUids[0],['m0:n4','m0:e3']);
  assert.deepEqual(result.summonedUids[1],['m1:n2','m1:e4','m1:n1']);
  assert.deepEqual(result.addedToHandUids[0],['m0:spell','m0:high','m0:fusion']);
  assert.deepEqual(result.addedToHandUids[1],['m1:ritual','m1:spell']);
  assert.equal(result.state.core.players[0].monsters.length,2);
  assert.equal(result.state.core.players[1].monsters.length,3);
  assert.equal(result.state.core.players[0].hand.length,5);
  assert.equal(result.state.core.players[1].hand.length,4);
});

test('face-up and face-down monsters on both shared fields are destroyed',()=>{
  const state=makeState({monsters0:[monster('m2:down','00000002',false)],monsters1:[monster('m3:up','00000003',true)]});
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(),'m0:cyber-jar',lookup));
  assert.deepEqual(result.destroyedUids[0],['m0:cyber-jar','m2:down']);
  assert.deepEqual(result.destroyedUids[1],['m3:up']);
  assert.equal(result.state.core.players[0].grave.length,2);
  assert.equal(result.state.core.players[1].grave.length,1);
});

test('Cyber Jar destroys itself but its already-triggered effect still resolves',()=>{
  const state=makeState({deck0:refs(0,'d0',5,ids.spell),deck1:refs(1,'d1',5,ids.spell)});
  const plan=planCyberJarFlip(state,event(),'m0:cyber-jar',lookup);
  const result=resolveCyberJarFlip(state,plan);
  assert.equal(result.state.core.players[0].monsters.length,0);
  assert.equal(result.state.core.players[0].grave[0].uid,'m0:cyber-jar');
  assert.equal(result.revealedUids[0].length,5);
});

test('tokens disappear without entering either Graveyard or physical inventory',()=>{
  const state=makeState({monsters0:[monster('token-blue','00000001',true,'token')]});
  const before=inventory(state);
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(),'m0:cyber-jar',lookup));
  assert.deepEqual(result.tokenUids[0],['token-blue']);
  assert.equal(result.state.core.players[0].grave.length,1);
  assert.deepEqual(inventory(result.state),before);
});

test('when a Deck has fewer than five cards, only the available cards are revealed',()=>{
  const state=makeState({deck0:refs(0,'short',2,ids.spell),deck1:refs(1,'full',5,ids.spell)});
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(),'m0:cyber-jar',lookup));
  assert.equal(result.revealedUids[0].length,2);
  assert.equal(result.revealedUids[1].length,5);
  assert.deepEqual(result.addedToHandUids[0],['m0:short-0','m0:short-1']);
  assert.deepEqual(result.deckOutTeams??[],[]);
});

test('only Level 4 or lower Normal and Effect monsters are eligible',()=>{
  const deck=[ref('m0:n4',ids.normal4),ref('m0:e3',ids.effect3),ref('m0:high',ids.high5),ref('m0:fusion',ids.fusion4),ref('m0:ritual',ids.ritual4)];
  const state=makeState({deck0:deck,deck1:[]});
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(),'m0:cyber-jar',lookup));
  assert.deepEqual(result.summonedUids[0],['m0:n4','m0:e3']);
  assert.deepEqual(result.addedToHandUids[0],['m0:high','m0:fusion','m0:ritual']);
});

test('face-up Attack Position is supported',()=>{
  const state=makeState({deck0:[ref('m0:e3',ids.effect3)]});
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(),'m0:cyber-jar',lookup),false,{'m0:e3':'atk'});
  const monster=result.state.core.players[0].monsters[0];
  assert.equal(monster.position,'atk');
  assert.equal(monster.faceUp,true);
});

test('face-down Defense Position is supported',()=>{
  const state=makeState({deck0:[ref('m0:e3',ids.effect3)]});
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(),'m0:cyber-jar',lookup),false,{'m0:e3':'def'});
  const monster=result.state.core.players[0].monsters[0];
  assert.equal(monster.position,'def');
  assert.equal(monster.faceUp,false);
});

test('more than three eligible monsters are summoned only up to the three-zone limit',()=>{
  const deck=[ref('m0:a',ids.normal4),ref('m0:b',ids.effect3),ref('m0:c',ids.normal2),ref('m0:d',ids.effect4),ref('m0:e',ids.normal1)];
  const state=makeState({deck0:deck});
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(),'m0:cyber-jar',lookup));
  assert.equal(result.summonedUids[0].length,3);
  assert.deepEqual(result.addedToHandUids[0],['m0:d','m0:e']);
  assert.equal(result.state.core.players[0].monsters.length,3);
});

test('inactive partner reserve Decks and hands remain unchanged',()=>{
  const reserveHands={2:refs(2,'partner-hand',2),3:refs(3,'partner-hand',3)};
  const reserveDecks={2:refs(2,'partner-deck',5),3:refs(3,'partner-deck',4)};
  const state=makeState({reserveHands,reserveDecks});
  const before=JSON.stringify(state.reserves);
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(),'m0:cyber-jar',lookup));
  assert.equal(JSON.stringify(result.state.reserves),before);
});

test('a stolen Cyber Jar resolves for its controller team',()=>{
  const state=makeState({cursor:1,sourceTeam:1,ownerSeat:0,sourceUid:'m0:stolen-cyber-jar',deck0:refs(0,'blue',5),deck1:refs(1,'red',5)});
  const plan=planCyberJarFlip(state,event(state,'m0:stolen-cyber-jar'),'m0:stolen-cyber-jar',lookup);
  assert.equal(plan.ownerSeat,0);
  assert.equal(plan.controllerTeam,1);
  const result=resolveCyberJarFlip(state,plan);
  assert.equal(result.revealedUids[1].length,5);
});

test('effect negation preserves fields and Decks while consuming the receipt',()=>{
  const state=makeState({monsters1:[monster('m3:red','00000003')],deck0:refs(0,'blue',5),deck1:refs(1,'red',5)});
  const before=JSON.stringify(state.core.players);
  const plan=planCyberJarFlip(state,event(),'m0:cyber-jar',lookup);
  const result=resolveCyberJarFlip(state,plan,true);
  assert.equal(result.status,'negated');
  assert.equal(JSON.stringify(result.state.core.players),before);
  assert.throws(()=>resolveCyberJarFlip(result.state,plan),/Replay/);
});

test('activation replay remains blocked after JSON restoration',()=>{
  const state=makeState();
  const plan=planCyberJarFlip(state,event(),'m0:cyber-jar',lookup);
  const result=resolveCyberJarFlip(state,plan);
  const restored=JSON.parse(JSON.stringify(result.state));
  assert.throws(()=>resolveCyberJarFlip(restored,plan),/Replay/);
});

test('normal summon does not trigger Cyber Jar',()=>{
  const state=makeState();
  const e=event(state,'m0:cyber-jar','normal-id','normal');
  assert.throws(()=>planCyberJarFlip(state,e,'m0:cyber-jar',lookup),/Invocação-Virar/);
});

test('effect-flip does not trigger Cyber Jar',()=>{
  const state=makeState();
  const e=event(state);e.kind='effect-flip';
  assert.throws(()=>planCyberJarFlip(state,e,'m0:cyber-jar',lookup),/Invocação-Virar/);
});

test('wrong active team cannot activate Cyber Jar',()=>{
  const state=makeState({cursor:1,sourceTeam:0});
  assert.throws(()=>planCyberJarFlip(state,event(state),'m0:cyber-jar',lookup),/equipe ativa/);
});

test('another monster cannot use the Cyber Jar adapter',()=>{
  const state=makeState({sourceId:'00000002'});
  assert.throws(()=>planCyberJarFlip(state,event(state),'m0:cyber-jar',lookup),/não é Cyber Jar/);
});

test('a Flip Summon trigger resolves after Cyber Jar leaves the field',()=>{
  const state=makeState();
  const plan=planCyberJarFlip(state,event(),'m0:cyber-jar',lookup);
  state.core.players[0].monsters=[];
  state.core.players[0].grave.push(ref('m0:cyber-jar',CYBER_JAR_ID));
  state.core.cardLifetimes['m0:cyber-jar']={zone:'grave',epoch:1};
  const result=resolveCyberJarFlip(state,plan);
  assert.equal(result.status,'resolved');
  assert.equal(result.revealedUids[0].length,5);
});

test('invalid position values are rejected',()=>{
  const state=makeState({deck0:[ref('m0:e3',ids.effect3)]});
  const plan=planCyberJarFlip(state,event(),'m0:cyber-jar',lookup);
  assert.throws(()=>resolveCyberJarFlip(state,plan,false,{'m0:e3':'defense'}),/Escolha de posição/);
});

test('position choices for non-summoned cards are rejected',()=>{
  const state=makeState({deck0:[ref('m0:spell',ids.spell)]});
  const plan=planCyberJarFlip(state,event(),'m0:cyber-jar',lookup);
  assert.throws(()=>resolveCyberJarFlip(state,plan,false,{'m0:spell':'atk'}),/Escolha de posição/);
});

test('the active physical representative Deck is used after rotation',()=>{
  const state=makeState({cursor:2,sourceTeam:0,ownerSeat:2,sourceUid:'m2:jar',deck0:[ref('m2:active',ids.normal4)]});
  const plan=planCyberJarFlip(state,event(state,'m2:jar'),'m2:jar',lookup);
  assert.equal(plan.activeSeat,2);
  const result=resolveCyberJarFlip(state,plan);
  assert.equal(result.state.core.players[0].monsters[0].uid,'m2:active');
  assert.equal(result.state.reserves['0'].deck[0].uid,'m0:reserve-deck-0');
});

test('Monster Zones stay at three and backrow remains a separate three-zone array',()=>{
  const state=makeState({deck0:[ref('m0:a',ids.normal4),ref('m0:b',ids.effect3),ref('m0:c',ids.normal2),ref('m0:d',ids.effect4)]});
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(),'m0:cyber-jar',lookup));
  assert.equal(result.state.core.players[0].monsters.length,3);
  assert.equal(result.state.core.players[0].backrow.length,0);
});

test('the separate Field Zone is preserved',()=>{
  const state=makeState();
  state.core.players[0].field=ref('m0:field-zone');
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(),'m0:cyber-jar',lookup));
  assert.equal(result.state.core.players[0].field.uid,'m0:field-zone');
});

test('Extra Deck limit five is preserved',()=>{
  const state=makeState({extra0:refs(0,'extra',6)});
  assert.throws(()=>planCyberJarFlip(state,event(),'m0:cyber-jar',lookup),/Zonas da equipe/);
});

test('physical UIDs and card identities are conserved, excluding vanished tokens',()=>{
  const state=makeState({monsters0:[monster('m2:other','00000002',true)],deck0:[ref('m0:a',ids.normal4)]});
  const before=inventory(state);
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(),'m0:cyber-jar',lookup));
  assert.deepEqual(inventory(result.state),before);
});

test('the adapter does not mutate input or grant inventory',()=>{
  const state=makeState({deck0:[ref('m0:a',ids.normal4)]});
  const before=JSON.stringify(state);
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(),'m0:cyber-jar',lookup));
  assert.equal(JSON.stringify(state),before);
  assert.equal(inventory(result.state).length,inventory(state).length);
});

test('adding cards can exceed six and the discard remains deferred to End Phase',()=>{
  const state=makeState({hand0:refs(0,'existing',3),deck0:refs(0,'nonmonsters',5,ids.spell)});
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(),'m0:cyber-jar',lookup));
  assert.equal(result.state.core.players[0].hand.length,8);
  assert.equal(result.handLimitDeferred,true);
});

test('a short reveal does not cause deck-out',()=>{
  const state=makeState({deck0:refs(0,'few',1,ids.spell),deck1:[]});
  const result=resolveCyberJarFlip(state,planCyberJarFlip(state,event(),'m0:cyber-jar',lookup));
  assert.equal(result.state.core.phase,'main');
  assert.equal(result.revealedUids[0].length,1);
  assert.equal(result.revealedUids[1].length,0);
});
