const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {engineCatalog,getPlayableCard}=require('../dist/effectRegistry');

const normalIds=tag.tagNormalCardIds
  .filter(id=>getPlayableCard(id)?.kind==='monster'&&!getPlayableCard(id)?.fusion)
  .slice(0,11);
const fusionIds=[...new Set(engineCatalog
  .filter(card=>card.fusion&&getPlayableCard(card.id))
  .map(card=>card.id))].slice(0,6);

assert.ok(normalIds.length>=11,'need eleven distinct certified Normal Monsters for 20/30/31-card boundaries');
assert.ok(fusionIds.length>=6,'need six distinct certified Fusion Monsters for Extra Deck boundaries');

const main20=normalIds.slice(0,10).flatMap(id=>[id,id]);
const main30=normalIds.slice(0,10).flatMap(id=>[id,id,id]);
const main19=main20.slice(1);
const main31=[...main30,normalIds[10]];
const extra5=fusionIds.slice(0,5);
const extra6=fusionIds.slice(0,6);

function players(){
  return [0,1,2,3].map(seat=>({
    id:'seat-'+seat,
    name:'Seat '+seat,
    cards:[...main20],
    extra:[...extra5]
  }));
}
function start(input){
  return tag.createTagDuel(input,{classic:true,seed:'tag-format-boundaries'});
}

test('classic 2v2 accepts 20 and 30 main-deck cards plus five Extra Deck cards for every seat',()=>{
  for(const count of [20,30]){
    const cards=count===20?main20:main30;
    const state=start(players().map(player=>({...player,cards:[...cards]})));
    assert.equal(state.mode,'tag-classic');
    assert.doesNotThrow(()=>tag.assertTagDuel(state));
    const inventory=tag.tagInventory(state);
    assert.equal(inventory.length,4*(count+5));
    assert.equal(new Set(inventory.map(card=>card.uid)).size,inventory.length);
    for(let seat=0;seat<4;seat++){
      const owned=inventory.filter(card=>card.uid.startsWith('m'+seat+':'));
      assert.equal(owned.length,count+5,'physical deck and Extra Deck must remain assigned to seat '+seat);
      assert.equal(new Set(owned.map(card=>card.uid)).size,count+5);
      assert.equal(tag.tagMemberHand(state,'seat-'+seat).length,4);
    }
  }
});

test('classic 2v2 rejects 19- and 31-card main decks independently for each physical seat',()=>{
  for(let seat=0;seat<4;seat++){
    for(const invalid of [main19,main31]){
      const input=players();
      input[seat].cards=[...invalid];
      assert.throws(()=>start(input),'seat '+seat+' accepted an invalid main deck of '+invalid.length);
    }
  }
});

test('classic 2v2 rejects a sixth Extra Deck card independently for each physical seat',()=>{
  for(let seat=0;seat<4;seat++){
    const input=players();
    input[seat].extra=[...extra6];
    assert.throws(()=>start(input),'seat '+seat+' accepted six Extra Deck cards');
  }
});

test('classic 2v2 rejects a non-Fusion card in the Extra Deck without changing any seat inventory',()=>{
  const nonFusion=normalIds[0];
  for(let seat=0;seat<4;seat++){
    const input=players();
    input[seat].extra=[...extra5.slice(0,4),nonFusion];
    assert.throws(()=>start(input),'seat '+seat+' accepted a non-Fusion Extra Deck card');
  }
});
