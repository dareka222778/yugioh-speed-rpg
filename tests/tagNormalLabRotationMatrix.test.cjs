'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  createTagDuel,assertTagDuel,stepTagDuel,tagDecisionMember,tagActions,
  tagMemberHand,publicTagDuel,tagNormalCardIds
}=require('../dist/tagDuel');
const {getPlayableCard,getEffect,engineCatalog}=require('../dist/effectRegistry');

const normalIds=tagNormalCardIds.filter(id=>{
  const card=getPlayableCard(id);
  return card&&card.level<=4&&card.atk>=1400&&getEffect(id)?.kind==='normal';
}).slice(0,10);
const normalDeck=normalIds.flatMap(id=>[id,id,id]);

function makePlayers(first,cards=normalDeck){
  return Array.from({length:4},(_,seat)=>({
    id:`m507-${first}-seat-${seat}`,
    name:`Seat ${seat}`,
    cards:[...cards]
  }));
}
function makeGame(first,seed,cards=normalDeck){
  return createTagDuel(makePlayers(first,cards),{seed,first});
}
function physicalDeck(state,memberId){
  const index=state.members.findIndex(member=>member.id===memberId);
  assert.notEqual(index,-1,'physical member must exist');
  const team=index%2;
  const cards=state.active[team]===index
    ?state.core.players[team].deck
    :state.reserves[index]?.deck;
  assert.ok(Array.isArray(cards),'each physical member keeps a private Deck');
  return cards.map(card=>card.uid);
}
function handSnapshot(state){
  return Object.fromEntries(state.members.map(member=>[
    member.id,tagMemberHand(state,member.id).map(card=>card.uid)
  ]));
}
function deckSnapshot(state){
  return Object.fromEntries(state.members.map(member=>[
    member.id,physicalDeck(state,member.id)
  ]));
}
function endTurn(state){
  const actor=tagDecisionMember(state).id;
  const action=tagActions(state,actor).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active physical seat must be able to end its Main Phase');
  return stepTagDuel(state,actor,action);
}
function assertPublicPrivacy(state){
  const hidden=[...Object.values(handSnapshot(state)).flat(),...Object.values(deckSnapshot(state)).flat()];
  const serialized=JSON.stringify(publicTagDuel(state));
  assert.doesNotMatch(serialized,/"hand"\s*:/);
  assert.doesNotMatch(serialized,/"deck"\s*:/);
  for(const uid of hidden)assert.equal(serialized.includes(uid),false,`public projection leaked private UID ${uid}`);
}

test('M507 fixture is ten certified low-level Normal monsters and a legal 30-card Main Deck',()=>{
  assert.equal(normalIds.length,10);
  assert.equal(normalDeck.length,30);
  assert.equal(new Set(normalIds).size,10);
  for(const id of normalIds){
    assert.equal(getPlayableCard(id)?.monsterType,'normal');
    assert.equal(getEffect(id)?.kind,'normal');
  }
});

for(const first of [0,1,2,3]){
  test(`M507 physical hands and Decks rotate A1→B1→A2→B2 from starting seat ${first}`,()=>{
    let state=makeGame(first,`m507-rotation-${first}`);
    const expectedActive=[...state.active];
    const expected=(offset)=>`m507-${first}-seat-${(first+offset)%4}`;

    assert.equal(state.mode,'tag-normal-lab');
    assert.equal(state.members.length,4);
    assert.equal(tagDecisionMember(state).id,expected(0));
    assert.deepEqual(Object.values(handSnapshot(state)).map(cards=>cards.length),[4,4,4,4]);
    assert.deepEqual(Object.values(deckSnapshot(state)).map(cards=>cards.length),[26,26,26,26]);

    for(let turn=0;turn<4;turn++){
      const actor=expected(turn);
      assert.equal(tagDecisionMember(state).id,actor);
      for(const member of state.members){
        const actions=tagActions(state,member.id);
        assert.equal(actions.length>0,member.id===actor,
          `only active physical seat ${actor} may act; checked ${member.id}`);
      }

      const beforeHands=handSnapshot(state);
      const beforeDecks=deckSnapshot(state);
      const incoming=expected(turn+1);
      state=endTurn(state);
      state=JSON.parse(JSON.stringify(state));
      assertTagDuel(state);

      assert.equal(tagDecisionMember(state).id,incoming);
      expectedActive[incoming.endsWith('-seat-0')||incoming.endsWith('-seat-2')?0:1]=((first+turn+1)%4);
      assert.deepEqual(state.active,expectedActive,
        'each team keeps its last active physical seat until that team starts the next turn');
      assert.equal(state.cursor,(first+turn+1)%4);
      const afterHands=handSnapshot(state);
      const afterDecks=deckSnapshot(state);
      for(const member of state.members){
        if(member.id===incoming){
          assert.equal(afterHands[member.id].length,beforeHands[member.id].length+1,
            'the incoming physical owner receives the turn draw');
          assert.equal(afterDecks[member.id].length,beforeDecks[member.id].length-1,
            'the draw comes from the incoming physical owner Deck');
        }else{
          assert.deepEqual(afterHands[member.id],beforeHands[member.id],
            'another seat hand must remain byte-for-byte stable');
          assert.deepEqual(afterDecks[member.id],beforeDecks[member.id],
            'another seat Deck order must remain byte-for-byte stable');
        }
      }

      for(const team of state.core.players){
        assert.ok(team.monsters.length<=3);
        assert.ok(team.backrow.length<=3);
        assert.ok((team.extra??[]).length<=5);
      }
      assertPublicPrivacy(state);
    }

    assert.equal(state.core.turn,5);
    const nextSeat=first;
    const previousSeat=(first+3)%4;
    const finalActive=[null,null];
    finalActive[nextSeat%2]=nextSeat;
    finalActive[previousSeat%2]=previousSeat;
    assert.deepEqual(state.active,finalActive,'each team retains its last physical seat until its next turn');
    assert.deepEqual(Object.values(handSnapshot(state)).map(cards=>cards.length),[5,5,5,5]);
    assert.deepEqual(Object.values(deckSnapshot(state)).map(cards=>cards.length),[25,25,25,25]);
  });
}

test('M507 seeded setup is reproducible and survives a JSON persistence boundary',()=>{
  const first=2,seed='m507-deterministic-seed';
  const left=makeGame(first,seed),right=makeGame(first,seed);
  assert.deepEqual(handSnapshot(left),handSnapshot(right));
  assert.deepEqual(deckSnapshot(left),deckSnapshot(right));

  const restored=JSON.parse(JSON.stringify(left));
  assertTagDuel(restored);
  assert.deepEqual(handSnapshot(restored),handSnapshot(left));
  assert.deepEqual(deckSnapshot(restored),deckSnapshot(left));
  assert.equal(tagDecisionMember(restored).id,tagDecisionMember(left).id);
});

test('M507 normal laboratory rejects effect monsters and Main Decks outside 20–30',()=>{
  const effectMonster=engineCatalog.find(card=>card.kind==='monster'&&getEffect(card.id)?.kind!=='normal');
  assert.ok(effectMonster,'the executable catalog must contain an effect-monster negative fixture');
  const invalid=[...normalDeck];
  invalid[0]=effectMonster.id;
  assert.throws(()=>makeGame(0,'m507-effect-rejected',invalid),/somente monstros normais/);
  assert.throws(()=>makeGame(0,'m507-short-deck',normalDeck.slice(0,19)),/20 a 30 cartas/);
  assert.throws(()=>makeGame(0,'m507-long-deck',[...normalDeck,normalDeck[0]]),/20 a 30 cartas/);
});

test('M507 normal laboratory rejects an Extra Deck larger than five',()=>{
  const players=makePlayers(0);
  for(const player of players)player.extra=Array(6).fill('00000000');
  assert.throws(()=>createTagDuel(players,{seed:'m507-extra-limit',first:0}),/Deck Adicional: máximo de 5 cartas/);
});
