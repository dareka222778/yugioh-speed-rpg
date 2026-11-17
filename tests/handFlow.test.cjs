const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hand-seven-'));process.env.DATABASE_PATH=path.join(tmp,'game.sqlite');
const e=require('../dist/duelEngine'),{starterContents}=require('../dist/cardCatalog'),integrity=require('../dist/duelIntegrity'),db=require('../dist/database'),store=require('../dist/duelStore');
const ids=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id='91152256')=>({uid,id});
function game(){const s=e.createDuel([{id:'a',name:'A',cards:ids},{id:'b',name:'B',cards:ids}],()=>.5);s.rulesVersion='speed-rpg-v2';return s;}
function hand(s,actor,n){s.players[actor].hand=Array.from({length:n},(_,i)=>ref(`h-${actor}-${i}`));}
function use(s,id,kind,where=()=>true){const a=e.legalActions(s,id).find(a=>a.kind===kind&&where(a));assert.ok(a,`missing ${kind}: ${s.phase}`);return e.step(s,id,a);}
const monster=(uid,id)=>({...ref(uid,id),position:'def',faceUp:false,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
test('turn draw pauses BEFORE touching a full hand or top card and resumes once after JSON restore',()=>{
 let s=game();hand(s,1,7);const top=s.players[1].deck[0].uid;s=use(s,'a','end');assert.equal(s.current,1);assert.equal(s.phase,'discard');assert.equal(s.players[1].hand.length,7);assert.equal(s.players[1].deck[0].uid,top);assert.equal(e.decisionPlayer(s),1);assert.deepEqual(e.legalActions(s,'a'),[]);
 const before=JSON.stringify(s),discard=e.legalActions(s,'b')[0];s=e.step(JSON.parse(before),'b',discard);assert.equal(s.phase,'main');assert.equal(s.turn,2);assert.equal(s.players[1].hand.length,7);assert.ok(s.players[1].hand.some(c=>c.uid===top));assert.throws(()=>e.step(s,'b',discard),/inválida/);assert.equal(JSON.parse(before).players[1].deck[0].uid,top);
});
test('Pot of Greed requests space for EACH draw, preserving count and top through every restore',()=>{
 let s=game();hand(s,0,7);s.players[0].backrow=[{...ref('pot','55144522'),faceUp:false,setTurn:0}];const before=s.players[0].deck.length;s=use(s,'a','spell',a=>a.card==='pot');assert.equal(s.phase,'discard');assert.equal(s.handFlow.remaining,2);
 s=use(JSON.parse(JSON.stringify(s)),'a','discard');assert.equal(s.phase,'discard');assert.equal(s.handFlow.remaining,1);assert.equal(s.players[0].deck.length,before-1);
 s=use(JSON.parse(JSON.stringify(s)),'a','discard');assert.equal(s.phase,'main');assert.equal(s.players[0].hand.length,7);assert.equal(s.players[0].deck.length,before-2);assert.equal(s.players[0].grave.filter(c=>c.uid==='pot').length,1);
});
test('activating Pot from a seven-card hand frees one slot; only its second draw needs a discard',()=>{
 let s=game();hand(s,0,6);s.players[0].hand.push(ref('pot-hand','55144522'));const size=s.players[0].deck.length;s=use(s,'a','spell',a=>a.card==='pot-hand');assert.equal(s.phase,'discard');assert.equal(s.handFlow.remaining,1);assert.equal(s.players[0].deck.length,size-1);assert.equal(s.players[0].hand.length,7);s=use(s,'a','discard');assert.equal(s.phase,'main');assert.equal(s.players[0].deck.length,size-2);assert.equal(s.players[0].hand.length,7);
});
test('Upstart Goblin heals the opponent only AFTER a paused draw completes',()=>{
 let s=game();hand(s,0,7);s.players[0].backrow=[{...ref('upstart','70368879'),faceUp:false,setTurn:0}];s=use(s,'a','spell',a=>a.card==='upstart');assert.equal(s.phase,'discard');assert.equal(s.players[1].lp,4000);
 s=use(s,'a','discard');assert.equal(s.players[1].lp,5000);assert.equal(s.phase,'main');
});
test('off-turn Jar of Greed retains the lower chain/root until the recipient discards and draws',()=>{
 let s=game();hand(s,1,7);s.players[1].backrow=[{...ref('jar','83968380'),setTurn:0,faceUp:false}];s=use(s,'a','end');s=use(s,'b','trap',a=>a.card==='jar');
 if(s.phase==='response')s=use(s,s.players[e.decisionPlayer(s)].id,'pass');
 assert.equal(s.phase,'discard');assert.equal(e.decisionPlayer(s),1);assert.equal(s.pending.kind,'end');assert.equal(s.players[1].grave.filter(c=>c.uid==='jar').length,1);
 s=use(JSON.parse(JSON.stringify(s)),'b','discard');assert.equal(s.phase,'discard');assert.equal(s.turn,2);assert.equal(s.handFlow.remaining,1); // draw of the new turn also needs room
 s=use(s,'b','discard');assert.equal(s.phase,'main');assert.equal(s.players[1].hand.length,7);
});
test('mandatory FLIP draw pauses correctly without replaying the monster trigger',()=>{
 let s=game();hand(s,0,7);s.players[0].monsters=[monster('skelengel','60694662')];s=use(s,'a','position',a=>a.mode==='flip');assert.equal(s.phase,'discard');const size=s.players[0].deck.length;
 s=use(s,'a','discard');assert.equal(s.phase,'main');assert.equal(s.players[0].deck.length,size-1);assert.equal(s.players[0].monsters.length,1);
});
test('Hane-Hane adds to a full hand first, then its OWNER discards the excess',()=>{
 let s=game();hand(s,1,7);s.players[0].monsters=[monster('hane','07089711')];s.players[1].monsters=[{...monster('enemy','91152256'),faceUp:true,position:'atk'}];s=use(s,'a','position',a=>a.mode==='flip');s=use(s,'a','choose',a=>a.target==='enemy');
 assert.equal(s.phase,'discard');assert.equal(s.handFlow.mode,'overflow');assert.equal(e.decisionPlayer(s),1);assert.equal(s.players[1].hand.length,8);assert.ok(s.players[1].hand.some(c=>c.uid==='enemy'));
 s=use(s,'b','discard',a=>a.card==='enemy');assert.equal(s.phase,'main');assert.equal(s.players[1].hand.length,7);assert.ok(s.players[1].grave.some(c=>c.uid==='enemy'));
});
test('Giant Trunade resolves both returns before serialized consecutive overflow decisions',()=>{
 let s=game();hand(s,0,7);hand(s,1,7);s.players[0].backrow=[{...ref('trunade','42703248'),faceUp:false,setTurn:0}];
 for(let i=0;i<2;i++)s.players[i].field={...ref('field-'+i,'86318356'),faceUp:true,setTurn:0};
 s=use(s,'a','spell',a=>a.card==='trunade');assert.equal(s.phase,'discard');assert.equal(s.players[0].field,null);assert.equal(s.players[1].field,null);assert.equal(s.players[0].hand.length,8);assert.equal(s.players[1].hand.length,8);
 s=use(s,'a','discard');assert.equal(s.phase,'discard');assert.equal(e.decisionPlayer(s),1);s=use(JSON.parse(JSON.stringify(s)),'b','discard');assert.equal(s.phase,'main');assert.deepEqual(s.players.map(p=>p.hand.length),[7,7]);
});
test('deck-out takes precedence over a pointless discard; timeout belongs to off-turn hand decision owner',()=>{
 let s=game();hand(s,1,7);s.players[1].deck=[];s=use(s,'a','end');assert.equal(s.phase,'finished');assert.equal(s.winner,'a');assert.equal(s.handFlow,undefined);
 s=game();hand(s,1,7);s.players[0].monsters=[monster('hane','07089711')];s.players[1].monsters=[{...monster('enemy','91152256'),faceUp:true,position:'atk'}];s=use(s,'a','position',a=>a.mode==='flip');s=use(s,'a','choose',a=>a.target==='enemy');assert.equal(e.timeoutDuel(s).winner,'a');assert.equal(e.timeoutDuel(s).handFlow,undefined);
});
test('SQLite reload retains the private hand decision and rejects a repeated revision',()=>{
 db.createPlayer('a','A');db.chooseStarterDeck('a','warrior');require('../dist/decks').openDeck('a');require('../dist/decks').activateDeck('a',1);
 let r=store.createTraining('a','g','c');let s=game();hand(s,0,7);s.players[0].backrow=[{...ref('pot','55144522'),faceUp:false,setTurn:0}];s=use(s,'a','spell',a=>a.card==='pot');db.db.prepare('UPDATE duels SET state=? WHERE id=?').run(JSON.stringify(s),r.id);
 r=store.getDuel(r.id);assert.equal(r.state.handFlow.remaining,2);const revision=r.revision;const next=store.performDuelAction(r.id,'a','g',revision,0);assert.equal(next.state.handFlow.remaining,1);assert.throws(()=>store.performDuelAction(r.id,'a','g',revision,0),/antigo|atualiz|mudou/i);
});
test('Sangan search adds to a full hand, persists overflow and resumes the saved chain root',()=>{
 let s=game();hand(s,0,7);s.players[0].monsters=[{...monster('cannon','11384280'),faceUp:true,position:'atk'},{...monster('sangan','26202165'),faceUp:true,position:'atk'}];
 s=use(s,'a','monsterEffect',a=>a.card==='cannon'&&a.tributes?.[0]==='sangan');
 assert.equal(s.phase,'choice');assert.equal(s.choice.source,'monsterSearch');s=use(s,'a','choose');assert.equal(s.phase,'discard');assert.equal(s.handFlow.mode,'overflow');assert.ok(s.handFlow.resumeChainRoot);assert.equal(s.players[0].hand.length,8);
 s=use(JSON.parse(JSON.stringify(s)),'a','discard');assert.equal(s.phase,'main');assert.equal(s.handFlow,undefined);assert.equal(s.chainRoot,undefined);assert.equal(s.players[1].lp,3500);
});
test('a fresh Node process resumes a saved hand decision without revealing or duplicating the next card',()=>{
 const old=store.currentDuel('a');if(old)store.performDuelAction(old.id,'a','g',old.revision,{kind:'concede'});const r=store.createTraining('a','g','c');let s=game();hand(s,0,7);s.players[0].backrow=[{...ref('pot-new-process','55144522'),faceUp:false,setTurn:0}];s=use(s,'a','spell',a=>a.card==='pot-new-process');db.db.prepare('UPDATE duels SET state=? WHERE id=?').run(JSON.stringify(s),r.id);
 const code="const store=require('./dist/duelStore'),db=require('./dist/database');let r=store.getDuel(process.argv[1]);r=store.performDuelAction(r.id,'a','g',r.revision,0);console.log(JSON.stringify({remaining:r.state.handFlow.remaining,hand:r.state.players[0].hand.length,deck:r.state.players[0].deck.length}));db.db.close();";
 const result=JSON.parse(require('node:child_process').execFileSync(process.execPath,['-e',code,r.id],{encoding:'utf8'}).trim());assert.equal(result.remaining,1);assert.equal(result.hand,7);assert.equal(result.deck,s.players[0].deck.length-1);
});
test('malformed hand continuation cannot be stored or executed',()=>{
 const s=game();s.phase='discard';s.handFlow={actor:7,remaining:-1,returnPhase:'main',mode:'draw',after:[]};assert.throws(()=>integrity.assertDuelState(s),/continuação/);
});
after(()=>{db.db.close();fs.rmSync(tmp,{recursive:true,force:true});});
