const {test}=require('node:test');const assert=require('node:assert/strict');
const {A_MAN_WITH_WDJAT_ID,listTagDuelSetCardSlots,inspectTagDuelSetCardAtSlot,wdjatStandbyTaskId}=require('../dist/wdjatTagDuelAdapter.js');
const {createTagDuel,assertTagDuel,tagNormalCardIds}=require('../dist/tagDuel.js');
const {projectPrivateSetInspection,restoreInspectedSetCard}=require('../dist/privateSetInspection.js');
const card=(uid,id,faceUp=false,position)=>({uid,id,faceUp,position,owner:1});
function makeState(){
 return {mode:'tag-classic',active:[2,1],core:{current:0,phase:'response',turn:1,pending:{kind:'summon',actor:0,card:'m0:wdjat',id:A_MAN_WITH_WDJAT_ID},players:[
  {monsters:[{uid:'m0:wdjat',id:A_MAN_WITH_WDJAT_ID,faceUp:true,position:'atk',owner:0}],backrow:[],field:null},
  {monsters:[card('m3:set-monster','46986414',false,'def'),card('m1:faceup-monster','46986414',true,'atk')],backrow:[card('m3:set-backrow','53129443',false),card('m1:faceup-backrow','53129443',true)],field:card('m1:set-field','10000000',false)}
 ]}};
}
const names={'46986414':'Dark Magician','53129443':'Mystical Space Typhoon','10000000':'Set Field Spell'};
const nameOf=id=>names[id];
test('lists only face-down opposing monster Defense, backrow and Field Zone slots',()=>{const s=makeState();assert.deepEqual(listTagDuelSetCardSlots(s,'m0:wdjat','normalSummon'),[{zone:'monster',index:0},{zone:'backrow',index:0},{zone:'field',index:0}]);});
test('public-safe slot descriptors contain no hidden identity fields',()=>{const slots=listTagDuelSetCardSlots(makeState(),'m0:wdjat','normalSummon');for(const slot of slots){assert.equal('uid' in slot,false);assert.equal('id' in slot,false);assert.equal('name' in slot,false);assert.equal('physicalOwnerSeat' in slot,false);}});
test('resolver seat is the active physical representative, not the Wdjat physical owner',()=>{const s=makeState();const slot={zone:'backrow',index:0};const r=inspectTagDuelSetCardAtSlot(s,'m0:wdjat','normalSummon',slot,'m3:set-backrow',nameOf);assert.equal(r.resolverSeat,2);assert.equal(r.target.physicalOwnerSeat,3);});
test('resolver receives hidden identity and physical owner in the private projection',()=>{const s=makeState();const r=inspectTagDuelSetCardAtSlot(s,'m0:wdjat','normalSummon',{zone:'backrow',index:0},'m3:set-backrow',nameOf);assert.ok(r);assert.deepEqual(projectPrivateSetInspection(r,{kind:'seat',seat:2}),{inspected:true,faceDown:true,zone:'backrow',targetUid:'m3:set-backrow',cardId:'53129443',cardName:'Mystical Space Typhoon',physicalOwnerSeat:3,revealedToViewer:true});});
test('the resolver partner receives a redacted projection',()=>{const r=inspectTagDuelSetCardAtSlot(makeState(),'m0:wdjat','normalSummon',{zone:'backrow',index:0},'m3:set-backrow',nameOf);assert.ok(r);const v=projectPrivateSetInspection(r,{kind:'seat',seat:0});assert.deepEqual(v,{inspected:true,faceDown:true,zone:'backrow',revealedToViewer:false});assert.equal('cardId' in v,false);assert.equal('targetUid' in v,false);});
test('public Discord projection contains no hidden identity',()=>{const r=inspectTagDuelSetCardAtSlot(makeState(),'m0:wdjat','normalSummon',{zone:'backrow',index:0},'m3:set-backrow',nameOf);assert.ok(r);assert.deepEqual(projectPrivateSetInspection(r,{kind:'public'}),{inspected:true,faceDown:true,zone:'backrow',revealedToViewer:false});});
test('opposing physical owner is also redacted',()=>{const r=inspectTagDuelSetCardAtSlot(makeState(),'m0:wdjat','normalSummon',{zone:'backrow',index:0},'m3:set-backrow',nameOf);assert.ok(r);const v=projectPrivateSetInspection(r,{kind:'seat',seat:3});assert.equal(v.revealedToViewer,false);assert.equal('physicalOwnerSeat' in v,false);});
test('source must be a face-up A Man with Wdjat on the resolving team field',()=>{const s=makeState();s.core.players[0].monsters[0].faceUp=false;assert.deepEqual(listTagDuelSetCardSlots(s,'m0:wdjat','normalSummon'),[]);s.core.players[0].monsters[0].faceUp=true;s.core.players[0].monsters[0].id='other';assert.deepEqual(listTagDuelSetCardSlots(s,'m0:wdjat','normalSummon'),[]);});
test('source on another team field cannot authorize inspection',()=>{const s=makeState();s.core.players[1].monsters=[{uid:'m1:wdjat',id:A_MAN_WITH_WDJAT_ID,faceUp:true,position:'atk',owner:1}];assert.deepEqual(listTagDuelSetCardSlots(s,'m1:wdjat','normalSummon'),[]);});
test('own team set cards are never listed as opposing targets',()=>{const s=makeState();s.core.players[0].backrow=[card('m0:own-set','53129443',false)];assert.ok(listTagDuelSetCardSlots(s,'m0:wdjat','normalSummon').every(x=>x.zone!=='backrow'));});
test('face-up opposing cards are excluded',()=>{const s=makeState();assert.equal(listTagDuelSetCardSlots(s,'m0:wdjat','normalSummon').some(x=>x.zone==='backrow'&&x.index===1),false);});
test('face-down monster in Attack Position is excluded',()=>{const s=makeState();s.core.players[1].monsters[0].position='atk';assert.equal(listTagDuelSetCardSlots(s,'m0:wdjat','normalSummon').some(x=>x.zone==='monster'),false);});
test('face-down monster in Defense Position can be inspected',()=>{const s=makeState();const r=inspectTagDuelSetCardAtSlot(s,'m0:wdjat','normalSummon',{zone:'monster',index:0},'m3:set-monster',nameOf);assert.ok(r);assert.equal(r.target.position,'def');});
test('face-down Field Zone card can be inspected',()=>{const s=makeState();const r=inspectTagDuelSetCardAtSlot(s,'m0:wdjat','normalSummon',{zone:'field',index:0},'m1:set-field',nameOf);assert.ok(r);assert.equal(r.target.zone,'field');assert.equal(r.target.physicalOwnerSeat,1);});
test('controller Standby trigger is accepted only inside its actual standby-flow choice',()=>{const s=makeState();assert.deepEqual(listTagDuelSetCardSlots(s,'m0:wdjat','controllerStandby'),[]);const id=wdjatStandbyTaskId('m0:wdjat',s.core.turn);s.core.phase='choice';s.core.choice={actor:0,source:'standby',targets:['inspect']};s.core.standby={tasks:[{id,turn:s.core.turn,actor:0,optional:false}],active:{id,status:'choosing'}};assert.equal(listTagDuelSetCardSlots(s,'m0:wdjat','controllerStandby').length,3);});
test('Normal Summon trigger is accepted in the supplied summon window',()=>{const s=makeState();assert.equal(listTagDuelSetCardSlots(s,'m0:wdjat','normalSummon').length,3);});
test('a stale slot UID binding cannot inspect a replacement card',()=>{const s=makeState();const before=JSON.stringify(s);const r=inspectTagDuelSetCardAtSlot(s,'m0:wdjat','normalSummon',{zone:'backrow',index:0},'m3:old-card',nameOf);assert.equal(r,null);assert.equal(JSON.stringify(s),before);});
test('a target without a physical-seat UID prefix is not disclosed',()=>{const s=makeState();s.core.players[1].backrow[0]={...s.core.players[1].backrow[0],uid:'hidden-card'};assert.equal(inspectTagDuelSetCardAtSlot(s,'m0:wdjat','normalSummon',{zone:'backrow',index:0},'hidden-card',nameOf),null);});
test('unknown card metadata fails closed',()=>{const s=makeState();assert.equal(inspectTagDuelSetCardAtSlot(s,'m0:wdjat','normalSummon',{zone:'backrow',index:0},'m3:set-backrow',()=>undefined),null);});
test('inspection and restoration do not mutate the TagDuel state',()=>{const s=makeState();const before=JSON.stringify(s);const r=inspectTagDuelSetCardAtSlot(s,'m0:wdjat','normalSummon',{zone:'backrow',index:0},'m3:set-backrow',nameOf);assert.ok(r);assert.deepEqual(restoreInspectedSetCard(r).uid,'m3:set-backrow');assert.equal(JSON.stringify(s),before);});
test('invalid slot zones and indexes fail closed',()=>{const s=makeState();assert.equal(inspectTagDuelSetCardAtSlot(s,'m0:wdjat','normalSummon',{zone:'backrow',index:99},'m3:missing',nameOf),null);assert.equal(inspectTagDuelSetCardAtSlot(s,'m0:wdjat','normalSummon',{zone:'field',index:1},'m1:set-field',nameOf),null);});
test('active representative comes from active[team], not the physical owner of Wdjat',()=>{const s=makeState();s.active=[0,1];const r=inspectTagDuelSetCardAtSlot(s,'m0:wdjat','normalSummon',{zone:'backrow',index:0},'m3:set-backrow',nameOf);assert.equal(r.resolverSeat,0);});


// The following fixtures use the actual serialized TagDuel structure rather
// than a reduced mock. Inactive seats are read from reserves; active[team]
// identifies the physical representative who receives the private result.
function takePhysical(game,seat,id){
  const team=seat%2,held=game.active[team]===seat?game.core.players[team]:game.reserves[String(seat)];
  for(const zone of ['deck','hand']){
    const index=held[zone].findIndex(card=>card.id===id);
    if(index>=0)return held[zone].splice(index,1)[0];
  }
  throw new Error('physical card not found for seat '+seat+': '+id);
}
function makeActualTagDuel(){
  const normals=tagNormalCardIds.slice(0,20);
  assert.ok(normals.length>=20);
  const game=createTagDuel([
    {id:'seat-0',name:'Seat 0',cards:[A_MAN_WITH_WDJAT_ID,...normals.slice(0,19)]},
    {id:'seat-1',name:'Seat 1',cards:[...normals]},
    {id:'seat-2',name:'Seat 2',cards:[...normals]},
    {id:'seat-3',name:'Seat 3',cards:[...normals]},
  ],{seed:'m433-actual-tag-state',first:2,classic:true});
  const sourceRef=takePhysical(game,0,A_MAN_WITH_WDJAT_ID);
  const targetId=game.reserves['1'].deck[0].id;
  const targetRef=takePhysical(game,1,targetId);
  const source={...sourceRef,faceUp:true,position:'atk',entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0,owner:0};
  const target={...targetRef,faceUp:false,position:'def',entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0,owner:1};
  game.core.players[0].monsters.push(source);
  game.core.players[1].monsters.push(target);
  game.core.phase='response';
  game.core.pending={kind:'summon',actor:0,card:source.uid,id:A_MAN_WITH_WDJAT_ID};
  assertTagDuel(game);
  return {game,source,target};
}
test('actual TagDuel resolves Wdjat for active seat 2 while source remains physically owned by seat 0',()=>{
  const {game,source,target}=makeActualTagDuel();
  assert.deepEqual(game.active,[2,3]);
  const slots=listTagDuelSetCardSlots(game,source.uid,'normalSummon');
  assert.deepEqual(slots,[{zone:'monster',index:0}]);
  const result=inspectTagDuelSetCardAtSlot(game,source.uid,'normalSummon',slots[0],target.uid,id=>names[id]||'Card '+id);
  assert.ok(result);
  assert.equal(result.resolverSeat,2);
  assert.equal(result.target.physicalOwnerSeat,1);
  const resolver=projectPrivateSetInspection(result,{kind:'seat',seat:2});
  const partner=projectPrivateSetInspection(result,{kind:'seat',seat:0});
  const publicView=projectPrivateSetInspection(result,{kind:'public'});
  assert.equal(resolver.cardId,target.id);
  assert.equal(partner.revealedToViewer,false);
  assert.equal('cardId' in partner,false);
  assert.equal('targetUid' in partner,false);
  assert.equal(publicView.revealedToViewer,false);
  assert.equal('cardName' in publicView,false);
  assertTagDuel(game);
});
test('actual TagDuel Standby inspection requires the Wdjat task for this source and turn',()=>{
  const {game,source}=makeActualTagDuel();
  const id=wdjatStandbyTaskId(source.uid,game.core.turn);
  game.core.phase='choice';
  game.core.pending={kind:'none'};
  game.core.choice={actor:0,source:'standby',targets:['inspect']};
  game.core.standby={version:1,tasks:[{id,turn:game.core.turn,actor:0,optional:false,options:[{id:'inspect',label:'Inspect a Set card',operations:[]}]}],completed:[],active:{id,status:'choosing'}};
  assertTagDuel(game);
  assert.deepEqual(listTagDuelSetCardSlots(game,source.uid,'controllerStandby'),[{zone:'monster',index:0}]);
});
test('a different Standby task cannot borrow Wdjat inspection',()=>{
  const s=makeState();
  s.core.phase='choice';s.core.choice={actor:0,source:'standby',targets:['other']};
  s.core.standby={tasks:[{id:'other-task',turn:1,actor:0,optional:false}],active:{id:'other-task',status:'choosing'}};
  assert.deepEqual(listTagDuelSetCardSlots(s,'m0:wdjat','controllerStandby'),[]);
});
test('Normal Summon inspection rejects Flip/Special Summon and mismatched source events',()=>{
  const s=makeState();
  s.core.pending={kind:'flip',actor:0,card:'m0:wdjat',id:A_MAN_WITH_WDJAT_ID};
  assert.deepEqual(listTagDuelSetCardSlots(s,'m0:wdjat','normalSummon'),[]);
  s.core.pending={kind:'specialSummon',actor:0,card:'m0:wdjat',id:A_MAN_WITH_WDJAT_ID};
  assert.deepEqual(listTagDuelSetCardSlots(s,'m0:wdjat','normalSummon'),[]);
  s.core.pending={kind:'summon',actor:0,card:'m0:other',id:A_MAN_WITH_WDJAT_ID};
  assert.deepEqual(listTagDuelSetCardSlots(s,'m0:wdjat','normalSummon'),[]);
});
test('a controlled Wdjat may be physically owned by the opposing team',()=>{
  const s=makeState();
  s.core.players[0].monsters[0].uid='m3:wdjat';
  s.core.players[0].monsters[0].owner=1;
  s.core.pending={kind:'summon',actor:0,card:'m3:wdjat',id:A_MAN_WITH_WDJAT_ID};
  assert.equal(listTagDuelSetCardSlots(s,'m3:wdjat','normalSummon').length,3);
});
test('Standby task IDs are stable and reject invalid physical source or turn',()=>{
  assert.equal(wdjatStandbyTaskId('m0:wdjat',2),'wdjat:m0:wdjat:2');
  assert.equal(wdjatStandbyTaskId('unowned',2),null);
  assert.equal(wdjatStandbyTaskId('m0:wdjat',0),null);
});
