'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {tagInventory}=require('../dist/tagDuel');
const {
  SPEAR_CRETIN_ID,
  planSpearCretinTrigger,
  registerSpearCretinTrigger,
  getSpearCretinCandidates,
  planSpearCretinResolution,
  resolveSpearCretinResolution
}=require('../dist/spearCretinTagAdapter');

const lookup=id=>{
  if(id===SPEAR_CRETIN_ID)return {kind:'monster',monsterType:'effect'};
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
  cursor=0,sourceTeam=0,sourceSeat,sourceUid,sourceId=SPEAR_CRETIN_ID,
  grave0,grave1,monsters0=[],monsters1=[],backrow0=[],backrow1=[],
  deck0,deck1,hand0,hand1,extra0,extra1,reserveHands={},reserveDecks={},
  field0=null,field1=null
}={}){
  const active=cursor===2?[2,1]:cursor===3?[0,3]:[0,1];
  const ownerSeat=sourceSeat??active[sourceTeam];
  const uid=sourceUid??'m'+ownerSeat+':spear-cretin';
  const source=ref(uid,sourceId);
  const reserves={};
  for(const seat of [0,1,2,3])if(!active.includes(seat)){
    reserves[String(seat)]={
      deck:reserveDecks[seat]??refs(seat,'reserve-deck',2),
      hand:reserveHands[seat]??refs(seat,'reserve-hand',2),
      extra:refs(seat,'reserve-extra',5)
    };
  }
  const g0=grave0??(sourceTeam===0?[source]:[]);
  const g1=grave1??(sourceTeam===1?[source]:[]);
  const players=[
    {
      id:'tag-team-0',name:'Equipe Azul',lp:4000,
      deck:deck0??refs(active[0],'deck-a',8),hand:hand0??refs(active[0],'hand-a',2),
      monsters:monsters0,backrow:backrow0,grave:g0,extra:extra0??refs(active[0],'extra-a',5),
      banished:[],field:field0,summoned:false
    },
    {
      id:'tag-team-1',name:'Equipe Vermelha',lp:4000,
      deck:deck1??refs(active[1],'deck-b',8),hand:hand1??refs(active[1],'hand-b',2),
      monsters:monsters1,backrow:backrow1,grave:g1,extra:extra1??refs(active[1],'extra-b',5),
      banished:[],field:field1,summoned:false
    }
  ];
  const teamRotation={version:1,cursor,active,reserves};
  const core={
    version:1,players,turn:1,current:cursor%2,phase:'battle',resume:'main',
    priority:cursor%2,passes:0,pending:{kind:'none'},chain:[],winner:null,reason:'',
    log:[],teamRotation,cardLifetimes:{[uid]:{zone:'grave',epoch:1}}
  };
  const members=[
    {id:'p0',name:'P0',team:0},{id:'p1',name:'P1',team:1},
    {id:'p2',name:'P2',team:0},{id:'p3',name:'P3',team:1}
  ];
  return {version:1,mode:'tag-classic',members,active,cursor,reserves,core};
}
const event=(state,uid='m0:spear-cretin',overrides={})=>({
  kind:'flip-sent-to-grave',sourceUid:uid,turn:state.core.turn,
  fromZone:'monsters',toZone:'grave',wasFlipped:true,cause:'effect',...overrides
});
function register(state,uid='m0:spear-cretin',activationId='spear-1'){
  const plan=planSpearCretinTrigger(state,event(state,uid),uid,activationId,lookup);
  return {plan,state:registerSpearCretinTrigger(state,plan,lookup)};
}
function resolve(state,activationId,choices,negated=false){
  const plan=planSpearCretinResolution(state,activationId,choices,lookup);
  return resolveSpearCretinResolution(state,plan,negated,lookup);
}
const inventory=state=>tagInventory(state).map(card=>card.uid+'='+card.id).sort();

test('the trigger requires a prior flip and a later move from the Monster Zone to the owner team Graveyard',()=>{
  const state=makeState();
  assert.throws(()=>planSpearCretinTrigger(state,event(state,'m0:spear-cretin',{wasFlipped:false}),'m0:spear-cretin','not-flipped',lookup),/depois de ter sido virado/);
  assert.throws(()=>planSpearCretinTrigger(state,event(state,'m0:spear-cretin',{fromZone:'hand'}),'m0:spear-cretin','from-hand',lookup),/depois de ter sido virado/);
  assert.throws(()=>planSpearCretinTrigger(state,event(state,'m0:spear-cretin',{toZone:'banished'}),'m0:spear-cretin','banished',lookup),/depois de ter sido virado/);
  assert.throws(()=>planSpearCretinTrigger(state,event(state,'m0:spear-cretin',{turn:2}),'m0:spear-cretin','wrong-turn',lookup),/depois de ter sido virado/);
});

test('a send by a card effect after flipping also triggers; it is not restricted to battle destruction',()=>{
  const state=makeState({cursor:1});
  const plan=planSpearCretinTrigger(state,event(state,'m0:spear-cretin',{cause:'effect'}),'m0:spear-cretin','effect-send',lookup);
  assert.equal(plan.sourceTeam,0);
  assert.equal(plan.turn,1);
  assert.equal(plan.activationId,'effect-send');
});

test('the source must be Spear Cretin in its physical owner team Graveyard',()=>{
  const wrongGrave=makeState({grave0:[],grave1:[ref('m0:spear-cretin',SPEAR_CRETIN_ID)]});
  assert.throws(()=>planSpearCretinTrigger(wrongGrave,event(wrongGrave),'m0:spear-cretin','wrong-grave',lookup),/Cemitério de sua equipe/);
  const wrongCard=makeState({sourceId:'00000099'});
  assert.throws(()=>planSpearCretinTrigger(wrongCard,event(wrongCard),'m0:spear-cretin','wrong-card',lookup),/deve estar/);
});

test('the trigger is independent of whose turn it is and preserves an inactive partner source owner',()=>{
  const state=makeState({cursor:1,sourceTeam:0,sourceSeat:2,sourceUid:'m2:spear-cretin'});
  const plan=planSpearCretinTrigger(state,event(state,'m2:spear-cretin'),'m2:spear-cretin','partner-source',lookup);
  assert.equal(plan.sourceOwnerSeat,2);
  assert.equal(plan.sourceTeam,0);
  assert.equal(state.core.current,1);
});

test('registering the trigger persists an activation receipt without selecting a target',()=>{
  const state=makeState();
  const result=register(state);
  assert.equal(result.plan.kind,'spear-cretin-trigger');
  assert.equal(Object.hasOwn(result.plan,'choices'),false);
  assert.equal(result.state.spearCretin.pending['spear-1'].sourceUid,'m0:spear-cretin');
  assert.equal(JSON.stringify(state.spearCretin),undefined);
  assert.deepEqual(inventory(result.state),inventory(state));
});

test('each team chooses one monster from its own Graveyard and chooses its own position',()=>{
  const state=register(makeState({
    grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID),ref('m0:blue-gy')],
    grave1:[ref('m1:red-gy')]
  })).state;
  assert.deepEqual(getSpearCretinCandidates(state,'spear-1',0,lookup),['m0:spear-cretin','m0:blue-gy']);
  assert.deepEqual(getSpearCretinCandidates(state,'spear-1',1,lookup),['m1:red-gy']);
  const result=resolve(state,'spear-1',[
    {uid:'m0:blue-gy',position:'atk'},
    {uid:'m1:red-gy',position:'def'}
  ]);
  assert.equal(result.status,'both');
  assert.equal(result.summoned.length,2);
  const blue=result.state.core.players[0].monsters.find(card=>card.uid==='m0:blue-gy');
  const red=result.state.core.players[1].monsters.find(card=>card.uid==='m1:red-gy');
  assert.equal(blue.owner,0);assert.equal(blue.faceUp,true);assert.equal(blue.position,'atk');
  assert.equal(red.owner,1);assert.equal(red.faceUp,false);assert.equal(red.position,'def');
});

test('an inactive partner card can be revived while its physical owner remains unchanged',()=>{
  const state=register(makeState({
    grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID),ref('m2:blue-partner-gy')],
    grave1:[ref('m3:red-partner-gy')]
  })).state;
  const result=resolve(state,'spear-1',[
    {uid:'m2:blue-partner-gy',position:'def'},
    {uid:'m3:red-partner-gy',position:'atk'}
  ]);
  assert.equal(result.status,'both');
  assert.equal(result.state.core.players[0].monsters[0].owner,2);
  assert.equal(result.state.core.players[1].monsters[0].owner,3);
});

test('a team cannot choose from the opponent team Graveyard',()=>{
  const state=register(makeState({
    grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID)],
    grave1:[ref('m1:red-gy')]
  })).state;
  assert.throws(()=>planSpearCretinResolution(state,'spear-1',[
    {uid:'m1:red-gy',position:'atk'},null
  ],lookup),/próprio Cemitério/);
});

test('a team with no eligible monster does not block the other team from resolving',()=>{
  const state=register(makeState({
    grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID)],
    grave1:[ref('m1:spell','spell')]
  })).state;
  assert.deepEqual(getSpearCretinCandidates(state,'spear-1',1,lookup),[]);
  const result=resolve(state,'spear-1',[
    {uid:'m0:spear-cretin',position:'def'},null
  ]);
  assert.equal(result.status,'partial');
  assert.equal(result.summoned.length,1);
  assert.equal(result.state.core.players[0].monsters[0].uid,'m0:spear-cretin');
});

test('a full Monster Zone prevents only that team from summoning; the other team still resolves',()=>{
  const full=[0,1,2].map(i=>monster(ref('m0:field-'+i),0));
  const state=register(makeState({
    monsters0:full,
    grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID)],
    grave1:[ref('m1:red-gy')]
  })).state;
  assert.deepEqual(getSpearCretinCandidates(state,'spear-1',0,lookup),[]);
  const result=resolve(state,'spear-1',[
    null,{uid:'m1:red-gy',position:'atk'}
  ]);
  assert.equal(result.status,'partial');
  assert.equal(result.state.core.players[0].monsters.length,3);
  assert.equal(result.state.core.players[1].monsters[0].uid,'m1:red-gy');
});

test('if both teams have full Monster Zones, neither can summon',()=>{
  const state=register(makeState({
    monsters0:[0,1,2].map(i=>monster(ref('m0:blue-'+i),0)),
    monsters1:[0,1,2].map(i=>monster(ref('m1:red-'+i),1))
  })).state;
  assert.equal(resolve(state,'spear-1',[null,null]).status,'no-summons');
});

test('each team must choose one when a legal monster and a free Monster Zone exist',()=>{
  const state=register(makeState({grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID),ref('m0:blue-gy')]})).state;
  assert.throws(()=>planSpearCretinResolution(state,'spear-1',[null,null],lookup),/deve escolher 1 monstro/);
});

test('the Graveyard choice is made at resolution time, not when the trigger is registered',()=>{
  const state=register(makeState({grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID)]})).state;
  state.core.players[0].grave.push(ref('m0:late-gy'));
  state.core.players[1].grave.push(ref('m1:late-gy'));
  assert.deepEqual(getSpearCretinCandidates(state,'spear-1',0,lookup),['m0:spear-cretin','m0:late-gy']);
  const result=resolve(state,'spear-1',[
    {uid:'m0:late-gy',position:'atk'},
    {uid:'m1:late-gy',position:'def'}
  ]);
  assert.equal(result.status,'both');
});

test('Spear Cretin itself is eligible and can return face-down in Defense Position',()=>{
  const state=register(makeState()).state;
  assert.deepEqual(getSpearCretinCandidates(state,'spear-1',0,lookup),['m0:spear-cretin']);
  const result=resolve(state,'spear-1',[
    {uid:'m0:spear-cretin',position:'def'},null
  ]);
  const revived=result.state.core.players[0].monsters[0];
  assert.equal(revived.uid,'m0:spear-cretin');
  assert.equal(revived.faceUp,false);
  assert.equal(revived.position,'def');
  assert.equal(revived.owner,0);
});

test('non-monsters, tokens and improperly summoned Fusion/Ritual cards are excluded',()=>{
  const state=register(makeState({
    grave0:[
      ref('m0:spear-cretin',SPEAR_CRETIN_ID),
      ref('m0:spell','spell'),
      ref('m0:token','00000002',{entityKind:'token'}),
      ref('m0:fusion','fusion'),
      ref('m0:ritual','ritual'),
      ref('m0:proper-fusion','fusion',{properlySummoned:true}),
      ref('m0:proper-ritual','ritual',{properlySummoned:true})
    ]
  })).state;
  assert.deepEqual(
    getSpearCretinCandidates(state,'spear-1',0,lookup),
    ['m0:spear-cretin','m0:proper-fusion','m0:proper-ritual']
  );
});

test('negation consumes the pending trigger without moving any physical card',()=>{
  const state=register(makeState({
    grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID),ref('m0:blue-gy')],
    grave1:[ref('m1:red-gy')]
  })).state;
  const before=inventory(state);
  const plan=planSpearCretinResolution(state,'spear-1',[
    {uid:'m0:blue-gy',position:'atk'},
    {uid:'m1:red-gy',position:'def'}
  ],lookup);
  const result=resolveSpearCretinResolution(state,plan,true,lookup);
  assert.equal(result.status,'negated');
  assert.deepEqual(inventory(result.state),before);
  assert.equal(result.state.spearCretin.resolved['spear-1'],true);
});

test('the trigger still resolves if Spear Cretin leaves the Graveyard after registration',()=>{
  const state=register(makeState({
    grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID),ref('m0:blue-gy')],
    grave1:[ref('m1:red-gy')]
  })).state;
  const index=state.core.players[0].grave.findIndex(card=>card.uid==='m0:spear-cretin');
  const [source]=state.core.players[0].grave.splice(index,1);
  state.core.players[0].banished.push(source);
  state.core.cardLifetimes[source.uid]={zone:'banished',epoch:2};
  const result=resolve(state,'spear-1',[
    {uid:'m0:blue-gy',position:'atk'},
    {uid:'m1:red-gy',position:'atk'}
  ]);
  assert.equal(result.status,'both');
  assert.ok(result.state.core.players[0].banished.some(card=>card.uid==='m0:spear-cretin'));
});

test('a save/restore preserves pending activations and replay protection',()=>{
  const state=register(makeState({grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID),ref('m0:blue-gy')]})).state;
  const restored=JSON.parse(JSON.stringify(state));
  const result=resolve(restored,'spear-1',[
    {uid:'m0:blue-gy',position:'def'},null
  ]);
  assert.equal(result.status,'partial');
  assert.throws(()=>planSpearCretinResolution(result.state,'spear-1',[null,null],lookup),/ausente|resolvida|obsoleta/);
});

test('activationId cannot be reused while pending or after resolution',()=>{
  const state=makeState();
  const first=register(state,'m0:spear-cretin','unique-1');
  assert.throws(()=>planSpearCretinTrigger(first.state,event(first.state),'m0:spear-cretin','unique-1',lookup),/activationId/);
  const result=resolve(first.state,'unique-1',[{uid:'m0:spear-cretin',position:'atk'},null]);
  assert.throws(()=>planSpearCretinTrigger(result.state,event(result.state),'m0:spear-cretin','unique-1',lookup),/activationId/);
});

test('two distinct Spear Cretin triggers can remain pending in the same turn',()=>{
  const state=makeState({
    grave0:[ref('m0:spear-a',SPEAR_CRETIN_ID),ref('m0:spear-b',SPEAR_CRETIN_ID),ref('m0:blue-gy')]
  });
  const a=planSpearCretinTrigger(state,event(state,'m0:spear-a'),'m0:spear-a','trigger-a',lookup);
  const first=registerSpearCretinTrigger(state,a,lookup);
  const b=planSpearCretinTrigger(first,event(first,'m0:spear-b'),'m0:spear-b','trigger-b',lookup);
  const second=registerSpearCretinTrigger(first,b,lookup);
  assert.ok(second.spearCretin.pending['trigger-a']);
  assert.ok(second.spearCretin.pending['trigger-b']);
});

test('a selected card must remain in its own Graveyard until resolution',()=>{
  const state=register(makeState({
    grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID),ref('m0:blue-gy')],
    grave1:[ref('m1:red-gy')]
  })).state;
  const plan=planSpearCretinResolution(state,'spear-1',[
    {uid:'m0:blue-gy',position:'atk'},
    {uid:'m1:red-gy',position:'def'}
  ],lookup);
  state.core.players[0].grave=state.core.players[0].grave.filter(card=>card.uid!=='m0:blue-gy');
  assert.throws(()=>resolveSpearCretinResolution(state,plan,false,lookup),/obsoleta/);
});

test('both teams are validated before either monster moves',()=>{
  const state=register(makeState({
    grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID),ref('m0:blue-gy')],
    grave1:[ref('m1:red-gy')]
  })).state;
  const before=inventory(state);
  assert.throws(()=>planSpearCretinResolution(state,'spear-1',[
    {uid:'m0:blue-gy',position:'atk'},
    {uid:'m0:blue-gy',position:'def'}
  ],lookup),/próprio Cemitério/);
  assert.deepEqual(inventory(state),before);
  assert.equal(state.core.players[0].monsters.length,0);
  assert.equal(state.core.players[1].monsters.length,0);
});

test('3+3 zones, separate Field Zone and Extra Deck 5 remain intact',()=>{
  const state=register(makeState({
    backrow0:refs(0,'blue-backrow',3),backrow1:refs(1,'red-backrow',3),
    field0:ref('m0:blue-field','00000003'),field1:ref('m1:red-field','00000004'),
    extra0:refs(0,'blue-extra',5),extra1:refs(1,'red-extra',5),
    grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID),ref('m0:blue-gy')],
    grave1:[ref('m1:red-gy')]
  })).state;
  const result=resolve(state,'spear-1',[
    {uid:'m0:blue-gy',position:'atk'},
    {uid:'m1:red-gy',position:'def'}
  ]);
  assert.equal(result.state.core.players[0].backrow.length,3);
  assert.equal(result.state.core.players[1].backrow.length,3);
  assert.equal(result.state.core.players[0].extra.length,5);
  assert.equal(result.state.core.players[1].extra.length,5);
  assert.ok(result.state.core.players[0].field);
  assert.ok(result.state.core.players[1].field);
});

test('over-six hands remain untouched for End Phase and 20-card Decks are not modified',()=>{
  const state=register(makeState({
    hand0:refs(0,'blue-hand',7),hand1:refs(1,'red-hand',8),
    deck0:refs(0,'blue-deck',20),deck1:refs(1,'red-deck',20),
    grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID),ref('m0:blue-gy')],
    grave1:[ref('m1:red-gy')]
  })).state;
  const before={
    hands:JSON.stringify(state.core.players.map(player=>player.hand)),
    decks:JSON.stringify(state.core.players.map(player=>player.deck)),
    summoned:JSON.stringify(state.core.players.map(player=>player.summoned))
  };
  const result=resolve(state,'spear-1',[
    {uid:'m0:blue-gy',position:'atk'},
    {uid:'m1:red-gy',position:'atk'}
  ]);
  assert.equal(JSON.stringify(result.state.core.players.map(player=>player.hand)),before.hands);
  assert.equal(JSON.stringify(result.state.core.players.map(player=>player.deck)),before.decks);
  assert.equal(JSON.stringify(result.state.core.players.map(player=>player.summoned)),before.summoned);
});

test('input state is immutable and all physical UIDs are conserved across simultaneous summons',()=>{
  const state=register(makeState({
    grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID),ref('m0:blue-gy')],
    grave1:[ref('m1:red-gy')]
  })).state;
  const before=JSON.stringify(state);
  const ids=inventory(state);
  const result=resolve(state,'spear-1',[
    {uid:'m0:blue-gy',position:'atk'},
    {uid:'m1:red-gy',position:'def'}
  ]);
  assert.equal(JSON.stringify(state),before);
  assert.deepEqual(inventory(result.state),ids);
});

test('malformed physical UID, duplicate UID, wrong card and stale turn are rejected',()=>{
  const malformed=makeState({sourceUid:'bad:spear-cretin'});
  assert.throws(()=>planSpearCretinTrigger(malformed,event(malformed,'bad:spear-cretin'),'bad:spear-cretin','bad-uid',lookup),/UID|proprietário/);
  const duplicate=makeState({grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID),ref('m0:spear-cretin',SPEAR_CRETIN_ID)]});
  assert.throws(()=>planSpearCretinTrigger(duplicate,event(duplicate),'m0:spear-cretin','duplicate',lookup),/duplicado/);
  const wrong=makeState({sourceId:'00000099'});
  assert.throws(()=>planSpearCretinTrigger(wrong,event(wrong),'m0:spear-cretin','wrong',lookup),/deve estar/);
  const pending=register(makeState()).state;
  pending.core.turn=2;
  assert.throws(()=>getSpearCretinCandidates(pending,'spear-1',0,lookup),/Turno/);
});

test('the source may be controlled by the other team when it is sent to its owner Graveyard',()=>{
  const state=makeState({cursor:1,sourceTeam:0,sourceSeat:0});
  const plan=planSpearCretinTrigger(state,event(state),'m0:spear-cretin','stolen-source',lookup);
  const registered=registerSpearCretinTrigger(state,plan,lookup);
  registered.core.players[1].monsters.push(monster(ref('m0:stolen-source-copy',SPEAR_CRETIN_ID),0));
  assert.equal(registered.spearCretin.pending['stolen-source'].sourceTeam,0);
});

test('no partial mutation occurs if the resolution plan becomes stale or invalid',()=>{
  const state=register(makeState({
    grave0:[ref('m0:spear-cretin',SPEAR_CRETIN_ID),ref('m0:blue-gy')],
    grave1:[ref('m1:red-gy')]
  })).state;
  const plan=planSpearCretinResolution(state,'spear-1',[
    {uid:'m0:blue-gy',position:'atk'},
    {uid:'m1:red-gy',position:'def'}
  ],lookup);
  const before=inventory(state);
  state.core.players[1].monsters.push(...[0,1,2].map(i=>monster(ref('m1:occupied-'+i),1)));
  assert.throws(()=>resolveSpearCretinResolution(state,plan,false,lookup),/obsoleta|sem monstro\/zona/);
  assert.deepEqual(inventory(state),before.concat(['m1:occupied-0=00000001','m1:occupied-1=00000001','m1:occupied-2=00000001']).sort());
});
