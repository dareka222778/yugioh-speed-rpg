const {test}=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../dist/duelEngine');
const {starterContents}=require('../dist/cardCatalog');
const {engineCard}=require('../dist/effectRegistry');

const basic=starterContents.warrior.flatMap(item=>Array(item.quantity).fill(item.id));

test('Fusion actions name the selected Extra Deck monster, never a fixed example',()=>{
  const state=engine.createDuel([
    {id:'a',name:'A',cards:basic},
    {id:'b',name:'B',cards:basic}
  ],undefined,0,{randomSeed:'37'.repeat(32)});

  state.players[0].hand=[{uid:'poly',id:'24094653'}];
  for(const [uid,id] of [['flame','45231177'],['bugroth','40173854']]){
    state.players[0].extra=[{uid,id}];
    const label=engine.actionLabel(state,'a',{
      kind:'fusion',card:'poly',extra:uid,materials:[],position:'atk'
    });
    assert.match(label,new RegExp(engineCard(id).name));
    assert.match(label,/Fusão:/);
    if(uid==='bugroth')assert.ok(!label.includes(engineCard('45231177').name));
  }
});
