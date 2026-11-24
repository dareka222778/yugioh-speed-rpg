'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const TRAP_HOLE='04206964';
const WABOKU='12607053';
const member=seat=>'m241-seat-'+seat;
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster')
  .slice(0,8);
assert.equal(NORMALS.length,8,'the four physical Decks need eight certified Normal Monsters');
assert.equal(getPlayableCard(TRAP_HOLE)?.kind,'trap');
assert.equal(getPlayableCard(WABOKU)?.kind,'trap');
function deck(){
  return [
    ...NORMALS.flatMap(id=>[id,id]),
    TRAP_HOLE,TRAP_HOLE,WABOKU,WABOKU
  ];
}
function players(){
  return [0,1,2,3].map(seat=>({id:member(seat),name:'M241 Seat '+seat,cards:deck()}));
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takePhysical(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M241 physical card missing from seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function setBackrow(state,seat,id){
  const card=takePhysical(state,seat,id);
  const setCard={...card,setTurn:0,faceUp:false};
  state.core.players[seat%2].backrow.push(setCard);
  return setCard;
}
function rules(state){
  const value=rulesFor(state.core);
  assert.equal(value.mainDeckMin,20);
  assert.equal(value.mainDeckMax,30);
  assert.equal(value.handLimit,6);
  assert.equal(value.handCheck,'end');
  assert.equal(value.extraDeckMax,5);
  assert.equal(value.monsterZones,3);
  assert.equal(value.spellTrapZones,3);
}
function inventory(state){
  const cards=tag.tagInventory(state);
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(cards.length,80,'four physical 20-card Decks must remain represented');
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function fillTeam(state,team,firstSeat,partnerSeat){
  const monsters=[
    deploy(state,firstSeat,NORMALS[0]),
    deploy(state,firstSeat,NORMALS[1]),
    deploy(state,partnerSeat,NORMALS[2])
  ];
  const backrow=[
    setBackrow(state,firstSeat,TRAP_HOLE),
    setBackrow(state,firstSeat,WABOKU),
    setBackrow(state,partnerSeat,TRAP_HOLE)
  ];
  assert.ok(monsters.every(card=>card.owner===team));
  assert.ok(backrow.every(card=>card.uid.startsWith('m'+(card===backrow[2]?partnerSeat:firstSeat)+':')));
  return {monsters,backrow};
}

test('both teams independently share exactly three Monster and three Spell/Trap zones across their physical partners',()=>{
  const state=tag.createTagDuel(players(),{classic:true,first:0,seed:'m241-shared-zones'});
  const blue=fillTeam(state,0,0,2);
  const red=fillTeam(state,1,1,3);
  assert.equal(state.core.players[0].monsters.length,3);
  assert.equal(state.core.players[0].backrow.length,3);
  assert.equal(state.core.players[1].monsters.length,3);
  assert.equal(state.core.players[1].backrow.length,3);
  assert.ok(blue.monsters[0].uid.startsWith('m0:'));
  assert.ok(blue.monsters[2].uid.startsWith('m2:'));
  assert.ok(red.monsters[0].uid.startsWith('m1:'));
  assert.ok(red.monsters[2].uid.startsWith('m3:'));
  assert.ok(blue.backrow[2].uid.startsWith('m2:'));
  assert.ok(red.backrow[2].uid.startsWith('m3:'));
  rules(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventory(state);
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const card of [...blue.backrow,...red.backrow]){
    assert.ok(!publicState.includes(card.id),'Set backrow identity must remain hidden');
    assert.ok(!publicState.includes(card.uid),'Set backrow UID must remain hidden');
  }
  assertPrivateHands(state);
  assertConserved(state,before);
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
});

function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(let seat=0;seat<4;seat++){
    for(const card of tag.tagMemberHand(state,member(seat))){
      assert.ok(!publicState.includes(card.uid),'private hand UID leaked for seat '+seat);
    }
  }
}

test('a fourth Monster is rejected on either shared team field without changing the valid three-zone state',()=>{
  const state=tag.createTagDuel(players(),{classic:true,first:0,seed:'m241-fourth-monster'});
  fillTeam(state,0,0,2);fillTeam(state,1,1,3);
  for(const [team,seat] of [[0,2],[1,3]]){
    const invalid=JSON.parse(JSON.stringify(state));
    const card=takePhysical(invalid,seat,NORMALS[3]);
    invalid.core.players[team].monsters.push({...card,owner:team,position:'atk',faceUp:true,
      entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
    assert.throws(()=>tag.assertTagDuel(invalid),/limite de zonas/i,
      'team '+team+' must reject a fourth Monster even when supplied by its partner');
  }
  assert.equal(state.core.players[0].monsters.length,3);
  assert.equal(state.core.players[1].monsters.length,3);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
});

test('a fourth Spell/Trap is rejected on either shared team backrow',()=>{
  const state=tag.createTagDuel(players(),{classic:true,first:0,seed:'m241-fourth-backrow'});
  fillTeam(state,0,0,2);fillTeam(state,1,1,3);
  for(const [team,seat] of [[0,2],[1,3]]){
    const invalid=JSON.parse(JSON.stringify(state));
    const card=takePhysical(invalid,seat,WABOKU);
    invalid.core.players[team].backrow.push({...card,setTurn:0,faceUp:false});
    assert.throws(()=>tag.assertTagDuel(invalid),/limite de zonas/i,
      'team '+team+' must reject a fourth backrow card even when supplied by its partner');
  }
  assert.equal(state.core.players[0].backrow.length,3);
  assert.equal(state.core.players[1].backrow.length,3);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
});
