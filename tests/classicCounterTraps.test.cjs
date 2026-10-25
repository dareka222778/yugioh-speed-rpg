const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDuel,legalActions,step,actionLabel}=require('../dist/duelEngine');
const {starterContents}=require('../dist/cardCatalog');
const basic=starterContents.warrior.flatMap(x=>Array(x.quantity).fill(x.id));
const m=(uid,id='91152256',options={})=>({uid,id,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...options});
const trap=(uid,id)=>({uid,id,setTurn:1,faceUp:false});
const ref=(uid,id)=>({uid,id});
function game(){const s=createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);s.turn=3;return s;}
function act(s,actor,kind,filter=()=>true){
 const a=legalActions(s,actor).find(a=>a.kind===kind&&filter(a));
 assert.ok(a,`Expected ${kind} for ${actor} in ${s.phase}: ${JSON.stringify(legalActions(s,actor))}`);
 return step(s,actor,a);
}
test('counter-trap metadata are enabled and use official discard/LP costs',()=>{
 const {getCard}=require('../dist/collection'),{getEffect,enabledCardIds}=require('../dist/effectRegistry');
 for(const [id,kind]of [['77414722','magicJammer'],['03819470','sevenTools']]){
  assert.equal(getCard(id).kind,'trap');
  assert.equal(getEffect(id).kind,kind);assert.ok(enabledCardIds.includes(id));
 }
});
test('Magic Jammer negates an activated Spell, destroys it and pays discard on activation',()=>{
 let s=game();
 s.players[0].hand=[ref('burn','19523799')];
 s.players[1].hand=[ref('discard','91152256'),ref('keep','48305365')];
 s.players[1].backrow=[trap('jam','77414722')];
 s=act(s,'a','spell',a=>a.card==='burn');
 assert.equal(s.phase,'response');assert.equal(s.players[1].lp,4000);
 const jammer=legalActions(s,'b').find(a=>a.kind==='trap'&&a.card==='jam'&&a.discards?.[0]==='discard');
 assert.ok(jammer);assert.equal(jammer.target,'burn');
 assert.match(actionLabel(s,'b',jammer),/Descartar/);
 s=step(s,'b',jammer);
 assert.equal(s.phase,'main');assert.equal(s.players[1].lp,4000);
 assert.deepEqual(s.players[1].hand.map(c=>c.uid),['keep']);
 assert.ok(s.players[1].grave.some(c=>c.uid==='discard'));
 assert.ok(s.players[1].grave.some(c=>c.uid==='jam'));
 assert.ok(s.players[0].grave.some(c=>c.uid==='burn'));
 assert.equal(s.players[0].backrow.length,0);
});
test('Magic Jammer cannot activate without a card to discard or in response to monster effects',()=>{
 let s=game();s.players[0].hand=[ref('burn','19523799')];s.players[1].hand=[];s.players[1].backrow=[trap('jam','77414722')];
 s=act(s,'a','spell');
 assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='jam'));
 assert.throws(()=>step(s,'b',{kind:'trap',card:'jam',target:'burn',discards:['fake']}),/inválida/);
 s=game();s.players[0].monsters=[m('cannon','11384280')];
 s.players[1].hand=[ref('fodder','91152256')];s.players[1].backrow=[trap('jam','77414722')];
 s.players[1].monsters=[m('target','91152256',{owner:1})];s.players[1].backrow.push(trap('boost','17814387'));
 s=act(s,'a','monsterEffect',a=>a.tributes?.[0]==='cannon');
 assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='jam'));
});
test('Seven Tools negates the latest activated Trap and pays 1000 LP before resolving',()=>{
 let s=game();s.phase='battle';s.players[0].monsters=[m('attacker')];
 s.players[0].backrow=[trap('seven','03819470')];s.players[1].backrow=[trap('waboku','12607053')];
 s=act(s,'a','attack');
 s=act(s,'b','trap',a=>a.card==='waboku');
 assert.equal(s.phase,'response');assert.equal(s.priority,0);
 const counter=legalActions(s,'a').find(a=>a.kind==='trap'&&a.card==='seven');
 assert.ok(counter);assert.equal(counter.target,'waboku');
 s=step(s,'a',counter);
 assert.equal(s.players[0].lp,3000);
 assert.equal(s.players[1].lp,2600);
 assert.ok(!s.players[1].battleProtectedUntil);
 assert.ok(s.players[0].grave.some(c=>c.uid==='seven'));assert.ok(s.players[1].grave.some(c=>c.uid==='waboku'));
});
test('counter of a counter: Seven Tools negates Magic Jammer so the original Spell still resolves',()=>{
 let s=game();s.players[0].hand=[ref('burn','19523799')];
 s.players[0].backrow=[trap('seven','03819470')];
 s.players[1].hand=[ref('cost','91152256')];s.players[1].backrow=[trap('jam','77414722')];
 s=act(s,'a','spell',a=>a.card==='burn');s=act(s,'b','trap',a=>a.card==='jam');
 assert.equal(s.players[1].hand.length,0);
 assert.ok(!legalActions(s,'a').some(a=>a.kind==='trap'&&a.card==='seven'&&a.target!=='jam'));
 s=act(s,'a','trap',a=>a.card==='seven');
 assert.equal(s.players[0].lp,3000);
 assert.equal(s.players[1].lp,3200);
 assert.ok(s.players[1].grave.some(c=>c.uid==='cost'));
 assert.ok(s.players[1].grave.some(c=>c.uid==='jam'));
 assert.ok(s.players[0].grave.some(c=>c.uid==='burn'));
});
test('ordinary traps cannot answer counter traps at Spell Speed 2',()=>{
 let s=game();s.players[0].hand=[ref('burn','19523799')];s.players[0].backrow=[trap('boost','17814387'),trap('seven','03819470')];s.players[0].monsters=[m('own')];
 s.players[1].hand=[ref('cost','91152256')];s.players[1].backrow=[trap('jam','77414722')];
 s=act(s,'a','spell');s=act(s,'b','trap',a=>a.card==='jam');
 assert.ok(!legalActions(s,'a').some(a=>a.kind==='trap'&&a.card==='boost'));
 s=act(s,'a','pass');assert.equal(s.players[1].lp,4000);
});
test('Seven Tools requires more than 1000 LP to pay its cost',()=>{
 let s=game();s.phase='response';s.pending={kind:'attack',actor:0,card:'attacker',stage:'declare'};
 s.players[0].monsters=[m('attacker')];s.players[0].backrow=[trap('seven','03819470')];
 s.players[1].backrow=[{...trap('waboku','12607053'),faceUp:true}];
 s.chain=[{actor:1,card:'waboku',id:'12607053',target:''}];s.priority=0;
 s.players[0].lp=1000;
 assert.ok(!legalActions(s,'a').some(a=>a.kind==='trap'&&a.card==='seven'));
 s.players[0].lp=1001;
 assert.ok(legalActions(s,'a').some(a=>a.kind==='trap'&&a.card==='seven'));
});
test('Magic Jammer also negates a Field Spell before its persistent bonus activates',()=>{
 let s=game();s.players[0].hand=[ref('field','86318356')];s.players[0].monsters=[m('warrior')];
 s.players[1].backrow=[trap('jam','77414722')];s.players[1].hand=[ref('cost','91152256')];
 s=act(s,'a','field');
 assert.equal(s.phase,'response');s=act(s,'b','trap',a=>a.card==='jam');
 assert.equal(s.players[0].field,null);
 assert.ok(s.players[0].grave.some(c=>c.uid==='field'));
 assert.equal(s.players[0].monsters[0].atkBoost,0);
});
test('Jinzo suppresses both counter-trap activation and effect resolution',()=>{
 let s=game();s.players[0].hand=[ref('burn','19523799')];
 s.players[1].hand=[ref('cost','91152256')];s.players[1].backrow=[trap('jam','77414722')];
 s.players[0].monsters=[m('jinzo','77585513')];
 s=act(s,'a','spell');
 assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='jam'));
 assert.equal(s.players[1].lp,3200);
});

test('four-link counter-trap chain resolves LIFO: Seven Tools can negate Seven Tools',()=>{
 let s=game();s.players[0].hand=[ref('burn','19523799')];
 s.players[0].backrow=[trap('seven-a','03819470')];
 s.players[1].hand=[ref('cost','91152256')];
 s.players[1].backrow=[trap('jam','77414722'),trap('seven-b','03819470')];
 s=act(s,'a','spell',a=>a.card==='burn');
 s=act(s,'b','trap',a=>a.card==='jam');
 s=act(s,'a','trap',a=>a.card==='seven-a');
 assert.equal(s.phase,'response');assert.equal(s.priority,1);
 s=act(s,'b','trap',a=>a.card==='seven-b');
 assert.equal(s.phase,'main');
 assert.equal(s.players[0].lp,3000);assert.equal(s.players[1].lp,3000);
 assert.ok(s.players[0].grave.some(c=>c.uid==='burn'));
 assert.ok(s.players[1].grave.some(c=>c.uid==='cost'));
 assert.ok(s.players[0].grave.some(c=>c.uid==='seven-a'));
 assert.ok(s.players[1].grave.some(c=>c.uid==='seven-b'));
 assert.ok(s.players[1].grave.some(c=>c.uid==='jam'));
});
test('Seven Tools negates Trap Hole before the summoned monster is destroyed',()=>{
 let s=game();s.players[0].hand=[ref('summoned','91152256')];
 s.players[0].backrow=[trap('seven','03819470')];
 s.players[1].backrow=[trap('hole','04206964')];
 s=act(s,'a','summon',a=>a.position==='atk'&&a.card==='summoned');
 s=act(s,'b','trap',a=>a.card==='hole');
 s=act(s,'a','trap',a=>a.card==='seven');
 assert.equal(s.players[0].lp,3000);assert.equal(s.phase,'main');
 assert.ok(s.players[0].monsters.some(m=>m.uid==='summoned'));
 assert.ok(!s.players[0].grave.some(c=>c.uid==='summoned'));
});
