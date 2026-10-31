const {test}=require('node:test'),assert=require('node:assert/strict'),t=require('../dist/tagDuel'),{createTokenGroup}=require('../dist/tokens'),{scheduleStandbyTask}=require('../dist/standbyFlow');
const cards=t.tagNormalCardIds.slice(0,10).flatMap(id=>[id,id]);
function game(){return t.createTagDuel([0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards})),{first:0,classic:true,seed:'continuation'});}
function act(s,kind,filter=()=>true){const member=t.tagDecisionMember(s).id,a=t.tagActions(s,member).find(a=>a.kind===kind&&filter(a));assert.ok(a,kind);return t.stepTagDuel(JSON.parse(JSON.stringify(s)),member,a);}
test('2v2 Standby suspension belongs to the incoming representative and preserves private reserves',()=>{
 let s=game();s.core=scheduleStandbyTask(s.core,{id:'tag-wait',actor:1,turn:2,optional:true,options:[{id:'gain',label:'Recuperar',operations:[{kind:'gainLP',player:'self',amount:100}]}]});const reserve=JSON.stringify(s.reserves[2]);s=act(s,'end');assert.equal(s.core.phase,'choice');assert.equal(t.tagDecisionMember(s).id,'p1');assert.deepEqual(t.tagActions(s,'p3'),[]);assert.equal(JSON.stringify(s.reserves[2]),reserve);
 s=act(s,'choose',a=>a.target==='gain');assert.equal(s.core.players[1].lp,4100);assert.equal(s.core.phase,'main');t.assertTagDuel(s);
});
test('2v2 token destruction preserves physical inventory and private member ownership',()=>{
 let s=game();const [token]=createTokenGroup(s.core,1,1);assert.match(token.uid,/^m1:token:/);s.core.players[0].hand=[{uid:'m0:hole',id:'53129443'}];const physical=t.tagInventory(s).filter(c=>c.entityKind!=='token').map(c=>[c.uid,c.id]).sort();
 s=act(s,'spell');for(let n=0;s.core.phase==='response';n++){assert.ok(n<20);s=act(s,'pass');}assert.equal(s.core.tokenLedger.entries[0].status,'removed');assert.deepEqual(t.tagInventory(s).filter(c=>c.entityKind!=='token').map(c=>[c.uid,c.id]).sort(),physical);t.assertTagDuel(s);
});
