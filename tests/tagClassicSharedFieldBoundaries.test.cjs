const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {engineCatalog,getPlayableCard}=require('../dist/effectRegistry');

const monsterIds=tag.tagNormalCardIds
  .filter(id=>getPlayableCard(id)?.kind==='monster')
  .slice(0,4);
const spellTrapIds=engineCatalog
  .filter(card=>['spell','trap'].includes(card.kind)&&getPlayableCard(card.id))
  .map(card=>card.id)
  .slice(0,6);
const fusionIds=[...new Set(engineCatalog
  .filter(card=>card.fusion&&getPlayableCard(card.id))
  .map(card=>card.id))].slice(0,5);
assert.equal(monsterIds.length,4);
assert.equal(spellTrapIds.length,6);
assert.equal(fusionIds.length,5);

const main=[...monsterIds,...spellTrapIds].flatMap(id=>[id,id]);
function game(){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:'field-seat-'+seat,
    name:'Field Seat '+seat,
    cards:[...main],
    extra:[...fusionIds]
  })),{classic:true,seed:'tag-shared-field-boundaries'});
}
function take(player,id){
  for(const zone of ['hand','deck']){
    const index=player[zone].findIndex(card=>card.id===id);
    if(index>=0)return player[zone].splice(index,1)[0];
  }
  throw new Error('physical card unavailable: '+id);
}
function monster(card){
  return {...card,owner:0,faceUp:true,position:'atk',entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0};
}
function backrow(card){
  return {...card,setTurn:0,faceUp:false};
}
function fillThreeAndThree(state){
  const team=state.core.players[0];
  team.monsters=monsterIds.slice(0,3).map(id=>monster(take(team,id)));
  team.backrow=spellTrapIds.slice(0,3).map(id=>backrow(take(team,id)));
  return state;
}

test('classic 2v2 shares exactly three Monster Zones and three Spell/Trap Zones per team',()=>{
  const state=fillThreeAndThree(game());
  assert.equal(state.core.players[0].monsters.length,3);
  assert.equal(state.core.players[0].backrow.length,3);
  assert.equal(tag.tagInventory(state).length,100);
  assert.equal(new Set(tag.tagInventory(state).map(card=>card.uid)).size,100);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
});

test('classic 2v2 rejects a fourth shared Monster Zone without losing the physical card',()=>{
  const state=fillThreeAndThree(game());
  const team=state.core.players[0];
  team.monsters.push(monster(take(team,monsterIds[3])));
  const inventory=tag.tagInventory(state);
  assert.equal(inventory.length,100);
  assert.equal(new Set(inventory.map(card=>card.uid)).size,100);
  assert.throws(()=>tag.assertTagDuel(state),/limite de zonas/);
});

test('classic 2v2 rejects a fourth shared Spell/Trap Zone without losing the physical card',()=>{
  const state=fillThreeAndThree(game());
  const team=state.core.players[0];
  team.backrow.push(backrow(take(team,spellTrapIds[3])));
  const inventory=tag.tagInventory(state);
  assert.equal(inventory.length,100);
  assert.equal(new Set(inventory.map(card=>card.uid)).size,100);
  assert.throws(()=>tag.assertTagDuel(state),/limite de zonas/);
});
