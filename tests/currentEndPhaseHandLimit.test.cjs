const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDuel,legalActions,step,decisionPlayer}=require('../dist/duelEngine');
const {starterContents,cards}=require('../dist/cardCatalog');
const {drawCards,pauseOverflow}=require('../dist/handFlow');
const {duelCards}=require('../dist/duelIntegrity');

const deck=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const services={finish(){throw new Error('unexpected deck-out');},checkLP(){}};
function game(){
  return createDuel(
    [{id:'a',name:'A',cards:deck},{id:'b',name:'B',cards:deck}],
    ()=>0.5
  );
}
function moveToHand(s,actor,count){
  s.players[actor].hand.push(...s.players[actor].deck.splice(0,count));
}
function act(s,actor,kind){
  const action=legalActions(s,actor).find(a=>a.kind===kind);
  assert.ok(action, `missing ${kind} action in ${s.phase}`);
  return step(s,actor,action);
}
function inventory(s){return duelCards(s).map(c=>c.uid).sort();}

test('current profile allows draws above six and waits until End Phase to request discard',()=>{
  let s=game();
  moveToHand(s,0,2);
  assert.equal(s.players[0].hand.length,6);
  assert.equal(drawCards(s,0,2,services),true);
  assert.equal(s.players[0].hand.length,8);
  assert.equal(pauseOverflow(s),false);
  assert.ok(legalActions(s,'a').some(a=>a.kind==='end'));

  s=act(s,'a','end');
  assert.equal(s.phase,'discard');
  assert.equal(decisionPlayer(s),0);
  assert.equal(s.players[0].hand.length,8);
  assert.deepEqual(legalActions(s,'b'),[]);
  assert.equal(s.rulesVersion,'speed-rpg-classic-v1');
});

test('exactly six cards at End Phase advances without an unnecessary discard',()=>{
  let s=game();
  moveToHand(s,0,2);
  assert.equal(s.players[0].hand.length,6);
  s=act(s,'a','end');
  assert.equal(s.phase,'main');
  assert.equal(s.current,1);
  assert.equal(s.players[0].hand.length,6);
});

test('two-card excess survives JSON restore and is discarded one action at a time',()=>{
  let s=game();
  moveToHand(s,0,2);
  assert.equal(drawCards(s,0,2,services),true);
  const before=inventory(s);
  s=act(s,'a','end');
  assert.equal(s.phase,'discard');
  assert.deepEqual(inventory(s),before);

  const first=legalActions(s,'a')[0];
  s=step(JSON.parse(JSON.stringify(s)),'a',first);
  assert.equal(s.phase,'discard');
  assert.equal(s.players[0].hand.length,7);
  assert.equal(s.players[0].grave.length,1);
  assert.deepEqual(inventory(s),before);

  const second=legalActions(s,'a')[0];
  s=step(JSON.parse(JSON.stringify(s)),'a',second);
  assert.equal(s.phase,'main');
  assert.equal(s.current,1);
  assert.equal(s.players[0].hand.length,6);
  assert.equal(s.players[0].grave.length,2);
  assert.deepEqual(inventory(s),before);
});

test('the engine accepts Main Deck boundaries 20 and 30 and rejects 19, 31 and Extra Deck 6',()=>{
  const nameById=new Map(cards.map(c=>[c.id,c.name]));
  const counts=new Map();
  for(const id of deck){
    const name=nameById.get(id);
    counts.set(name,(counts.get(name)||0)+1);
  }
  const extras=[];
  for(const item of starterContents.warrior){
    const name=nameById.get(item.id);
    while((counts.get(name)||0)<3&&extras.length<10){
      extras.push(item.id);
      counts.set(name,(counts.get(name)||0)+1);
    }
  }
  assert.equal(extras.length,10);
  const deck30=[...deck,...extras];
  assert.equal(deck30.length,30);
  assert.doesNotThrow(()=>createDuel(
    [{id:'a',name:'A',cards:deck30},{id:'b',name:'B',cards:deck30}],
    ()=>0.5
  ));
  assert.throws(()=>createDuel(
    [{id:'a',name:'A',cards:deck.slice(1)},{id:'b',name:'B',cards:deck}],
    ()=>0.5
  ),/20 a 30 cartas/);
  assert.throws(()=>createDuel(
    [{id:'a',name:'A',cards:[...deck30,'invalid']},{id:'b',name:'B',cards:deck}],
    ()=>0.5
  ),/20 a 30 cartas/);
  assert.throws(()=>createDuel(
    [{id:'a',name:'A',cards:deck,extra:Array(6).fill('invalid')},{id:'b',name:'B',cards:deck}],
    ()=>0.5
  ),/Deck Adicional: máximo de 5 cartas/);
});
