const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classic-rules-v1-'));process.env.DATABASE_PATH=path.join(dir,'game.sqlite');
const e=require('../dist/duelEngine'),t=require('../dist/tagDuel'),{RULES_VERSION,RULES_PROFILE,rulesFor}=require('../dist/rulesProfile'),{assertDuelState}=require('../dist/duelIntegrity'),{starterContents}=require('../dist/cardCatalog');
const db=require('../dist/database'),store=require('../dist/duelStore'),decks=require('../dist/decks');
const ids=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id)),ref=(uid,id='91152256')=>({uid,id});
function game(){return e.createDuel([{id:'a',name:'A',cards:ids},{id:'b',name:'B',cards:ids}],()=>.5);}
function hand(s,i,n){s.players[i].hand=Array.from({length:n},(_,j)=>ref(`h${i}-${j}`));}
function use(s,who,kind,where=()=>true){const a=e.legalActions(s,who).find(a=>a.kind===kind&&where(a));assert.ok(a,`${who}: ${kind} in ${s.phase}`);return e.step(s,who,a);}
function drain(s){for(let i=0;i<20&&s.phase==='response';i++)s=use(s,s.players[e.decisionPlayer(s)].id,'pass');return s;}
const mon=(uid,id)=>({...ref(uid,id),position:'def',faceUp:false,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
function team(classic=true,first=0){return t.createTagDuel([0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:t.tagNormalCardIds.slice(0,10).flatMap(id=>[id,id])})),{classic,first,seed:'six-end'});}
function act(s,kind,where=()=>true){const who=t.tagDecisionMember(s).id,a=t.tagActions(s,who).find(a=>a.kind===kind&&where(a));assert.ok(a,`${who}: ${kind} in ${s.core.phase}`);return t.stepTagDuel(s,who,a);}
test('new games select the immutable classic profile; historical profiles remain explicit',()=>{
 const s=game();assert.equal(s.rulesVersion,'speed-rpg-classic-v1');assert.equal(s.players[0].hand.length,4);assert.equal(s.players[0].lp,4000);assert.equal(RULES_PROFILE.extraDeckMax,5);assert.equal(RULES_PROFILE.handLimit,6);assert.equal(RULES_PROFILE.skillsEnabled,false);assert.ok(Object.isFrozen(RULES_PROFILE));
 for(const v of [undefined,'speed-rpg-v1','speed-rpg-v2',RULES_VERSION]){s.rulesVersion=v;assert.doesNotThrow(()=>assertDuelState(s));assert.equal(rulesFor(s).extraDeckMax,v===RULES_VERSION?5:6);}
});
test('a six-card hand buys to seven normally and discards only on its own End Phase',()=>{
 let s=game();hand(s,1,6);const top=s.players[1].deck[0].uid;s=use(s,'a','end');assert.equal(s.current,1);assert.equal(s.phase,'main');assert.equal(s.players[1].hand.length,7);assert.ok(s.players[1].hand.some(c=>c.uid===top));
 s=use(s,'b','end');assert.equal(s.phase,'discard');assert.equal(s.current,1);assert.equal(s.turn,2);assert.equal(s.handFlow,undefined);assert.deepEqual(e.legalActions(s,'a'),[]);s=use(JSON.parse(JSON.stringify(s)),'b','discard');assert.equal(s.turn,3);assert.equal(s.players[1].hand.length,6);
});
test('Pot draws twice before any discard, persists excess and never repeats the draw',()=>{
 let s=game();hand(s,0,6);s.players[0].backrow=[{...ref('pot','55144522'),faceUp:false,setTurn:0}];const size=s.players[0].deck.length;s=use(s,'a','spell');assert.equal(s.phase,'main');assert.equal(s.players[0].hand.length,8);assert.equal(s.players[0].deck.length,size-2);assert.equal(s.handFlow,undefined);
 s=use(s,'a','end');assert.equal(s.phase,'discard');s=use(JSON.parse(JSON.stringify(s)),'a','discard');assert.equal(s.phase,'discard');assert.equal(s.players[0].hand.length,7);s=use(JSON.parse(JSON.stringify(s)),'a','discard');assert.equal(s.phase,'main');assert.equal(s.current,1);assert.equal(s.players[0].hand.length,6);assert.equal(s.players[0].deck.length,size-2);assert.equal(s.players[0].grave.filter(c=>c.uid==='pot').length,1);
});
test('draw plus subsequent heal resolves completely even above six cards',()=>{
 let s=game();hand(s,0,6);s.players[0].backrow=[{...ref('up','70368879'),faceUp:false,setTurn:0}];s=use(s,'a','spell');assert.equal(s.phase,'main');assert.equal(s.players[0].hand.length,7);assert.equal(s.players[1].lp,5000);
});
test('off-turn Jar resolves without forcing an opponent discard; End Phase applies only to turn owner',()=>{
 let s=game();hand(s,0,7);hand(s,1,6);s.players[1].backrow=[{...ref('jar','83968380'),setTurn:0,faceUp:false}];s=use(s,'a','end');s=use(s,'b','trap');s=drain(s);assert.equal(s.phase,'discard');assert.equal(e.decisionPlayer(s),0);assert.equal(s.players[1].hand.length,7);s=use(s,'a','discard');assert.equal(s.phase,'main');assert.equal(s.current,1);assert.equal(s.players[1].hand.length,8);
});
test('mandatory FLIP draw above six completes without an extra decision',()=>{
 let s=game();hand(s,0,6);s.players[0].monsters=[mon('angel','60694662')];s=use(s,'a','position',a=>a.mode==='flip');assert.equal(s.phase,'main');assert.equal(s.players[0].hand.length,7);
});
test('Hane-Hane returns to a full enemy hand without interrupting the current turn',()=>{
 let s=game();hand(s,1,6);s.players[0].monsters=[mon('hane','07089711')];s.players[1].monsters=[{...mon('target','91152256'),faceUp:true,position:'atk'}];s=use(s,'a','position',a=>a.mode==='flip');s=use(s,'a','choose',a=>a.target==='target');assert.equal(s.phase,'main');assert.equal(s.players[1].hand.length,7);assert.equal(s.current,0);assert.equal(s.handFlow,undefined);
});
test('Sangan search resolves its saved root without overflow interruption',()=>{
 let s=game();hand(s,0,6);s.players[0].monsters=[{...mon('cannon','11384280'),faceUp:true},{...mon('sangan','26202165'),faceUp:true}];s=use(s,'a','monsterEffect',a=>a.card==='cannon'&&a.tributes?.[0]==='sangan');s=use(s,'a','choose');assert.equal(s.phase,'main');assert.equal(s.players[0].hand.length,7);assert.equal(s.chainRoot,undefined);assert.equal(s.players[1].lp,3500);
});
test('mandatory empty-deck loss still applies with a full hand; End Phase timeout belongs to discarder',()=>{
 let s=game();hand(s,1,6);s.players[1].deck=[];s=use(s,'a','end');assert.equal(s.phase,'finished');assert.equal(s.winner,'a');s=game();hand(s,0,7);s=use(s,'a','end');assert.equal(e.timeoutDuel(s).winner,'b');
});
test('classic and Normal 2v2 retain outgoing member until End Phase discard; incoming draw uses correct deck',()=>{
 for(const classic of [true,false])for(let first=0;first<4;first++){let s=team(classic,first);const owner=t.tagDecisionMember(s).id,oldTeam=first%2;s.core.players[oldTeam].hand.push(...s.core.players[oldTeam].deck.splice(0,3));const incoming=(first+1)%4,held=s.active[incoming%2]===incoming?s.core.players[incoming%2]:s.reserves[incoming],top=held.deck[0].uid;
  const activeBefore=[...s.active];s=act(s,'end');assert.deepEqual(s.active,activeBefore);assert.equal(s.core.phase,'discard');assert.equal(s.cursor,first);assert.equal(t.tagDecisionMember(s).id,owner);s=act(JSON.parse(JSON.stringify(s)),'discard');assert.equal(s.cursor,incoming);assert.equal(s.core.current,incoming%2);assert.equal(t.tagDecisionMember(s).id,'p'+incoming);assert.ok(t.tagMemberHand(s,'p'+incoming).some(c=>c.uid===top));assert.equal(t.tagMemberHand(s,owner).length,6);t.assertTagDuel(s);
 }
});
test('2v2 bounce preserves inactive physical owner; no forced discard until that member ends their turn',()=>{
 let s=team(true,3);s.core.turn=4;s.core.players[1].hand=[{uid:'m3:bounce',id:'42703248'}];s.core.players[0].backrow=[{uid:'m0:own',id:'44095762',setTurn:0,faceUp:false}];const held=s.active[0]===0?s.core.players[0]:s.reserves[0];held.hand.push(...held.deck.splice(0,3));s=act(s,'spell');assert.equal(s.core.phase,'main');assert.equal(t.tagDecisionMember(s).id,'p3');assert.equal(t.tagMemberHand(s,'p0').length,8);assert.ok(t.tagMemberHand(s,'p0').some(c=>c.uid==='m0:own'));t.assertTagDuel(JSON.parse(JSON.stringify(s)));
});
test('new games reject six Extra cards; historical state zone capacity stays six',()=>{
 const fusion='45231177',s=game();assert.doesNotThrow(()=>e.createDuel([{id:'a',name:'A',cards:ids,extra:[fusion,fusion,fusion]},{id:'b',name:'B',cards:ids}]));assert.throws(()=>e.createDuel([{id:'a',name:'A',cards:ids,extra:Array(6).fill(fusion)},{id:'b',name:'B',cards:ids}]),/máximo de 5/);
 // Structural capacity fixture only: the live catalog has one enabled Fusion,
 // so no legal current deck can fill all five slots under the three-copy rule.
 s.rulesVersion='speed-rpg-v2';s.players[0].extra=Array.from({length:6},(_,i)=>ref('extra-'+i,fusion));assert.doesNotThrow(()=>assertDuelState(s));s.rulesVersion=RULES_VERSION;assert.throws(()=>assertDuelState(s),/limite de zonas/);
});
test('a future saved six-card Extra can be reduced without consuming collection copies',()=>{
 // Test-only second Fusion metadata, never registered or enabled in the engine.
 const collection=require('../dist/collection'),original=collection.getCard,second='48305365',fusion='45231177';db.createPlayer('extra','E');db.chooseStarterDeck('extra','warrior');decks.openDeck('extra');
 collection.getCard=id=>id===second?{...original(id),fusion:['fixture']}:original(id);
 try{
  db.db.prepare('DELETE FROM deck_cards WHERE discord_id=? AND card_key=?').run('extra',second);
  for(const id of [fusion,second]){db.db.prepare('INSERT INTO player_cards(discord_id,card_key,quantity) VALUES(?,?,3) ON CONFLICT(discord_id,card_key) DO UPDATE SET quantity=3').run('extra',id);db.db.prepare('INSERT INTO deck_cards(discord_id,slot,card_key,quantity) VALUES(?,1,?,3)').run('extra',id);}
  const before=db.getCollection('extra');assert.equal(decks.openDeck('extra').extraTotal,6);assert.throws(()=>decks.activateDeck('extra',1),/máximo de 5/);assert.equal(decks.changeDeck('extra',1,fusion,-1).extraTotal,5);assert.deepEqual(db.getCollection('extra'),before);
 }finally{collection.getCard=original;}
});
test('End Phase choice survives a fresh process and repeated revision cannot discard twice',()=>{
 db.createPlayer('a','A');db.chooseStarterDeck('a','warrior');decks.openDeck('a');decks.activateDeck('a',1);const r=store.createTraining('a','g','c');let s=game();hand(s,0,8);s=use(s,'a','end');db.db.prepare('UPDATE duels SET state=? WHERE id=?').run(JSON.stringify(s),r.id);
 const code="const x=require('./dist/duelStore'),d=require('./dist/database');let r=x.getDuel(process.argv[1]);r=x.performDuelAction(r.id,'a','g',r.revision,0);console.log(JSON.stringify({phase:r.state.phase,hand:r.state.players[0].hand.length,rules:r.state.rulesVersion}));d.db.close();";
 const result=JSON.parse(require('node:child_process').execFileSync(process.execPath,['-e',code,r.id],{encoding:'utf8'}).trim());assert.deepEqual(result,{phase:'discard',hand:7,rules:RULES_VERSION});const saved=store.getDuel(r.id),rev=saved.revision;const next=store.performDuelAction(r.id,'a','g',rev,0);assert.equal(next.state.players[0].hand.length,6);assert.equal(next.state.current,1);assert.throws(()=>store.performDuelAction(r.id,'a','g',rev,0),/antigo|atualiz|mudou/i);
});
after(()=>{db.db.close();fs.rmSync(dir,{recursive:true,force:true});});
