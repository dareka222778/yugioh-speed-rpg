const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDuel,legalActions,step}=require('../dist/duelEngine');
const {getCard}=require('../dist/collection');
const {getEffect,isQuickPlaySpell}=require('../dist/effectRegistry');
const {starterContents}=require('../dist/cardCatalog');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id)=>({uid,id});
const back=(uid,id,turn=1)=>({...ref(uid,id),faceUp:false,setTurn:turn});
const monster=(uid,id='91152256',owner=0,faceUp=true)=>({...ref(uid,id),faceUp,owner,position:faceUp?'atk':'def',entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0});
function game(){let s=createDuel([{id:'a',name:'Alice',cards:basic},{id:'b',name:'Bob',cards:basic}],()=>0.5);s.turn=3;return s;}
function act(s,actor,kind,pred=()=>true){
 const options=legalActions(s,actor),a=options.find(a=>a.kind===kind&&pred(a));
 assert.ok(a,`Missing ${kind} for ${actor} during ${s.phase}: ${JSON.stringify(options)}`);
 return step(s,actor,a);
}
test('Livro da Lua and Tributo Torrencial are audited executable Quick-Play/Normal Trap cards',()=>{
 for(const [id,kind]of [['14087893','bookOfMoon'],['53582587','torrentialTribute']]){
  assert.equal(getEffect(id).kind,kind);assert.ok(getCard(id));
 }
 assert.equal(isQuickPlaySpell('14087893'),true);
 assert.equal(isQuickPlaySpell('05318639'),true);
 assert.equal(isQuickPlaySpell('53582587'),false);
});
test('Book of Moon targets either face-up monster and never triggers a FLIP effect by setting it',()=>{
 let s=game();s.players[0].hand=[ref('book','14087893')];
 s.players[1].monsters=[monster('flip','60694662',1)];
 const options=legalActions(s,'a').filter(a=>a.kind==='spell'&&a.card==='book');
 assert.deepEqual(options.map(a=>a.target),['flip']);
 s=act(s,'a','spell',a=>a.card==='book'&&a.target==='flip');
 assert.equal(s.players[1].monsters[0].faceUp,false);
 assert.equal(s.players[1].monsters[0].position,'def');
 assert.equal(s.players[1].hand.length,4,'Book of Moon is not a Flip Summon');
 assert.ok(s.players[0].grave.some(c=>c.uid==='book'));
});
test('Quick-Play Spells set this turn cannot activate, even during own main phase',()=>{
 let s=game();s.players[0].monsters=[monster('target')];
 s.players[0].backrow=[back('book','14087893',3),back('mst','05318639',3)];
 s.players[1].backrow=[back('victim','12607053',1)];
 assert.equal(legalActions(s,'a').some(a=>a.kind==='spell'&&['book','mst'].includes(a.card)),false);
 s.turn=4;s.players[0].summoned=false;
 assert.ok(legalActions(s,'a').some(a=>a.kind==='spell'&&a.card==='book'&&a.target==='target'));
 assert.ok(legalActions(s,'a').some(a=>a.kind==='spell'&&a.card==='mst'&&a.target==='victim'));
});
test('Book of Moon can chain from a previously Set card on opponent turn',()=>{
 let s=game();s.players[0].hand=[ref('pot','55144522')];
 s.players[0].deck=[ref('a1','91152256'),ref('a2','48305365')];
 s.players[0].monsters=[monster('target')];s.players[1].backrow=[back('book','14087893')];
 s=act(s,'a','spell',a=>a.card==='pot');
 assert.ok(legalActions(s,'b').some(a=>a.kind==='spell'&&a.card==='book'&&a.target==='target'));
 s=act(s,'b','spell',a=>a.card==='book'&&a.target==='target');
 assert.equal(s.players[0].monsters[0].faceUp,false);
 assert.equal(s.players[0].hand.length,2,'Pot of Greed must still resolve after Book');
 assert.ok(s.players[1].grave.some(c=>c.uid==='book'));
});
test('Magic Jammer negates a Book of Moon chain while keeping discard as a paid cost',()=>{
 let s=game();s.players[0].hand=[ref('book','14087893')];s.players[0].monsters=[monster('target')];
 s.players[1].hand=[ref('cost','91152256')];s.players[1].backrow=[back('jam','77414722')];
 s=act(s,'a','spell',a=>a.card==='book');
 s=act(s,'b','trap',a=>a.card==='jam');
 assert.equal(s.players[0].monsters[0].faceUp,true);
 assert.ok(s.players[1].grave.some(c=>c.uid==='cost'));
 assert.ok(s.players[0].grave.some(c=>c.uid==='book'));
});
test('Book of Moon chained to Trap Hole protects the newly Summoned target',()=>{
 let s=game();s.players[0].hand=[ref('summon','91152256'),ref('book','14087893')];
 s.players[1].backrow=[back('hole','04206964')];
 s=act(s,'a','summon',a=>a.card==='summon'&&a.position==='atk');
 assert.ok(legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='hole'));
 s=act(s,'b','trap',a=>a.card==='hole');
 s=act(s,'a','spell',a=>a.card==='book'&&a.target==='summon');
 assert.equal(s.players[0].monsters.length,1);
 assert.equal(s.players[0].monsters[0].faceUp,false);
 assert.ok(s.players[1].grave.some(c=>c.uid==='hole'));
});
test('Torrential Tribute is legal on either player Normal Summon but not an arbitrary main phase',()=>{
 let s=game();s.players[0].hand=[ref('summon','91152256')];
 s.players[1].backrow=[back('torrent','53582587')];
 assert.ok(!legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='torrent'));
 s=act(s,'a','summon',a=>a.card==='summon');
 assert.ok(legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='torrent'));
 s=act(s,'b','trap',a=>a.card==='torrent');
 assert.equal(s.players[0].monsters.length,0);
 assert.ok(s.players[0].grave.some(c=>c.uid==='summon'));
 assert.ok(s.players[1].grave.some(c=>c.uid==='torrent'));
});
test('Torrential Tribute destroys both fields, including Set monsters',()=>{
 let s=game();s.players[0].hand=[ref('summon','91152256')];
 s.players[0].monsters=[monster('own-faceup'),monster('own-hidden','15025844',0,false)];
 s.players[1].monsters=[monster('op-monster','15025844',1,false)];
 s.players[1].backrow=[back('torrent','53582587')];
 s=act(s,'a','summon',a=>a.card==='summon');
 s=act(s,'b','trap');
 assert.equal(s.players[0].monsters.length,0);assert.equal(s.players[1].monsters.length,0);
 assert.deepEqual(new Set(s.players[0].grave.map(c=>c.uid)),new Set(['summon','own-faceup','own-hidden']));
 assert.ok(s.players[1].grave.some(c=>c.uid==='op-monster'));
});
test('Set monsters do not open a Torrential summon window',()=>{
 let s=game();s.players[0].hand=[ref('set','91152256')];s.players[1].backrow=[back('torrent','53582587')];
 s=act(s,'a','summon',a=>a.card==='set'&&a.position==='set');
 assert.equal(s.players[0].monsters[0].faceUp,false);
 assert.equal(s.players[1].grave.some(c=>c.uid==='torrent'),false);
});
test('Torrential Tribute activates on Flip Summon and a FLIP draw survives source destruction',()=>{
 let s=game();s.players[0].monsters=[monster('skelengel','60694662',0,false)];
 s.players[0].deck=[ref('draw','91152256')];
 s.players[1].backrow=[back('torrent','53582587')];
 s=act(s,'a','position',a=>a.card==='skelengel'&&a.mode==='flip');
 assert.ok(legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='torrent'));
 s=act(s,'b','trap');
 assert.ok(s.players[0].grave.some(c=>c.uid==='skelengel'));
 assert.ok(s.players[0].hand.some(c=>c.uid==='draw'),'Skelengel still resolves FLIP after it is destroyed');
});
test('Torrential Tribute activates on Monster Reborn Special Summon',()=>{
 let s=game();s.players[0].hand=[ref('reborn','83764718')];
 s.players[0].grave=[ref('revived','91152256')];s.players[1].backrow=[back('torrent','53582587')];
 s=act(s,'a','spell',a=>a.card==='reborn'&&a.target==='revived');
 assert.equal(s.phase,'response');assert.equal(s.pending.kind,'specialSummon');
 s=act(s,'b','trap',a=>a.card==='torrent');
 assert.equal(s.players[0].monsters.length,0);
 assert.ok(s.players[0].grave.some(c=>c.uid==='revived'));
});
test('Torrential Tribute activation can be negated by Seven Tools; the newly Summoned monster survives',()=>{
 let s=game();s.players[0].hand=[ref('summon','91152256')];
 s.players[0].backrow=[back('seven','03819470')];s.players[1].backrow=[back('torrent','53582587')];
 s=act(s,'a','summon',a=>a.card==='summon');
 s=act(s,'b','trap',a=>a.card==='torrent');
 s=act(s,'a','trap',a=>a.card==='seven');
 assert.equal(s.players[0].monsters.length,1);
 assert.equal(s.players[0].lp,3000);
 assert.ok(s.players[1].grave.some(c=>c.uid==='torrent'));
});
test('Both Quick-Play Spells are barred from Damage Step and Counter Trap chains',()=>{
 let s=game();s.players[0].monsters=[monster('target')];s.players[0].hand=[ref('book','14087893'),ref('mst','05318639')];
 s.players[1].backrow=[back('victim','12607053')];
 s.phase='response';s.pending={kind:'attack',actor:0,card:'target',stage:'damage'};s.priority=0;
 assert.ok(!legalActions(s,'a').some(a=>a.kind==='spell'&&['book','mst'].includes(a.card)));
 s.pending={kind:'none'};s.chain=[{actor:1,card:'jam',id:'77414722',target:'foo'}];
 assert.ok(!legalActions(s,'a').some(a=>a.kind==='spell'));
});
