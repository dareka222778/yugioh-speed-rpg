const {test}=require('node:test');const assert=require('node:assert/strict');const {createDuel,step,legalActions,atk,def}=require('../dist/duelEngine');const {starterContents}=require('../dist/cardCatalog');
const ids=style=>starterContents[style].flatMap(c=>Array(c.quantity).fill(c.id));
function game(){return createDuel([{id:'a',name:'A',cards:ids('warrior')},{id:'b',name:'B',cards:ids('spellcaster')}],()=>.5);}
const monster=(uid,id='91152256',extra={})=>({uid,id,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...extra});
function use(s,actor,kind,predicate=()=>true){const a=legalActions(s,actor).find(a=>a.kind===kind&&predicate(a));assert.ok(a,`missing ${kind} for ${actor} in ${s.phase}`);return step(s,actor,a);}
test('four opening cards, 4000 LP, no first draw/battle, second player draws, immutable state and out-of-turn rejection',()=>{
 const s=game(),copy=structuredClone(s);assert.equal(s.players[0].lp,4000);assert.equal(s.players[0].hand.length,4);assert.equal(s.players[0].deck.length,16);assert.ok(!legalActions(s,'a').some(a=>a.kind==='battle'));assert.deepEqual(legalActions(s,'b'),[]);
 assert.throws(()=>step(s,'b',{kind:'end'}),/inválida/);const next=step(s,'a',{kind:'end'});assert.equal(next.turn,2);assert.equal(next.players[1].hand.length,5);assert.deepEqual(s,copy);
});
test('normal/set summon once, correct tribute options, three zones, no forged tributes, set monster cannot flip same turn',()=>{
 let s=game();s.players[0].hand=[{uid:'hand',id:'28546905'}];assert.ok(!legalActions(s,'a').some(a=>a.kind==='summon'));
 s.players[0].monsters=[monster('tribute')];assert.ok(legalActions(s,'a').some(a=>a.kind==='summon'&&a.tributes[0]==='tribute'));assert.throws(()=>step(s,'a',{kind:'summon',card:'hand',position:'atk',tributes:[]}),/inválida/);
 s=use(s,'a','summon',a=>a.position==='set');assert.equal(s.players[0].grave[0].uid,'tribute');assert.equal(s.players[0].monsters[0].faceUp,false);assert.ok(!legalActions(s,'a').some(a=>a.kind==='position'||a.kind==='summon'));
 s=game();s.players[0].monsters=[monster('x'),monster('y'),monster('z')];s.players[0].hand=[{uid:'hand',id:'91152256'}];assert.ok(!legalActions(s,'a').some(a=>a.kind==='summon'));
});
test('setting backrow preserves other hand cards, full backrow blocks hand spells, set spells may activate same turn',()=>{
 let s=game();s.players[0].hand=[{uid:'heal',id:'38199696'},{uid:'other',id:'91152256'}];s=use(s,'a','set');assert.deepEqual(s.players[0].hand.map(c=>c.uid),['other']);assert.equal(s.players[0].backrow.length,1);
 s=use(s,'a','spell');assert.equal(s.players[0].lp,4500);assert.equal(s.players[0].grave[0].id,'38199696');
 s=game();s.players[0].backrow=[0,1,2].map(n=>({uid:`b${n}`,id:'17814387',setTurn:1,faceUp:false}));s.players[0].hand=[{uid:'heal',id:'38199696'}];assert.ok(!legalActions(s,'a').some(a=>a.kind==='spell'||a.kind==='set'));
});
test('battle resolves ATK, equal ATK, zero ATK, DEF and direct attacks with correct LP and destruction',()=>{
 for(const [attack,defense,position,remainingA,remainingB,lpA,lpB]of [[1700,1400,'atk',1,0,4000,3700],[1400,1700,'atk',0,1,3700,4000],[1400,1400,'atk',0,0,4000,4000],[0,0,'atk',1,1,4000,4000],[1400,1200,'def',1,0,4000,4000],[1400,2000,'def',1,1,3400,4000]]){
  let s=game();s.turn=3;s.phase='battle';s.players[0].monsters=[monster('attacker','91152256',{atkBoost:attack-1400})];s.players[1].monsters=[monster('defender','15025844',{position,atkBoost:defense-800,defBoost:defense-2000})];
  s=use(s,'a','attack');assert.equal(s.players[0].monsters.length,remainingA);assert.equal(s.players[1].monsters.length,remainingB);assert.equal(s.players[0].lp,lpA);assert.equal(s.players[1].lp,lpB);
 }
 let s=game();s.turn=3;s.phase='battle';s.players[0].monsters=[monster('attacker')];s.players[1].lp=1000;s=use(s,'a','attack');assert.equal(s.phase,'finished');assert.equal(s.winner,'a');assert.equal(s.players[1].lp,0);
});
test('one attack per monster, position restrictions, no Main Phase 2',()=>{
 let s=game();s.turn=3;s.phase='battle';s.players[0].monsters=[monster('attacker')];s=use(s,'a','attack');assert.ok(!legalActions(s,'a').some(a=>a.kind==='attack'||a.kind==='summon'||a.kind==='position'));
 s=game();s.turn=3;s.players[0].monsters=[monster('old')];s=use(s,'a','position');assert.equal(s.players[0].monsters[0].position,'def');assert.ok(!legalActions(s,'a').some(a=>a.kind==='position'));
});
test('traps wait a turn, chain alternating priority, buffs expire and damage window reveals set defender before response',()=>{
 let s=game();s.turn=3;s.phase='battle';s.players[0].monsters=[monster('attacker')];s.players[1].monsters=[monster('defender','15025844',{position:'def',faceUp:false})];
 s.players[1].backrow=[{uid:'wall',id:'44209392',setTurn:2,faceUp:false}];
 s=use(s,'a','attack');assert.equal(s.phase,'response'); // declaration may target attacker's face-up monster
 s=use(s,'b','pass');assert.equal(s.phase,'response');assert.equal(s.players[1].monsters[0].faceUp,true);
 s=use(s,'b','trap',a=>a.target==='defender');assert.equal(s.phase,'battle');assert.equal(def(s.players[1].monsters[0]),2500);assert.equal(s.players[0].lp,2900);assert.equal(s.players[1].grave[0].id,'44209392');
 s=use(s,'a','end');assert.equal(s.turn,4);assert.equal(def(s.players[1].monsters[0]),2000);
 const setNow=game();setNow.players[0].monsters=[monster('face')];setNow.players[0].backrow=[{uid:'trap',id:'17814387',setTurn:1,faceUp:false}];assert.ok(!legalActions(setNow,'a').some(a=>a.kind==='trap'));
});
test('Fissure ignores face-down monsters, chooses ties at resolution, reacts to attack boosts in its chain',()=>{
 let s=game();s.turn=3;s.players[0].hand=[{uid:'fissure',id:'66788016'}];s.players[1].monsters=[monster('low','91152256',{atkBoost:-1000}),monster('hidden','91152256',{faceUp:false}),monster('high','91152256')];s=use(s,'a','spell');assert.ok(!s.players[1].monsters.some(m=>m.uid==='low'));assert.ok(s.players[1].monsters.some(m=>m.uid==='hidden'));
 s=game();s.turn=3;s.players[0].hand=[{uid:'fissure',id:'66788016'}];s.players[1].monsters=[monster('one'),monster('two')];s=use(s,'a','spell');assert.equal(s.phase,'choice');s=use(s,'a','choose',a=>a.target==='two');assert.equal(s.players[1].monsters[0].uid,'one');
 s=game();s.turn=3;s.players[0].hand=[{uid:'fissure',id:'66788016'}];s.players[1].monsters=[monster('low','91152256',{atkBoost:-100}),monster('high')];s.players[1].backrow=[{uid:'boost',id:'17814387',setTurn:1,faceUp:false}];
 s=use(s,'a','spell');s=use(s,'b','trap',a=>a.target==='low');assert.equal(s.phase,'main');assert.equal(s.players[1].monsters[0].uid,'low');assert.equal(atk(s.players[1].monsters[0]),1800);
});
test('hand size discard, deck-out, surrender and strangers',()=>{
 let s=game();s.players[0].hand=Array.from({length:8},(_,n)=>({uid:'h'+n,id:'91152256'}));s=use(s,'a','end');assert.equal(s.phase,'discard');s=use(s,'a','discard');s=use(s,'a','discard');assert.equal(s.turn,2);assert.equal(s.players[0].hand.length,6);
 s=game();s.players[1].deck=[];s=use(s,'a','end');assert.equal(s.winner,'a');assert.match(s.reason,/comprar/);assert.throws(()=>step(s,'a',{kind:'concede'}),/terminou/);
 assert.equal(step(game(),'b',{kind:'concede'}).winner,'a');assert.throws(()=>step(game(),'stranger',{kind:'concede'}),/participa/);
});
test('complete simulated games conserve every card UID through 100 deterministic seeds',()=>{
 for(let seed=1;seed<=100;seed++){let n=seed;const rng=()=>((n=(n*1664525+1013904223)>>>0)/2**32);let s=createDuel([{id:'a',name:'A',cards:ids('warrior')},{id:'b',name:'B',cards:ids('dragon')}],rng,seed%2);let moves=0;
  while(s.phase!=='finished'&&moves++<2000){const actor=s.phase==='response'?s.players[s.priority].id:s.phase==='choice'?s.players[s.choice.actor].id:s.players[s.current].id;const legal=legalActions(s,actor);assert.ok(legal.length);s=step(s,actor,legal[Math.floor(rng()*legal.length)]);
   for(const p of s.players){const all=[...p.deck,...p.hand,...p.monsters,...p.backrow,...p.grave];assert.equal(all.length,20);assert.equal(new Set(all.map(c=>c.uid)).size,20);assert.ok(p.monsters.length<=3&&p.backrow.length<=3);assert.ok(p.lp>=0);}
  }assert.equal(s.phase,'finished',`seed ${seed} stalled`);
 }
});
test('production shuffle uses cryptographic draws, preserves every unique card and does not change on views',()=>{
 const input=[{id:'a',name:'A',cards:ids('warrior')},{id:'b',name:'B',cards:ids('spellcaster')}];
 const orders=new Set();for(let n=0;n<40;n++){const s=createDuel(input);for(const [i,p] of s.players.entries()){const all=[...p.hand,...p.deck];assert.equal(new Set(all.map(c=>c.uid)).size,20);assert.deepEqual(all.map(c=>c.id).sort(),[...input[i].cards].sort());}orders.add(s.players[0].hand.map(c=>c.uid).join(','));const before=JSON.stringify(s.players[0].deck);legalActions(s,'a');assert.equal(JSON.stringify(s.players[0].deck),before);}assert.ok(orders.size>1);
});
