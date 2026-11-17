const {test}=require('node:test'),assert=require('node:assert/strict');
const e=require('../dist/duelEngine'),{starterContents}=require('../dist/cardCatalog');
const ids=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id='91152256')=>({uid,id}),mon=(uid,id='91152256',props={})=>({...ref(uid,id),faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...props});
function game(){const s=e.createDuel([{id:'a',name:'A',cards:ids,extra:['45231177']},{id:'b',name:'B',cards:ids}],()=>.5);s.turn=3;s.players[0].hand=[];s.players[1].hand=[];return s;}
function use(s,who,kind,where=()=>true){const a=e.legalActions(s,who).find(a=>a.kind===kind&&where(a));assert.ok(a,`${who}: ${kind} in ${s.phase}`);return e.step(JSON.parse(JSON.stringify(s)),who,a);}
function pass(s){for(let n=0;s.phase==='response';n++){assert.ok(n<30);s=use(s,s.players[e.decisionPlayer(s)].id,'pass');}return s;}
test('66788016 Fissure chooses among tied current ATK only at resolution and ignores a hidden lower-stat monster',()=>{
 let s=game();s.players[0].hand=[ref('fissure','66788016')];s.players[1].monsters=[mon('one','91152256'),mon('two','91152256'),mon('hidden','34460851',{faceUp:false,position:'def'})];
 const action=e.legalActions(s,'a').find(a=>a.kind==='spell');assert.equal(action.target,undefined);s=use(s,'a','spell');assert.equal(s.phase,'choice');assert.deepEqual(new Set(s.choice.targets),new Set(['one','two']));s=use(s,'a','choose',a=>a.target==='two');assert.equal(s.phase,'main');assert.deepEqual(s.players[1].monsters.map(c=>c.uid),['one','hidden']);assert.equal(s.players[1].grave.filter(c=>c.uid==='two').length,1);
});
test('24094653 Polymerization fizzles after a material leaves in the response chain without consuming other materials or Extra',()=>{
 let s=game();s.players[0].hand=[ref('poly','24094653'),ref('masaki','44287299')];s.players[0].monsters=[mon('manipulator','34460851')];s.players[1].backrow=[{...ref('book','14087893'),setTurn:0,faceUp:false}];
 s=use(s,'a','fusion',a=>a.position==='atk');assert.equal(s.phase,'response');const material=s.players[0].monsters.shift();s.players[0].grave.push(ref(material.uid,material.id));s=pass(s);assert.equal(s.players[0].extra[0].id,'45231177');assert.ok(s.players[0].hand.some(c=>c.uid==='masaki'));assert.ok(!s.players[0].monsters.length);assert.equal(s.players[0].grave.filter(c=>c.uid==='poly').length,1);assert.equal(s.players[0].summoned,false);
});
test('55144522 Pot requires two cards at activation and loses if a chained draw consumes one before resolution',()=>{
 let s=game();s.players[0].hand=[ref('pot','55144522')];s.players[0].deck=[ref('last')];assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='spell'));
 s.players[0].deck.push(ref('bottom','48305365'));s.players[0].backrow=[{...ref('jar','83968380'),setTurn:0,faceUp:false}];s=use(s,'a','spell');s=use(s,'a','trap');s=pass(s);assert.equal(s.phase,'finished');assert.equal(s.winner,'b');assert.ok(s.players[0].hand.some(c=>c.uid==='last'));assert.equal(s.players[0].grave.filter(c=>c.uid==='pot').length,1);
});
test('86318356 Sogen affects both revealed Warriors, not a Spellcaster or hidden monster; destroying Field removes bonuses',()=>{
 let s=game();s.players[0].hand=[ref('field','86318356')];s.players[0].monsters=[mon('own'),mon('mage','34460851')];s.players[1].monsters=[mon('enemy'),mon('hidden','91152256',{faceUp:false,position:'def'})];s=use(s,'a','field');assert.equal(e.atk(s.players[0].monsters[0],s),1600);assert.equal(e.def(s.players[1].monsters[0],s),1400);assert.equal(e.atk(s.players[0].monsters[1],s),900);assert.equal(e.def(s.players[1].monsters[1],s),1200);
 s.players[0].hand=[ref('mst','05318639')];s=pass(use(s,'a','spell',a=>a.target==='field'));assert.equal(s.players[0].field,null);assert.equal(e.atk(s.players[0].monsters[0],s),1400);assert.equal(s.players[0].grave.filter(c=>c.uid==='field').length,1);
});
test('05318639 MST destroys an activated Pot without negating its draw; each physical Spell enters grave only once',()=>{
 let s=game();s.players[0].hand=[ref('pot','55144522')];s.players[1].backrow=[{...ref('mst','05318639'),setTurn:0,faceUp:false}];const deck=s.players[0].deck.length;
 s=use(s,'a','spell');s=use(s,'b','spell',a=>a.target==='pot');s=pass(s);assert.equal(s.players[0].hand.length,2);assert.equal(s.players[0].deck.length,deck-2);assert.equal(s.players[0].grave.filter(c=>c.uid==='pot').length,1);assert.equal(s.players[1].grave.filter(c=>c.uid==='mst').length,1);
});
test('FLIP Portuguese timing agrees with battle calculation before effect activation for all five enabled FLIP cards',()=>{
 const {cardRulesPT}=require('../dist/cardText');for(const id of ['54652250','07089711','31560081','28933734','60694662']){assert.match(cardRulesPT(id),/efeito é ativado após o cálculo de dano/);assert.ok(!cardRulesPT(id).includes('inclusive antes do cálculo'));}
});
