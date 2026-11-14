const {test}=require('node:test'),assert=require('node:assert/strict'),e=require('../dist/duelEngine'),{starterContents}=require('../dist/cardCatalog'),{bindTarget,targetBindingValid,synchronizeCardLifetimes}=require('../dist/cardLifetime'),{scheduleStandbyTask}=require('../dist/standbyFlow'),{sendMonsterToGrave}=require('../dist/monsterExit'),{specialSummonFromPile}=require('../dist/monsterEntry');
const cards=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const game=()=>e.createDuel([{id:'a',name:'A',cards},{id:'b',name:'B',cards}],()=>.5);
test('REA-I02: a paid pending operation survives restore but rejects the returned target incarnation',()=>{
 let s=game();s.players[0].monsters=[{uid:'victim',id:'91152256',owner:0,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0}];const target=bindTarget(s,'victim');
 s=scheduleStandbyTask(s,{id:'bound',turn:2,actor:1,optional:false,costLP:100,options:[{id:'heal',label:'Recuperar pelo alvo',target,operations:[{kind:'gainLP',player:'self',amount:200}]}]});s=e.step(s,'a',{kind:'end'});s.players[0].backrow.push({uid:'jar',id:'83968380',faceUp:false,setTurn:0});s=e.step(s,'b',{kind:'choose',target:'heal'});assert.equal(s.players[1].lp,3900);assert.equal(s.phase,'response');
 sendMonsterToGrave(s,'victim');assert.ok(specialSummonFromPile(s,0,0,'grave','victim'));assert.equal(targetBindingValid(s,target),false);
 for(let n=0;s.phase==='response';n++){assert.ok(n<20);s=e.step(JSON.parse(JSON.stringify(s)),s.players[e.decisionPlayer(s)].id,{kind:'pass'});}assert.equal(s.players[1].lp,3900);assert.equal(s.standby.completed.length,1);assert.equal(s.players[0].monsters[0].uid,'victim');
});
test('REA-I02: absent entities cannot remain valid through cached lifetime metadata',()=>{
 const s=game(),card=s.players[0].hand[0],binding=bindTarget(s,card.uid);s.players[0].hand.shift();synchronizeCardLifetimes(s);assert.equal(targetBindingValid(s,binding),false);
});
