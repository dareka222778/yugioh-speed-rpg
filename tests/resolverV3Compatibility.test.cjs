const {test}=require('node:test'),assert=require('node:assert/strict');
const e=require('../dist/duelEngine'),a=require('../dist/resolverArchive'),root=require('../dist/effectRegistry'),{starterContents}=require('../dist/cardCatalog'),{assertDuelState}=require('../dist/duelIntegrity');
const cards=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id)),players=[{id:'a',name:'A',cards},{id:'b',name:'B',cards}],clone=s=>JSON.parse(JSON.stringify(s));
test('v2 pending paid chain and chosen response replay exactly after v3 installation',()=>{
 const v2=a.getArchivedDefinitionResolver('engine-v2');let s=v2.createDuel(players,undefined,0,{randomSeed:'ab'.repeat(32)});s.turn=3;s.players[0].hand=[{uid:'heal',id:'38199696'}];s.players[1].hand=[{uid:'cost',id:'91152256'}];s.players[1].backrow=[{uid:'counter',id:'77414722',faceUp:false,setTurn:1}];s=v2.step(s,'a',v2.legalActions(s,'a').find(x=>x.kind==='spell'));
 const counter=e.legalActions(s,'b').find(x=>x.kind==='trap');assert.ok(counter);let old=v2.step(clone(s),'b',counter),restored=e.step(clone(s),'b',counter);assert.deepEqual(clone(restored),clone(old));assert.equal(restored.resolverVersion,'engine-v2');assert.ok(restored.players[1].grave.some(c=>c.uid==='cost'));assert.equal(restored.players[1].hand.length,0);
 for(let n=0;restored.phase==='response';n++){assert.ok(n<12);const who=restored.players[e.decisionPlayer(restored)].id;old=v2.step(old,who,{kind:'pass'});restored=e.step(clone(restored),who,{kind:'pass'});assert.deepEqual(clone(restored),clone(old));}
 assert.equal(restored.players[0].lp,4000);assertDuelState(restored);
});
test('v3 definitions remain pinned when mutable development metadata changes',()=>{
 const id='46718686',card=root.engineCard(id),original=card.atk;const v3=a.getArchivedDefinitionResolver('engine-v3');
 try{card.atk=9999;assert.equal(v3.getPlayableCard(id).atk,original);const exposed=v3.getPlayableCard(id);exposed.atk=8888;assert.equal(v3.getPlayableCard(id).atk,original);
  let s=e.createDuel(players,()=>.5);s.players[0].hand[0].id=id;const action=e.legalActions(s,'a').find(x=>x.kind==='summon'&&x.card===s.players[0].hand[0].uid&&x.position==='atk');s=e.step(clone(s),'a',action);assert.equal(e.atk(s.players[0].monsters[0],s),original);assertDuelState(clone(s));
 }finally{card.atk=original;}
});
