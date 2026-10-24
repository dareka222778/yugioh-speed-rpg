const {test}=require('node:test'),assert=require('node:assert/strict');
const e=require('../dist/duelEngine'),{starterContents}=require('../dist/cardCatalog');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id)=>({uid,id});
const m=(uid,id='91152256',owner=0)=>({...ref(uid,id),owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const back=(uid,id,faceUp=false)=>({...ref(uid,id),setTurn:1,faceUp});
function game(){let s=e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);s.turn=3;return s;}
function use(s,who,kind,test=()=>true){const a=e.legalActions(s,who).find(a=>a.kind===kind&&test(a));assert.ok(a,`${who} lacks ${kind} in ${s.phase}`);return e.step(s,who,a);}
function pass(s){let n=0;while(s.phase==='response'){s=use(s,s.players[e.decisionPlayer(s)].id,'pass');assert.ok(++n<20);}return s;}

test('Seven Tools cannot negate Book of Moon or any other Spell link',()=>{
 for(const id of ['14087893','05318639']){let s=game();s.phase='response';s.priority=0;s.pending={kind:'end'};s.players[0].monsters=[m('target')];s.players[0].backrow=[back('seven','03819470')];s.players[1].backrow=[back('quick',id,true)];s.chain=[{actor:1,card:'quick',id,target:'target'}];assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='trap'&&a.card==='seven'));}
});
test('own Quick-Play activation between attacks preserves the Battle Phase',()=>{
 let s=game();s.phase='battle';s.players[0].monsters=[m('own')];s.players[1].monsters=[m('rival','91152256',1)];s.players[0].hand=[ref('book','14087893'),ref('normal','48305365')];
 s=pass(use(s,'a','spell',a=>a.card==='book'&&a.target==='rival'));assert.equal(s.phase,'battle');assert.equal(s.players[1].monsters[0].faceUp,false);assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='summon'));
});
test('previously set Quick-Play is usable during the own Battle Phase, but a fresh set is not',()=>{
 let s=game();s.phase='battle';s.players[1].monsters=[m('rival','91152256',1)];s.players[0].backrow=[back('old','14087893'),{...back('fresh','14087893'),setTurn:3}];const actions=e.legalActions(s,'a');assert.ok(actions.some(a=>a.kind==='spell'&&a.card==='old'));assert.ok(!actions.some(a=>a.kind==='spell'&&a.card==='fresh'));
});
test('Book of Moon clears temporary stat/effect modifiers without consuming a manual position change',()=>{
 let s=game();const target=m('own');target.atkBoost=500;target.defBoost=500;target.swappedUntil=3;target.effectUsedTurn=3;target.returnTo=1;target.returnTurn=3;s.players[0].monsters=[target];s.players[0].hand=[ref('book','14087893')];
 s=pass(use(s,'a','spell'));const out=s.players[0].monsters[0];assert.equal(out.atkBoost,0);assert.equal(out.defBoost,0);assert.equal(out.swappedUntil,undefined);assert.equal(out.effectUsedTurn,undefined);assert.equal(out.changed,0);assert.equal(out.returnTo,1);assert.ok(e.legalActions(s,'a').some(a=>a.kind==='position'&&a.mode==='flip'));
 s=pass(use(s,'a','position',a=>a.mode==='flip'));assert.equal(e.atk(s.players[0].monsters[0],s),1400);
});
test('Book of Moon still preserves earlier summon, attack and manual-position restrictions',()=>{
 for(const key of ['entered','attacked','changed']){let s=game();const target=m('own');target[key]=3;s.players[0].monsters=[target];s.players[0].hand=[ref('book','14087893')];s=pass(use(s,'a','spell'));assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='position'));}
});
test('end-of-turn grave triggers finish in the old turn before draw and next-turn restrictions',()=>{
 let s=game();s.players[0].hand=[];s.players[1].hand=[];s.players[0].monsters=[{...m('borrowed','26202165',1),returnTo:1,returnTurn:3}];s.players[1].monsters=[1,2,3].map(i=>m('full'+i,'91152256',1));s.players[1].deck=[ref('search-a','91152256'),ref('search-b','15025844'),ref('draw','48305365')];
 s=pass(use(s,'a','end'));assert.equal(s.phase,'choice');assert.equal(s.turn,3);assert.equal(s.current,0);assert.equal(s.choice.actor,1);
 const target=s.choice.targets[0];s=use(JSON.parse(JSON.stringify(s)),'b','choose',a=>a.target===target);assert.equal(s.turn,4);assert.equal(s.current,1);assert.equal(s.blockedEffectNames[1]['91152256'],3);assert.equal(s.players[1].hand.length,2);
});

test('summon watchers activate in the original chain and still resolve after Torrential destroys them',()=>{
 let s=game();s.phase='main';s.players[0].monsters=[m('puppet','54098121')];s.players[0].hand=[ref('summon','91152256')];s.players[1].backrow=[back('torrential','53582587')];s=use(s,'a','summon',a=>a.position==='atk');assert.equal(s.chain[0].id,'54098121');assert.equal(s.chain[0].monsterEffect,true);s=pass(use(s,'b','trap',a=>a.card==='torrential'));assert.equal(s.players[0].monsters.length,0);assert.equal(s.players[0].lp,4500);assert.equal(s.chain.length,0);
});
test('flipping a summon watcher facedown after activation does not negate its already queued heal',()=>{
 let s=game();s.players[0].monsters=[m('puppet','54098121')];s.players[0].hand=[ref('summon','91152256')];s.players[1].backrow=[back('book','14087893')];s=use(s,'a','summon',a=>a.position==='atk');s=pass(use(s,'b','spell',a=>a.target==='puppet'));assert.equal(s.players[0].monsters.find(m=>m.uid==='puppet').faceUp,false);assert.equal(s.players[0].lp,4500);
});

test('the original duel renderer remains byte-identical during engine review',()=>{
 const fs=require('node:fs'),crypto=require('node:crypto');const code=fs.readFileSync(require('node:path').join(__dirname,'../src/duelRenderer.ts'));assert.equal(crypto.createHash('sha256').update(code).digest('hex'),'01d2253332cae7cf18106979e461af7524eda88794021134d2424755b0fb351c');
});
