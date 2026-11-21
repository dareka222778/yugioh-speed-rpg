const {test}=require('node:test');const assert=require('node:assert/strict');
const {THREE_HUMP_LACOODA_ID,threeHumpStateFromTagDuel,prepareThreeHumpLacooda,payThreeHumpLacoodaCost,resolveThreeHumpLacoodaDraw}=require('../dist/threeHumpLacooda.js');
const card=(uid,owner=0,id=THREE_HUMP_LACOODA_ID,faceUp=true)=>({uid,id,owner,faceUp});
const ref=(uid,id='deck-card')=>({uid,id});
function makeState({activeSeat=2,activeTeam=0,deckCount=4,handCount=0}={}){
 return {field:[card('m0:lacooda-a'),card('m2:lacooda-b'),card('m0:lacooda-c')],grave:[],seats:{
  0:{deck:Array.from({length:4},(_,i)=>ref('m0:d'+i)),hand:[]},1:{deck:Array.from({length:4},(_,i)=>ref('m1:d'+i)),hand:[]},
  2:{deck:Array.from({length:deckCount},(_,i)=>ref('m2:d'+i)),hand:Array.from({length:handCount},(_,i)=>ref('m2:h'+i))},
  3:{deck:Array.from({length:4},(_,i)=>ref('m3:d'+i)),hand:[]}},activeSeat,activeTeam};
}
function tagState({cursor=2,active=[2,1]}={}){
 const field=[card('m0:lacooda-a'),card('m2:lacooda-b'),card('m0:lacooda-c')];
 const seats={0:{deck:[ref('m0:r0')],hand:[]},1:{deck:[ref('m1:a1')],hand:[]},2:{deck:[ref('m2:a2'),ref('m2:a3'),ref('m2:a4')],hand:[]},3:{deck:[ref('m3:r3')],hand:[]}};
 return {mode:'tag-classic',active,cursor,reserves:{0:seats[0],3:seats[3]},core:{current:cursor%2,players:[
  {monsters:field,grave:[],deck:seats[active[0]].deck,hand:seats[active[0]].hand},
  {monsters:[],grave:[],deck:seats[active[1]].deck,hand:seats[active[1]].hand}
 ]}};
}
const snap=s=>structuredClone(s);
function setup(s,selected=['m2:lacooda-b','m0:lacooda-c']){const a=prepareThreeHumpLacooda(s,'m0:lacooda-a');assert.ok(a);return {activation:a,paid:payThreeHumpLacoodaCost(s,a,selected)};}
test('projects the actual TagDuel active representative and reserves to four physical seats',()=>{const t=tagState();const s=threeHumpStateFromTagDuel(t);assert.equal(s.activeSeat,2);assert.equal(s.activeTeam,0);assert.equal(s.seats[2].deck,t.core.players[0].deck);assert.equal(s.seats[0].deck,t.reserves[0].deck);assert.equal(s.seats[1].deck,t.core.players[1].deck);assert.equal(s.seats[3].deck,t.reserves[3].deck);});
test('uses active[team], not cursor, during an overflow-return seat',()=>{const t=tagState({cursor:0,active:[2,1]});const s=threeHumpStateFromTagDuel(t);assert.equal(s.activeSeat,2);assert.equal(s.activeTeam,0);});
test('requires three face-up copies on the controlling team field',()=>{const s=makeState();assert.deepEqual(prepareThreeHumpLacooda(s,'m0:lacooda-a').eligibleUids,['m0:lacooda-a','m2:lacooda-b','m0:lacooda-c']);});
test('shared field may contain physical copies owned by both teammates',()=>{const s=makeState();const a=prepareThreeHumpLacooda(s,'m2:lacooda-b');assert.deepEqual(a.eligibleUids.map(uid=>uid.startsWith('m2:')?2:0),[0,2,0]);});
test('activating copy may be one of the two Tributes',()=>{const s=makeState();const {paid}=setup(s,['m0:lacooda-a','m2:lacooda-b']);assert.ok(paid);assert.deepEqual(s.field.map(c=>c.uid),['m0:lacooda-c']);assert.deepEqual(s.grave.map(c=>c.uid),['m0:lacooda-a','m2:lacooda-b']);});
test('activating copy may remain while the other two are Tributed',()=>{const s=makeState();const {paid}=setup(s);assert.ok(paid);assert.deepEqual(s.field.map(c=>c.uid),['m0:lacooda-a']);assert.deepEqual(s.grave.map(c=>c.uid),['m2:lacooda-b','m0:lacooda-c']);});
test('two face-up copies are insufficient',()=>{const s=makeState();s.field.pop();assert.equal(prepareThreeHumpLacooda(s,'m0:lacooda-a'),null);});
test('a face-down third copy does not satisfy activation',()=>{const s=makeState();s.field[2]=card('m0:lacooda-c',0,THREE_HUMP_LACOODA_ID,false);assert.equal(prepareThreeHumpLacooda(s,'m0:lacooda-a'),null);});
test('source must be a face-up 3-Hump Lacooda',()=>{const s=makeState();assert.equal(prepareThreeHumpLacooda(s,'m9:missing'),null);s.field[0]=card('m0:lacooda-a',0,'other-monster',true);assert.equal(prepareThreeHumpLacooda(s,'m0:lacooda-a'),null);});
test('fewer than three cards in active physical Deck prevents activation',()=>{const s=makeState({deckCount:2});assert.equal(prepareThreeHumpLacooda(s,'m0:lacooda-a'),null);});
test('exactly two selected UIDs must come from activation candidates',()=>{const s=makeState();const a=prepareThreeHumpLacooda(s,'m0:lacooda-a');const before=snap(s);assert.equal(payThreeHumpLacoodaCost(s,a,['m0:lacooda-a']),null);assert.equal(payThreeHumpLacoodaCost(s,a,['m0:lacooda-a','m2:lacooda-b','m0:lacooda-c']),null);assert.equal(payThreeHumpLacoodaCost(s,a,['m0:lacooda-a','m9:other']),null);assert.deepEqual(s,before);});
test('duplicate selected UIDs cannot pay the Tribute cost',()=>{const s=makeState();const a=prepareThreeHumpLacooda(s,'m0:lacooda-a');const before=snap(s);assert.equal(payThreeHumpLacoodaCost(s,a,['m0:lacooda-a','m0:lacooda-a']),null);assert.deepEqual(s,before);});
test('draws three from active seat Deck, not partner or opponent Decks',()=>{const s=makeState();const {paid}=setup(s);const top=[...s.seats[2].deck.slice(0,3)];const other={0:s.seats[0].deck.map(c=>c.uid),1:s.seats[1].deck.map(c=>c.uid),3:s.seats[3].deck.map(c=>c.uid)};const r=resolveThreeHumpLacoodaDraw(s,paid);assert.equal(r.activeSeat,2);assert.deepEqual(r.drawn,top);assert.deepEqual(s.seats[2].hand.slice(-3),top);for(const i of [0,1,3])assert.deepEqual(s.seats[i].deck.map(c=>c.uid),other[i]);});
test('drawn cards retain physical UID and original object identity',()=>{const s=makeState();const first=s.seats[2].deck[0];const {paid}=setup(s);const r=resolveThreeHumpLacoodaDraw(s,paid);assert.equal(r.drawn[0],first);assert.ok(r.drawn[0].uid.startsWith('m2:'));assert.equal(s.seats[2].hand.at(-3),first);});
test('hand may exceed six during effect; discard is deferred to End Phase',()=>{const s=makeState({handCount:6});const {paid}=setup(s);const r=resolveThreeHumpLacoodaDraw(s,paid);assert.equal(r.handSizeAfter,9);assert.equal(s.seats[2].hand.length,9);assert.equal(r.drawn.length,3);});
test('effect negation does not refund Tributes and does not draw',()=>{const s=makeState();const {paid}=setup(s);const deck=s.seats[2].deck.map(c=>c.uid);const r=resolveThreeHumpLacoodaDraw(s,paid,true);assert.equal(r.negated,true);assert.equal(r.costPaid,true);assert.deepEqual(r.drawn,[]);assert.deepEqual(s.seats[2].deck.map(c=>c.uid),deck);assert.equal(s.field.length,1);assert.equal(s.grave.length,2);});
test('if another chain link reduces Deck below three, draws what remains and reports deck-out',()=>{const s=makeState();const {paid}=setup(s);s.seats[2].deck.splice(2);const r=resolveThreeHumpLacoodaDraw(s,paid);assert.equal(r.drawn.length,2);assert.equal(r.deckOut,true);assert.equal(s.seats[2].deck.length,0);});
test('physical draw seat is captured at activation, not changed by partner rotation',()=>{const s=makeState();const {paid}=setup(s);s.activeSeat=0;const top=s.seats[2].deck.slice(0,3);const other=s.seats[0].deck.map(c=>c.uid);const r=resolveThreeHumpLacoodaDraw(s,paid);assert.equal(r.activeSeat,2);assert.deepEqual(r.drawn,top);assert.deepEqual(s.seats[0].deck.map(c=>c.uid),other);});
test('a paid cost can resolve only once',()=>{const s=makeState();const {paid}=setup(s);const first=resolveThreeHumpLacoodaDraw(s,paid);const hand=s.seats[2].hand.map(c=>c.uid);const second=resolveThreeHumpLacoodaDraw(s,paid);assert.ok(first);assert.equal(second,null);assert.deepEqual(s.seats[2].hand.map(c=>c.uid),hand);});
test('duplicate physical UIDs across any team zone fail closed before mutation',()=>{const s=makeState();s.seats[2].deck.push(ref('m2:lacooda-b'));const before=snap(s);assert.throws(()=>prepareThreeHumpLacooda(s,'m0:lacooda-a'),/duplicate physical UID/);assert.deepEqual(s,before);});
test('private Deck cards must retain the owner seat encoded by UID prefix',()=>{const s=makeState();s.seats[2].deck[0]=ref('m0:wrong-owner');assert.throws(()=>prepareThreeHumpLacooda(s,'m0:lacooda-a'),/owned by another physical seat/);});
test('active seat must belong to the field controller team',()=>{const s=makeState({activeSeat:2,activeTeam:1});assert.throws(()=>prepareThreeHumpLacooda(s,'m0:lacooda-a'),/does not belong to the controlling team/);});
test('only the controlling team shared field is accepted',()=>{const s=makeState();s.field[1]={...s.field[1],owner:1};assert.throws(()=>prepareThreeHumpLacooda(s,'m0:lacooda-a'),/only this team controlled Monster Zones/);});
test('shared Graveyard retains original physical owners encoded in UIDs',()=>{const s=makeState();const {paid}=setup(s);assert.deepEqual(s.grave.map(c=>c.uid),['m2:lacooda-b','m0:lacooda-c']);});
test('a changed field cannot partially pay a stale Tribute menu',()=>{const s=makeState();const a=prepareThreeHumpLacooda(s,'m0:lacooda-a');s.field.pop();const before=snap(s);assert.equal(payThreeHumpLacoodaCost(s,a,['m2:lacooda-b','m0:lacooda-c']),null);assert.deepEqual(s,before);});
test('a card UID without the TagDuel physical-seat prefix is rejected in private zones',()=>{const s=makeState();s.seats[2].deck[0]=ref('unowned-card');assert.throws(()=>prepareThreeHumpLacooda(s,'m0:lacooda-a'),/no physical seat prefix/);});
