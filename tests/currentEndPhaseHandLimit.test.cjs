const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDuel,legalActions,step,decisionPlayer}=require('../dist/duelEngine');
const {starterContents,cards}=require('../dist/cardCatalog');
const {drawCards,pauseOverflow}=require('../dist/handFlow');
const {duelCards,assertDuelState}=require('../dist/duelIntegrity');
const {getEnabledCardIds}=require('../dist/effectRegistry');

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

test('three Monster Zones and three Spell/Trap Zones are full while the Field Zone remains separate',()=>{
  const enabled=new Set(getEnabledCardIds());
  const fieldCard=cards.find(c=>c.field&&enabled.has(c.id)&&!deck.includes(c.id));
  assert.ok(fieldCard,'expected at least one enabled Field Spell');
  const fieldId=fieldCard.id;
  const fieldDeck=[...deck];
  fieldDeck[0]=fieldId;
  let s=createDuel(
    [{id:'a',name:'A',cards:fieldDeck},{id:'b',name:'B',cards:deck}],
    ()=>0.5
  );
  const p=s.players[0];
  const all=[...p.hand,...p.deck];
  const byId=new Map(cards.map(c=>[c.id,c]));
  const monsters=all.filter(ref=>byId.get(ref.id)?.kind==='monster').slice(0,3);
  const backrow=all.filter(ref=>byId.get(ref.id)?.kind!=='monster'&&ref.id!==fieldId).slice(0,3);
  const field=all.find(ref=>ref.id===fieldId);
  assert.equal(monsters.length,3);
  assert.equal(backrow.length,3);
  assert.ok(field);
  const moved=new Set([...monsters,...backrow,field].map(ref=>ref.uid));
  p.hand=p.hand.filter(ref=>!moved.has(ref.uid));
  p.deck=p.deck.filter(ref=>!moved.has(ref.uid));
  p.monsters=monsters.map(ref=>({...ref,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0}));
  p.backrow=backrow.map(ref=>({...ref,faceUp:false,setTurn:0}));
  p.hand.push(field);
  assertDuelState(s);

  const actions=legalActions(s,'a');
  assert.equal(actions.filter(a=>a.kind==='summon'&&a.tributes.length===0).length,0);
  assert.equal(actions.filter(a=>a.kind==='set').length,0);
  assert.ok(actions.some(a=>a.kind==='field'&&a.card===field.uid));
  assert.ok(actions.some(a=>a.kind==='setField'&&a.card===field.uid));
  assert.equal(p.monsters.length,3);
  assert.equal(p.backrow.length,3);
  assert.equal(p.field,null);
});
