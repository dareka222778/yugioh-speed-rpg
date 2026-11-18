'use strict';
const {test:nodeTest}=require('node:test');
const assert=require('node:assert/strict');

const tag=require('../dist/tagDuel');
const {renderTag}=require('../dist/tagRenderer');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getCard}=require('../dist/collection');

const SAFE_NORMALS=[];
const seenNormalNames=new Set();
for(const id of [...new Set(tag.tagNormalCardIds)]){
  const card=getPlayableCard(id),name=getCard(id)?.name;
  if(card?.kind==='monster'&&card.monsterType==='normal'&&Number.isInteger(card.atk)&&Number.isInteger(card.defense)&&card.level<=4&&name&&!seenNormalNames.has(name)){
    SAFE_NORMALS.push(id);seenNormalNames.add(name);
  }
}
assert.ok(SAFE_NORMALS.length>=20,'M360 requires at least 20 distinct certified Normal Monster names');
assert.ok(SAFE_NORMALS.length>=20,'M360 requires twenty distinct certified Normal Monsters');
const DECK=SAFE_NORMALS.slice(0,20);
assert.equal(new Set(DECK).size,20);
const member=seat=>'m360-seat-'+seat;
const players=[0,1,2,3].map(seat=>({
  id:member(seat),name:'M360 Seat '+seat,cards:[...DECK]
}));
function createState(){
  return tag.createTagDuel(players.map(p=>({...p,cards:[...p.cards]})),{
    classic:true,first:0,seed:'m360-private-hand-isolation'
  });
}
const stateA=createState();
const stateB=createState();
assert.deepEqual(stateA.active,[0,1]);
const ownerA=stateA.reserves[2],ownerB=stateB.reserves[2];
assert.ok(ownerA.hand.length>0&&ownerB.hand.length>0);
const original=ownerB.hand[0];
const originalName=getCard(original.id)?.name;
assert.ok(originalName,'M360 original hand card must resolve');
const replacementIndex=ownerB.deck.findIndex(card=>getCard(card.id)?.name!==originalName);
assert.ok(replacementIndex>=0,'M360 requires a distinct card in the same physical Deck');
const replacement=ownerB.deck[replacementIndex];
const replacementName=getCard(replacement.id)?.name;
assert.ok(replacementName&&replacementName!==originalName);
ownerB.hand[0]=replacement;
ownerB.deck[replacementIndex]=original;
assert.doesNotThrow(()=>tag.assertTagDuel(stateA));
assert.doesNotThrow(()=>tag.assertTagDuel(stateB));

const handA=tag.tagMemberHand(stateA,member(2)).map(card=>card.uid);
const handB=tag.tagMemberHand(stateB,member(2)).map(card=>card.uid);
assert.notDeepEqual(handA,handB,'only the physical owner hand should change');
for(const seat of [0,1,3]){
  assert.deepEqual(
    tag.tagMemberHand(stateA,member(seat)).map(card=>card.uid),
    tag.tagMemberHand(stateB,member(seat)).map(card=>card.uid),
    'unrelated physical hand must remain unchanged for seat '+seat
  );
}
assert.equal(stateA.reserves[2].hand.length,stateB.reserves[2].hand.length);
assert.equal(stateA.reserves[2].deck.length,stateB.reserves[2].deck.length);

async function render(state,seat){
  const calls=[];
  const image=await renderTag(state,seat===undefined?undefined:member(seat),async id=>{
    calls.push(id);
    return null;
  });
  return {image,calls};
}

nodeTest('M360 changing only inactive partner seat 2 hand changes only that physical owner private image',async()=>{
  const publicA=await render(stateA,undefined);
  const publicB=await render(stateB,undefined);
  assert.deepEqual(publicA.image,publicB.image,
    'public field image must not depend on any private hand identity');

  const seat0A=await render(stateA,0);
  const seat0B=await render(stateB,0);
  assert.deepEqual(seat0A.image,seat0B.image,
    'active ally seat 0 must not see inactive partner seat 2 hand changes');
  assert.ok(!seat0A.calls.includes(replacement.id));
  assert.ok(!seat0B.calls.includes(original.id));

  const seat1A=await render(stateA,1);
  const seat1B=await render(stateB,1);
  assert.deepEqual(seat1A.image,seat1B.image,
    'opponent seat 1 must not see partner seat 2 hand changes');

  const seat3A=await render(stateA,3);
  const seat3B=await render(stateB,3);
  assert.deepEqual(seat3A.image,seat3B.image,
    'opponent partner seat 3 must not see seat 2 hand changes');

  const seat2A=await render(stateA,2);
  const seat2B=await render(stateB,2);
  assert.notDeepEqual(seat2A.image,seat2B.image,
    'only the physical owner seat 2 receives the changed private hand');
  assert.ok(seat2A.calls.includes(original.id));
  assert.ok(!seat2A.calls.includes(replacement.id));
  assert.ok(seat2B.calls.includes(replacement.id));
  assert.ok(!seat2B.calls.includes(original.id));
});
