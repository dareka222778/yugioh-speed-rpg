const {test}=require('node:test'),assert=require('node:assert/strict');
const e=require('../dist/duelEngine'),{starterContents}=require('../dist/cardCatalog'),{duelCards,assertDuelState}=require('../dist/duelIntegrity');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id='91152256')=>({uid,id}),back=(uid,id)=>({...ref(uid,id),setTurn:0,faceUp:false});
const mon=(uid,owner=0)=>({...ref(uid),owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const restore=s=>{const copy=JSON.parse(JSON.stringify(s));assertDuelState(copy);return copy;};
function game(){const s=e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);s.turn=3;s.players.forEach(p=>p.hand=[]);return s;}
function act(s,who,kind,predicate=()=>true){const a=e.legalActions(s,who).find(a=>a.kind===kind&&predicate(a));assert.ok(a,`${who} ${kind}: ${JSON.stringify(e.legalActions(s,who))}`);return e.step(restore(s),who,a);}
function settle(s){for(let n=0;s.phase==='response';n++){assert.ok(n<30);s=act(s,s.players[e.decisionPlayer(s)].id,'pass');}return s;}
function conserve(before,after){assert.deepEqual(duelCards(after).map(c=>[c.uid,c.id]).sort(),duelCards(before).map(c=>[c.uid,c.id]).sort());}
for(const root of [true,false])test(`05318639 MST ${root?'root':'added link'} loses its chosen target to a higher link without retargeting or false success after restore`,()=>{
 let s=game();s.players[0].hand=[ref('first',root?'05318639':'55144522')];s.players[0].backrow=[back('third','05318639')];s.players[1].backrow=[back('second','05318639'),back('victim','12607053'),back('untouched','44209392')];const before=restore(s);
 s=act(s,'a','spell',a=>a.card==='first'&&(!root||a.target==='victim'));
 s=act(s,'b','spell',a=>a.card==='second'&&a.target==='victim');
 if(!root)s=act(s,'a','spell',a=>a.card==='third'&&a.target==='victim');
 s=settle(restore(s));assert.equal(s.phase,'main');assert.ok(s.players[1].backrow.some(c=>c.uid==='untouched'));assert.equal(s.players[1].grave.filter(c=>c.uid==='victim').length,1);
 assert.equal(s.log.filter(l=>l.includes('nenhuma carta foi destruída por este efeito')).length,1);assert.equal(s.log.filter(l=>l.includes('destruiu a Magia/Armadilha escolhida')).length,1);conserve(before,s);
});
for(const root of [true,false])test(`14087893 Book ${root?'root':'added link'} cannot replace its target after another Book sets it face-down`,()=>{
 let s=game();s.players[0].hand=[ref('first',root?'14087893':'55144522')];s.players[0].monsters=[mon('target'),mon('untouched')];s.players[0].backrow=[back('third','14087893')];s.players[1].backrow=[back('second','14087893')];const before=restore(s);
 s=act(s,'a','spell',a=>a.card==='first'&&(!root||a.target==='target'));s=act(s,'b','spell',a=>a.card==='second'&&a.target==='target');
 if(!root)s=act(s,'a','spell',a=>a.card==='third'&&a.target==='target');
 s=settle(restore(s));assert.equal(s.players[0].monsters[0].faceUp,false);assert.equal(s.players[0].monsters[1].faceUp,true);assert.equal(s.log.filter(l=>l.includes('Livro da Lua colocou')).length,1);conserve(before,s);
});
for(const id of ['05318639','14087893'])test(`${id} activated Quick-Play resolves after its own card is destroyed; a source is not an activation cost`,()=>{
 let s=game();s.players[0].hand=[ref('source',id)];s.players[0].monsters=[mon('monster')];s.players[1].backrow=[back('mst','05318639'),back('victim','12607053')];const before=restore(s),target=id==='05318639'?'victim':'monster';
 s=act(s,'a','spell',a=>a.target===target);s=act(s,'b','spell',a=>a.target==='source');s=settle(restore(s));
 assert.equal(s.players[0].grave.filter(c=>c.uid==='source').length,1);
 if(id==='05318639')assert.equal(s.players[1].grave.filter(c=>c.uid==='victim').length,1);else assert.equal(s.players[0].monsters[0].faceUp,false);
 conserve(before,s);
});
test('77414722 / 03819470 saved counter-of-counter chain preserves all discard and LP costs even when effects are negated',()=>{
 let s=game();s.players[0].hand=[ref('pot','55144522')];s.players[0].backrow=[back('tools-a','03819470')];s.players[1].hand=[ref('cost'),ref('keep')];s.players[1].backrow=[back('jam','77414722'),back('tools-b','03819470')];const before=restore(s),deck=s.players[0].deck.map(c=>c.uid);
 s=act(s,'a','spell');s=act(s,'b','trap',a=>a.card==='jam'&&a.discards?.[0]==='cost');s=act(s,'a','trap',a=>a.card==='tools-a');s=act(s,'b','trap',a=>a.card==='tools-b');s=settle(restore(s));
 assert.equal(s.players[0].lp,3000);assert.equal(s.players[1].lp,3000);assert.deepEqual(s.players[0].deck.map(c=>c.uid),deck);assert.deepEqual(s.players[1].hand.map(c=>c.uid),['keep']);assert.equal(s.players[1].grave.filter(c=>c.uid==='cost').length,1);assert.equal(s.players[0].grave.filter(c=>c.uid==='pot').length,1);conserve(before,s);
});
test('14087893 response target menu is independent of hidden monster identity, excludes hidden targets and rejects forged UIDs',()=>{
 let s=game();s.players[0].hand=[ref('pot','55144522')];s.players[1].monsters=[mon('shown',1),{...mon('hidden',1),faceUp:false,position:'def'}];s.players[1].backrow=[back('book','14087893')];s=act(s,'a','spell');const actions=e.legalActions(s,'b').filter(a=>a.kind==='spell');assert.deepEqual(actions.map(a=>a.target),['shown']);
 const altered=restore(s);altered.players[1].monsters[1].id='46986414';assert.deepEqual(e.legalActions(altered,'b'),e.legalActions(s,'b'));
 assert.throws(()=>e.step(restore(s),'b',{kind:'spell',card:'book',target:'hidden'}),/inválida/);assert.throws(()=>e.step(restore(s),'b',{kind:'spell',card:'book',target:'fake'}),/inválida/);
});
