'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  A_CAT_OF_ILL_OMEN_ID,NECROVALLEY_ID,
  aCatOfIllOmenTargets,resolveACatOfIllOmen
}=require('../dist/aCatOfIllOmenTagAdapter');

const TRAP_A='44095762',TRAP_B='62279055',NON_TRAP='00000001';
const lookup=id=>({
  [TRAP_A]:{kind:'trap'},
  [TRAP_B]:{kind:'trap'},
  [NON_TRAP]:{kind:'spell',field:false},
  [NECROVALLEY_ID]:{kind:'spell',field:true}
})[id];

function card(uid,id,extra={}){return {uid,id,...extra};}
function makeState(options={}){
  const ownerSeat=options.ownerSeat??0,team=ownerSeat%2;
  const active=[0,1];
  const reserves={
    2:{deck:[],hand:[],extra:[]},
    3:{deck:[],hand:[],extra:[]}
  };
  const players=[
    {id:'tag-team-0',name:'Equipe Azul',lp:4000,deck:[],hand:[],monsters:[],backrow:[],grave:[],extra:[],banished:[],field:null,summoned:false},
    {id:'tag-team-1',name:'Equipe Vermelha',lp:4000,deck:[],hand:[],monsters:[],backrow:[],grave:[],extra:[],banished:[],field:null,summoned:false}
  ];
  const ownerZones=active[team]===ownerSeat?players[team]:reserves[String(ownerSeat)];
  ownerZones.deck=(options.deck??[card('m'+ownerSeat+':trap-a',TRAP_A),card('m'+ownerSeat+':other',NON_TRAP)]).map(c=>({...c}));
  ownerZones.hand=(options.hand??[]).map(c=>({...c}));
  players[team].monsters.push(card('m'+ownerSeat+':cat',options.sourceId??A_CAT_OF_ILL_OMEN_ID,{
    position:'def',faceUp:options.sourceFaceUp!==false,entered:1,changed:4,attacked:0,atkBoost:0,defBoost:0
  }));
  if(options.activeDeck)players[team].deck=options.activeDeck.map(c=>({...c}));
  if(options.necroTeam!==undefined&&options.necroTeam!==null){
    players[options.necroTeam].field=card('m'+options.necroTeam+':necro',NECROVALLEY_ID,{faceUp:options.necroFaceUp!==false,resolved:true});
  }
  const mirrored=structuredClone(reserves);
  return {
    mode:'tag-classic',
    members:[
      {id:'seat-0',name:'Seat 0',team:0},
      {id:'seat-1',name:'Seat 1',team:1},
      {id:'seat-2',name:'Seat 2',team:0},
      {id:'seat-3',name:'Seat 3',team:1}
    ],
    active,cursor:0,reserves,
    core:{
      version:1,turn:4,current:0,phase:'main',resume:'main',priority:0,passes:0,
      players,teamRotation:{version:1,cursor:0,active,reserves:mirrored}
    }
  };
}
function event(state,sourceUid){
  return {kind:'flip',sourceUid,turn:state.core.turn,previousFaceUp:false,faceUp:true};
}
function inventory(state){
  const all=[];
  const add=rows=>{for(const c of rows??[])all.push(c.uid+'|'+c.id);};
  for(const p of state.core.players){
    for(const zone of ['deck','hand','monsters','backrow','grave','extra','banished'])add(p[zone]);
    if(p.field)add([p.field]);
  }
  for(const reserve of Object.values(state.reserves))for(const zone of ['deck','hand','extra'])add(reserve[zone]);
  return all.sort();
}
function sourceUid(state,seat=0){return 'm'+seat+':cat';}

test('FLIP target list contains only Traps in the active physical owner deck',()=>{
  const state=makeState({ownerSeat:0,deck:[
    card('m0:normal',NON_TRAP),card('m0:trap-a',TRAP_A),card('m0:trap-b',TRAP_B)
  ]});
  const targets=aCatOfIllOmenTargets(state,event(state,sourceUid(state)),sourceUid(state),lookup);
  assert.deepEqual(targets,[{uid:'m0:trap-a',id:TRAP_A},{uid:'m0:trap-b',id:TRAP_B}]);
});

test('without Necrovalley the selected Trap is placed at deck index zero, not in hand',()=>{
  const state=makeState({ownerSeat:0,deck:[
    card('m0:normal',NON_TRAP),card('m0:trap-a',TRAP_A),card('m0:trap-b',TRAP_B)
  ]});
  const before=inventory(state);
  const result=resolveACatOfIllOmen(state,event(state,sourceUid(state)),sourceUid(state),'m0:trap-b','top',lookup);
  assert.equal(result.status,'resolved');
  assert.equal(result.destination,'top');
  assert.equal(result.necrovalleyPresent,false);
  assert.equal(result.state.core.players[0].deck[0].uid,'m0:trap-b');
  assert.equal(result.state.core.players[0].hand.length,0);
  assert.deepEqual(inventory(result.state),before);
  assert.equal(state.core.players[0].deck[0].uid,'m0:normal','input state remains immutable');
});

test('face-up Necrovalley on the opponent field allows adding the selected Trap to the active owner hand',()=>{
  const state=makeState({ownerSeat:0,necroTeam:1});
  const result=resolveACatOfIllOmen(state,event(state,sourceUid(state)) ,sourceUid(state),'m0:trap-a','hand',lookup);
  assert.equal(result.status,'resolved');
  assert.equal(result.necrovalleyPresent,true);
  assert.equal(result.state.core.players[0].hand.at(-1).uid,'m0:trap-a');
  assert.equal(result.state.core.players[0].deck.some(c=>c.uid==='m0:trap-a'),false);
});

test('Necrovalley present on the source team field also permits the optional hand destination',()=>{
  const state=makeState({ownerSeat:0,necroTeam:0});
  const result=resolveACatOfIllOmen(state,event(state,sourceUid(state)),sourceUid(state),'m0:trap-a','hand',lookup);
  assert.equal(result.necrovalleyPresent,true);
  assert.equal(result.state.core.players[0].hand.at(-1).uid,'m0:trap-a');
});

test('Necrovalley is checked at resolution, not when the target list is first displayed',()=>{
  const state=makeState({ownerSeat:0});
  const targets=aCatOfIllOmenTargets(state,event(state,sourceUid(state)),sourceUid(state),lookup);
  assert.equal(targets.length,1);
  state.core.players[1].field=card('m1:necro',NECROVALLEY_ID,{faceUp:true,resolved:true});
  const result=resolveACatOfIllOmen(state,event(state,sourceUid(state)),sourceUid(state),'m0:trap-a','hand',lookup);
  assert.equal(result.necrovalleyPresent,true);
  assert.equal(result.state.core.players[0].hand.at(-1).uid,'m0:trap-a');
});

test('removing Necrovalley before resolution removes the hand option',()=>{
  const state=makeState({ownerSeat:0,necroTeam:1});
  state.core.players[1].field.faceUp=false;
  assert.throws(()=>resolveACatOfIllOmen(state,event(state,sourceUid(state)),sourceUid(state),'m0:trap-a','hand',lookup),/Necrovalley/);
});

test('an inactive physical owner searches and receives the card in their reserve, not the active partner deck/hand',()=>{
  const state=makeState({
    ownerSeat:2,
    deck:[card('m2:trap-a',TRAP_A)],
    activeDeck:[card('m0:trap-b',TRAP_B)],
    necroTeam:1
  });
  const targets=aCatOfIllOmenTargets(state,event(state,sourceUid(state,2)),sourceUid(state,2),lookup);
  assert.deepEqual(targets,[{uid:'m2:trap-a',id:TRAP_A}]);
  const result=resolveACatOfIllOmen(state,event(state,sourceUid(state,2)),sourceUid(state,2),'m2:trap-a','hand',lookup);
  assert.equal(result.state.reserves['2'].hand[0].uid,'m2:trap-a');
  assert.equal(result.state.core.players[0].hand.length,0);
  assert.equal(result.state.core.players[0].deck[0].uid,'m0:trap-b');
  assert.deepEqual(result.state.core.teamRotation.reserves['2'],result.state.reserves['2']);
});

test('active owner deck and hand route through the shared team core',()=>{
  const state=makeState({ownerSeat:1,necroTeam:0});
  const result=resolveACatOfIllOmen(state,event(state,sourceUid(state,1)),sourceUid(state,1),'m1:sogen','hand',lookup);
  assert.equal(result.state.core.players[1].hand.at(-1).uid,'m1:sogen');
  assert.equal(result.state.reserves['3'].hand.length,0);
});

test('a deck without Traps resolves as no-target without changing any card',()=>{
  const state=makeState({ownerSeat:0,deck:[card('m0:normal',NON_TRAP)]});
  const before=inventory(state);
  const result=resolveACatOfIllOmen(state,event(state,sourceUid(state)),sourceUid(state),undefined,'top',lookup);
  assert.equal(result.status,'no-target');
  assert.deepEqual(inventory(result.state),before);
  assert.deepEqual(state,result.state);
});

test('the adapter rejects a Trap from a teammate deck or another physical seat',()=>{
  const state=makeState({
    ownerSeat:2,
    deck:[card('m2:normal',NON_TRAP)],
    activeDeck:[card('m0:trap-a',TRAP_A)]
  });
  assert.throws(()=>resolveACatOfIllOmen(state,event(state,sourceUid(state,2)),sourceUid(state,2),'m0:trap-a','top',lookup),/Deck físico/);
});

test('non-Traps cannot be selected even when present in the physical deck',()=>{
  const state=makeState({ownerSeat:0,deck:[card('m0:normal',NON_TRAP)]});
  assert.throws(()=>resolveACatOfIllOmen(state,event(state,sourceUid(state)),sourceUid(state),'m0:normal','top',lookup),/não possui Trap/);
});

test('a source must be A Cat of Ill Omen, face-up, and physically controlled by its own team',()=>{
  const wrongCard=makeState({sourceId:'00000000'});
  assert.throws(()=>aCatOfIllOmenTargets(wrongCard,event(wrongCard,sourceUid(wrongCard)),sourceUid(wrongCard),lookup),/face-up/);
  const faceDown=makeState({sourceFaceUp:false});
  assert.throws(()=>aCatOfIllOmenTargets(faceDown,event(faceDown,sourceUid(faceDown)),sourceUid(faceDown),lookup),/face-up/);
  const wrongTeam=makeState({ownerSeat:2});
  const source=wrongTeam.core.players[0].monsters.pop();
  wrongTeam.core.players[1].monsters.push(source);
  assert.throws(()=>aCatOfIllOmenTargets(wrongTeam,event(wrongTeam,sourceUid(wrongTeam,2)),sourceUid(wrongTeam,2),lookup),/equipe controladora/);
});

test('the FLIP event must be current and refer to this exact source',()=>{
  const state=makeState();
  const source=sourceUid(state);
  assert.throws(()=>aCatOfIllOmenTargets(state,{...event(state,source),turn:state.core.turn-1},source,lookup),/obsoleto/);
  assert.throws(()=>aCatOfIllOmenTargets(state,{...event(state,source),sourceUid:'m0:other'},source,lookup),/obsoleto/);
  assert.throws(()=>aCatOfIllOmenTargets(state,{...event(state,source),previousFaceUp:true},source,lookup),/obsoleto/);
});

test('the same physical UID is conserved when the card is moved to hand or deck top',()=>{
  const state=makeState({ownerSeat:2,deck:[card('m2:trap-a',TRAP_A),card('m2:normal',NON_TRAP)],necroTeam:1});
  const before=inventory(state);
  const result=resolveACatOfIllOmen(state,event(state,sourceUid(state,2)),sourceUid(state,2),'m2:trap-a','hand',lookup);
  assert.deepEqual(inventory(result.state),before);
  assert.equal(new Set(inventory(result.state).map(x=>x.split('|')[0])).size,inventory(result.state).length);
  assert.equal(result.state.reserves['2'].hand[0].uid,'m2:trap-a');
});

test('a selected Trap must still be in the physical deck at resolution',()=>{
  const state=makeState({ownerSeat:0});
  const changed=structuredClone(state);
  changed.core.players[0].deck=changed.core.players[0].deck.filter(c=>c.uid!=='m0:trap-a');
  assert.throws(()=>resolveACatOfIllOmen(changed,event(changed,sourceUid(changed)),sourceUid(changed),'m0:trap-a','top',lookup),/Deck físico/);
});

test('an invalid destination is rejected and Necrovalley does not force the optional hand choice',()=>{
  const state=makeState({ownerSeat:0,necroTeam:1});
  const result=resolveACatOfIllOmen(state,event(state,sourceUid(state)),sourceUid(state),'m0:trap-a','top',lookup);
  assert.equal(result.destination,'top');
  assert.throws(()=>resolveACatOfIllOmen(state,event(state,sourceUid(state)),sourceUid(state),'m0:trap-a','grave',lookup),/Destino/);
});

test('face-down Necrovalley does not enable the optional hand destination',()=>{
  const state=makeState({ownerSeat:0,necroTeam:1,necroFaceUp:false});
  assert.throws(()=>resolveACatOfIllOmen(state,event(state,sourceUid(state)),sourceUid(state),'m0:trap-a','hand',lookup),/Necrovalley/);
});

test('duplicate source identity and malformed physical-seat UID fail closed',()=>{
  const duplicate=makeState({ownerSeat:0});
  duplicate.core.players[1].monsters.push(card('m0:cat',A_CAT_OF_ILL_OMEN_ID,{faceUp:true}));
  assert.throws(()=>aCatOfIllOmenTargets(duplicate,event(duplicate,sourceUid(duplicate)),sourceUid(duplicate),lookup),/única Zona/);
  const malformed=makeState({ownerSeat:0});
  const invalidUid='m4:cat';
  assert.throws(()=>aCatOfIllOmenTargets(malformed,event(malformed,invalidUid),invalidUid,lookup),/proprietário físico válido/);
});

test('selection is by physical UID when the same Trap ID has multiple copies',()=>{
  const state=makeState({ownerSeat:0,deck:[
    card('m0:copy-1',TRAP_A),card('m0:copy-2',TRAP_A),card('m0:normal',NON_TRAP)
  ]});
  const before=inventory(state);
  const result=resolveACatOfIllOmen(state,event(state,sourceUid(state)),sourceUid(state),'m0:copy-2','top',lookup);
  assert.equal(result.state.core.players[0].deck[0].uid,'m0:copy-2');
  assert.equal(result.state.core.players[0].deck[1].uid,'m0:copy-1');
  assert.deepEqual(inventory(result.state),before);
});
