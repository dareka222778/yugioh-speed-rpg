const {test}=require('node:test'),assert=require('node:assert/strict');
const e=require('../dist/duelEngine'),{filteredDestructionUtility:utility}=require('../dist/filteredDestructionStrategy'),{mechanicalBatch15:cards,mechanicalEffects15:effects}=require('../dist/mechanicalBatch15'),r=require('../dist/effectRegistry');
const basic=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id)),mon=(uid,id,owner)=>({uid,id,owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
for(const c of cards)test('public tactical utility: '+c.englishName+' considers both controllers without hidden identity access',()=>{
 const s=e.getArchivedDefinitionResolver('engine-v8').createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}]);s.turn=3;s.players[0].hand=[];s.players[1].hand=[];const effect=effects[c.id],race=effect.filter.races?.[0]??'Warrior',id=r.engineCatalog.find(c=>c.monsterType==='normal'&&c.race===race).id;
 s.players[1].monsters=[mon('enemy',id,1)];if(effect.filter.equipped)s.players[0].backrow=[{uid:'equip',id:'56747793',faceUp:true,resolved:true,setTurn:0,equippedTo:'enemy'}];
 const before=JSON.stringify(s);assert.ok(utility(s,0,effect)>0);assert.equal(JSON.stringify(s),before);
 const own=structuredClone(s);own.players[0].monsters=own.players[1].monsters;own.players[1].monsters=[];assert.ok(utility(own,0,effect)<0);
 s.players[1].monsters[0].faceUp=false;s.players[1].monsters[0].position='def';assert.equal(utility(s,0,effect),0);s.players[1].monsters[0].id='89631139';assert.equal(utility(s,0,effect),0);
});
test('tactical utility excludes spell-immune public monsters and never reinterprets a v7 state as v8',()=>{
 const players=[{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],s=e.getArchivedDefinitionResolver('engine-v8').createDuel(players),id=r.engineCatalog.find(c=>c.monsterType==='normal'&&c.race==='Machine').id;
 s.players[1].monsters=[mon('immune',id,1)];s.players[0].backrow=[{uid:'area',id:'20065549',faceUp:true,resolved:true,setTurn:0}];assert.equal(utility(s,0,effects['21323861']),0);
 const old=e.getArchivedDefinitionResolver('engine-v7').createDuel(players);assert.equal(utility(old,0,effects['21323861']),0);
});

test('current v9 AI evaluates the current catalog without feeding it to the archived v8 runtime',()=>{
 const s=e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}]);
 assert.equal(s.resolverVersion,'engine-v9');
 const id=r.engineCatalog.find(c=>c.monsterType==='normal'&&c.race==='Machine').id;
 s.players[1].monsters=[mon('enemy',id,1)];const before=JSON.stringify(s);
 assert.ok(utility(s,0,effects['21323861'])>0);assert.equal(JSON.stringify(s),before);
 s.players[0].backrow=[{uid:'area',id:'20065549',faceUp:true,resolved:true,setTurn:0}];
 assert.equal(utility(s,0,effects['21323861']),0);
});
