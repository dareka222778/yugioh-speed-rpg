const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDuel,step,legalActions}=require('../dist/duelEngine');
const {starterContents}=require('../dist/cardCatalog');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const monster=(uid,id='77585513',options={})=>({uid,id,owner:0,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...options});
const card=(uid,id)=>({uid,id});
const trap=(uid='trap',id='17814387')=>({uid,id,setTurn:1,faceUp:false});
function game(){const s=createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);s.turn=3;return s;}
function use(s,actor,kind,predicate=()=>true){const a=legalActions(s,actor).find(a=>a.kind===kind&&predicate(a));assert.ok(a,`Missing ${kind}: ${JSON.stringify(legalActions(s,actor))}`);return step(s,actor,a);}
test('Jinzo has official stats, one Tribute requirement and a registered continuous trap lock',()=>{
 const {getCard}=require('../dist/collection'),{getMonsterEffect}=require('../dist/monsterEffects');
 const c=getCard('77585513');assert.equal(c.atk,2400);assert.equal(c.defense,1500);assert.equal(c.level,6);
 assert.deepEqual(getMonsterEffect('77585513'),{trigger:'continuous',operation:{kind:'negateTraps'}});
 let s=game();s.players[0].hand=[card('jinzo','77585513')];
 s.players[0].monsters=[monster('tribute','91152256')];
 const summon=legalActions(s,'a').find(a=>a.kind==='summon'&&a.card==='jinzo'&&a.position==='atk');
 assert.ok(summon);assert.deepEqual(summon.tributes,['tribute']);
 s.players[1].backrow=[trap('hole','04206964')];
 s=use(s,'a','summon',a=>a.card==='jinzo'&&a.position==='atk');
 assert.equal(s.phase,'main');assert.equal(s.players[1].backrow.length,1);
 assert.ok(s.players[0].monsters.some(m=>m.id==='77585513'));
});
test('face-up Jinzo prevents either player from activating Trap cards during response',()=>{
 let s=game();s.players[0].monsters=[monster('jinzo'),monster('own','91152256')];
 s.players[1].monsters=[monster('other','91152256',{owner:1})];
 s.players[0].backrow=[trap('own-trap')];s.players[1].backrow=[trap('other-trap')];
 s.phase='response';s.pending={kind:'end'};s.priority=1;
 assert.deepEqual(legalActions(s,'b'),[{kind:'pass'}]);
 s.priority=0;
 assert.deepEqual(legalActions(s,'a'),[{kind:'pass'}]);
});
test('face-down Jinzo does not suppress Traps; flipping face-up turns the lock on immediately',()=>{
 let s=game();s.players[0].monsters=[monster('jinzo','77585513',{faceUp:false,position:'def'}),monster('own','91152256')];
 s.players[1].backrow=[trap('other-trap')];
 s.phase='response';s.pending={kind:'end'};s.priority=1;
 assert.ok(legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='other-trap'));
 s.players[0].monsters[0].faceUp=true;
 assert.deepEqual(legalActions(s,'b'),[{kind:'pass'}]);
});
test('already-activated Trap effect resolves negated while Jinzo is face-up and still goes to Graveyard',()=>{
 let s=game();s.players[0].monsters=[monster('jinzo'),monster('target','91152256')];
 s.players[1].backrow=[{...trap('boost'),faceUp:true}];
 s.phase='response';s.resume='main';s.priority=1;s.passes=1;s.pending={kind:'none'};
 s.chain=[{actor:1,card:'boost',id:'17814387',target:'target'}];
 s=use(s,'b','pass');
 assert.equal(s.phase,'main');
 assert.equal(s.players[0].monsters.find(m=>m.uid==='target').atkBoost,0);
 assert.ok(s.players[1].grave.some(c=>c.uid==='boost'));
 assert.ok(s.log.some(line=>line.includes('Jinzo negou')));
});
test('Trap activations resume after Jinzo leaves the field',()=>{
 let s=game();s.players[0].monsters=[monster('jinzo')];
 s.players[1].monsters=[monster('target','91152256',{owner:1})];
 s.players[1].backrow=[trap('boost')];
 s.players[0].hand=[card('hole','53129443')];
 s=use(s,'a','spell',a=>a.card==='hole');
 assert.equal(s.players[0].monsters.length,0);
 assert.equal(s.phase,'main');
 // A response window with a valid monster target must show the Trap again.
 s.players[1].monsters=[monster('target2','91152256',{owner:1})];
 s.phase='response';s.pending={kind:'end'};s.priority=1;
 assert.ok(legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='boost'));
});
