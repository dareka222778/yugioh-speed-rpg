const {test}=require('node:test'),assert=require('node:assert/strict');
const e=require('../dist/duelEngine'),{createTokenGroup,removeToken}=require('../dist/tokens'),{assertDuelState,assertDuelTransition,duelCards}=require('../dist/duelIntegrity'),{starterContents}=require('../dist/cardCatalog'),{sendMonsterToGrave}=require('../dist/monsterExit'),{transitionEvents}=require('../dist/duelTransitions');
const cards=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));const game=()=>{const s=e.createDuel([{id:'a',name:'A',cards},{id:'b',name:'B',cards}],()=>.5);s.turn=3;return s;};
const restore=s=>{const n=JSON.parse(JSON.stringify(s));assertDuelState(n);return n;};
const mon=(uid,id)=>({uid,id,owner:0,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
function use(s,actor,kind,filter=()=>true){const a=e.legalActions(s,actor).find(a=>a.kind===kind&&filter(a));assert.ok(a,kind);return e.step(restore(s),actor,a);}
function settle(s){for(let n=0;s.phase==='response';n++){assert.ok(n<30);s=use(s,s.players[e.decisionPlayer(s)].id,'pass');}return s;}
test('REA-T01: creation/restoration occupies zones, conserves physical cards and emits entity events',()=>{
 const before=game(),after=structuredClone(before),physical=duelCards(before).length;const tokens=createTokenGroup(after,0,3);
 assert.equal(after.players[0].monsters.length,3);assert.equal(e.atk(tokens[0],after),0);assertDuelTransition(before,restore(after));
 assert.equal(duelCards(after).filter(c=>c.entityKind!=='token').length,physical);assert.equal(transitionEvents(before,after).filter(e=>e.type==='tokenCreated').length,3);
 const raw=JSON.stringify(after);assert.throws(()=>createTokenGroup(after,0,1),/Zonas/);assert.equal(JSON.stringify(after),raw);
 assert.throws(()=>e.validateDuelCards([...cards.slice(1),'token:sheep']));
});
test('destruction, banishment and returns remove tokens instead of creating cards in other zones',()=>{
 for(const cause of ['destroy','banish','return','tribute','battle']){const before=game();const [token]=createTokenGroup(before,0,1);const after=structuredClone(before);
  if(cause==='destroy')sendMonsterToGrave(after,token.uid);else removeToken(after,token.uid,cause);
  assertDuelTransition(before,restore(after));assert.ok(!duelCards(after).some(c=>c.uid===token.uid));assert.equal(after.tokenLedger.entries[0].cause,cause);assert.equal(transitionEvents(before,after).filter(e=>e.type==='tokenRemoved').length,1);
  const [next]=createTokenGroup(after,0,1);assert.notEqual(next.uid,token.uid);
 }
});
test('token policy permits effect Tribute while forbidding Tribute Summon and facedown targets',()=>{
 let s=game();s.players[0].monsters=[mon('cannon','11384280')];s.players[0].hand=[{uid:'high',id:'28546905'},{uid:'book',id:'14087893'}];const [token]=createTokenGroup(s,0,1);
 assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='summon'&&a.tributes.includes(token.uid)));assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='spell'&&a.target===token.uid));
 s=use(s,'a','monsterEffect',a=>a.tributes?.includes(token.uid));s=settle(s);assert.equal(s.players[1].lp,3500);assert.equal(s.tokenLedger.entries[0].cause,'tribute');assert.ok(!s.players[0].grave.some(c=>c.uid===token.uid));
 const denied=game();denied.players[0].monsters=[mon('cannon','11384280')];const [restricted]=createTokenGroup(denied,0,1,'def',{tributeSummon:false,tributeEffect:false});assert.ok(!e.legalActions(denied,'a').some(a=>a.kind==='monsterEffect'&&a.tributes?.includes(restricted.uid)));
});
test('temporary control preserves token owner; full return field removes it without a grave card',()=>{
 let s=game();const [token]=createTokenGroup(s,1,1);s.players[0].hand=[{uid:'heart',id:'04031928'}];s=settle(use(s,'a','spell',a=>a.target===token.uid));
 assert.equal(s.players[0].monsters.find(m=>m.uid===token.uid).owner,1);createTokenGroup(s,1,3);s=settle(use(s,'a','end'));
 assert.equal(s.tokenLedger.entries[0].status,'removed');assert.ok(!s.players.some(p=>p.grave.some(c=>c.uid===token.uid)));assertDuelState(restore(s));
});
test('forged token zones, missing ledger, policy changes and facedown tokens fail closed',()=>{
 const original=game();const [token]=createTokenGroup(original,0,1);
 for(const corrupt of [s=>delete s.tokenLedger,s=>s.players[0].monsters[0].faceUp=false,s=>{s.players[0].grave.push(s.players[0].monsters.pop());},s=>s.players[0].monsters[0].tokenPolicy.tributeSummon=true]){const s=structuredClone(original);corrupt(s);assert.throws(()=>assertDuelState(s),/ficha/i);}
 const gone=structuredClone(original);sendMonsterToGrave(gone,token.uid);const forged=structuredClone(gone);forged.tokenLedger.entries=[];forged.tokenLedger.next=0;forged.tokenLedger.events=[];assert.throws(()=>assertDuelTransition(gone,forged),/Histórico/);
});
test('higher Bottomless chain removes a boosted token without producing a banished physical card',()=>{
 let s=game();const [token]=createTokenGroup(s,0,1,'atk');token.atkBoost=2000;s.pending={kind:'specialSummon',actor:0,card:token.uid,id:token.id};s.phase='response';s.resume='main';s.priority=1;s.players[1].backrow=[{uid:'bottomless',id:'29401950',faceUp:false,setTurn:0}];
 s=settle(use(s,'b','trap',a=>a.target===token.uid));assert.equal(s.tokenLedger.entries[0].cause,'banish');assert.ok(!s.players[0].banished.some(c=>c.uid===token.uid));
});
