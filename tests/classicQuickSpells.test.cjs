const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDuel,legalActions,step,actionLabel}=require('../dist/duelEngine');
const {starterContents}=require('../dist/cardCatalog');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id)=>({uid,id});
const back=(uid,id,setTurn=1)=>({...ref(uid,id),faceUp:false,setTurn});
const monster=(uid,id='91152256')=>({...ref(uid,id),owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const game=()=>{const s=createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);s.turn=3;return s;};
function play(s,actor,kind,check=()=>true){const action=legalActions(s,actor).find(a=>a.kind===kind&&check(a));assert.ok(action,`Missing ${kind} in ${s.phase}: ${JSON.stringify(legalActions(s,actor))}`);return step(s,actor,action);}
test('Mystical Space Typhoon is a playable Quick-Play Spell with official target text',()=>{
 const {getCard}=require('../dist/collection'),{getEffect}=require('../dist/effectRegistry');
 assert.equal(getEffect('05318639').kind,'mysticalSpaceTyphoon');
 assert.equal(getCard('05318639').kind,'spell');assert.equal(getCard('05318639').englishName,'Mystical Space Typhoon');
});
test('Quick-Play can be activated from hand during own turn in response to a spell',()=>{
 let s=game();s.players[0].hand=[ref('pot','55144522'),ref('mst','05318639')];
 s.players[0].deck=[ref('draw1','91152256'),ref('draw2','48305365')];s.players[1].backrow=[back('set','12607053')];
 s=play(s,'a','spell',a=>a.card==='pot');
 assert.equal(s.phase,'response');
 s=play(s,'a','spell',a=>a.card==='mst'&&a.target==='set');
 assert.equal(s.phase,'main');
 assert.equal(s.players[1].backrow.length,0);assert.ok(s.players[1].grave.some(c=>c.uid==='set'));
 assert.equal(s.players[0].hand.length,2);
 assert.ok(s.players[0].grave.some(c=>c.uid==='mst'));
 assert.ok(s.players[0].grave.some(c=>c.uid==='pot'));
});
test('opponent cannot activate Quick-Play from hand during rival turn, but may activate old set Quick-Play',()=>{
 let s=game();s.players[0].hand=[ref('pot','55144522')];s.players[0].deck=[ref('one','91152256'),ref('two','48305365')];
 s.players[1].hand=[ref('mst-hand','05318639')];s.players[1].backrow=[back('old-mst','05318639'),back('victim','12607053')];
 s=play(s,'a','spell');
 assert.ok(!legalActions(s,'b').some(a=>a.kind==='spell'&&a.card==='mst-hand'));
 assert.ok(legalActions(s,'b').some(a=>a.kind==='spell'&&a.card==='old-mst'&&a.target==='victim'));
 s=play(s,'b','spell',a=>a.card==='old-mst'&&a.target==='victim');
 assert.equal(s.phase,'main');assert.equal(s.players[1].hand.length,1);assert.equal(s.players[1].backrow.length,0);
});
test('Quick-Play set this turn cannot be activated until a future turn',()=>{
 let s=game();s.players[1].backrow=[back('new-mst','05318639',3),back('set','12607053')];
 s.phase='response';s.pending={kind:'end'};s.priority=1;
 assert.ok(!legalActions(s,'b').some(a=>a.kind==='spell'&&a.card==='new-mst'));
 s.turn++;
 assert.ok(legalActions(s,'b').some(a=>a.kind==='spell'&&a.card==='new-mst'&&a.target==='set'));
});
test('Destroying an already activated Spell with MST does not negate that Spell',()=>{
 let s=game();s.players[0].hand=[ref('pot','55144522')];s.players[0].deck=[ref('one','91152256'),ref('two','48305365')];
 s.players[1].backrow=[back('mst','05318639')];
 s=play(s,'a','spell',a=>a.card==='pot');
 s=play(s,'b','spell',a=>a.card==='mst'&&a.target==='pot');
 assert.equal(s.phase,'main');
 assert.equal(s.players[0].hand.length,2);
 assert.equal(s.players[0].deck.length,0);
 assert.ok(s.players[0].grave.some(c=>c.uid==='pot'));
});
test('Magic Jammer can negate a chained MST with discard cost; original Spell resolves',()=>{
 let s=game();s.players[0].hand=[ref('pot','55144522'),ref('cost','91152256')];
 s.players[0].deck=[ref('one','91152256'),ref('two','48305365')];
 s.players[0].backrow=[back('jam','77414722')];
 s.players[1].backrow=[back('mst','05318639')];
 s=play(s,'a','spell',a=>a.card==='pot');
 s=play(s,'b','spell',a=>a.card==='mst'&&a.target==='pot');
 assert.equal(s.phase,'response');
 assert.ok(legalActions(s,'a').some(a=>a.kind==='trap'&&a.card==='jam'&&a.target==='mst'));
 s=play(s,'a','trap',a=>a.card==='jam'&&a.target==='mst');
 assert.equal(s.phase,'main');
 assert.ok(s.players[0].grave.some(c=>c.uid==='cost'));
 assert.equal(s.players[0].hand.length,2);
 assert.ok(s.players[1].grave.some(c=>c.uid==='mst'));
});
test('MST cannot chain to a Speed 3 counter trap and Seven Tools cannot negate a spell',()=>{
 let s=game();s.phase='response';s.pending={kind:'none'};s.priority=0;
 s.players[0].backrow=[back('mst','05318639'),back('seven','03819470'),back('target','12607053')];
 s.chain=[{actor:1,card:'counter',id:'77414722',target:'pending'}];
 assert.ok(!legalActions(s,'a').some(a=>a.kind==='spell'&&a.card==='mst'));
 s.chain=[{actor:1,card:'quick',id:'05318639',target:'target'}];
 assert.ok(!legalActions(s,'a').some(a=>a.kind==='trap'&&a.card==='seven'));
 assert.ok(legalActions(s,'a').some(a=>a.kind==='spell'&&a.card==='mst'));
});
test('target labels do not reveal enemy set Spell/Trap IDs during Quick-Play selection',()=>{
 let s=game();s.players[0].hand=[ref('mst','05318639')];s.players[1].backrow=[back('secret','03819470')];
 const option=legalActions(s,'a').find(a=>a.kind==='spell'&&a.card==='mst'&&a.target==='secret');assert.ok(option);
 const label=actionLabel(s,'a',option);
 assert.match(label,/virada para baixo/);
 assert.ok(!label.includes('Sete Ferramentas'));assert.ok(!label.includes('03819470'));
});
test('Jinzo stops traps but not an already set Mystical Space Typhoon',()=>{
 let s=game();s.phase='response';s.pending={kind:'end'};s.priority=1;
 s.players[0].monsters=[monster('jinzo','77585513')];
 s.players[1].backrow=[back('mst','05318639'),back('boost','17814387')];
 const options=legalActions(s,'b');
 assert.ok(options.some(a=>a.kind==='spell'&&a.card==='mst'&&a.target==='boost'));
 assert.ok(!options.some(a=>a.kind==='trap'&&a.card==='boost'));
});
