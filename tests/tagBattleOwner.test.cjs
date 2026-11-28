const {test}=require('node:test'), assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const main=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
function take(p,id){for(const z of ['hand','deck','extra']){const i=(p[z]??[]).findIndex(c=>c.id===id);if(i>=0)return p[z].splice(i,1)[0];}throw Error('missing fixture '+id);}
function deploy(p,c,position,owner){p.monsters.push({...c,owner,position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});}
for(const fusion of [false,true])for(const first of [0,1,2,3])test('Jujitsu: returns inactive attacker to physical owner '+first+' fusion='+fusion,()=>{
 const players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:['25773409','89631139',...main.slice(2)],extra:['45231177']}));
 let s=tag.createTagDuel(players,{classic:true,first,seed:'jujitsu-owner-'+first});
 s.core.turn=5;s.core.phase='battle';s.core.resume='battle';
 const team=first%2,inactive=(first+2)%4,p=s.core.players[team],q=s.core.players[1-team],zone=fusion?'extra':'deck';
 const a=take(s.reserves[inactive],fusion?'45231177':'89631139'),d=take(q,'25773409');deploy(p,a,'atk',team);deploy(q,d,'def',1-team);
 const untouched=p[zone].map(c=>c.uid),reserve=s.reserves[inactive][zone].map(c=>c.uid);
 function act(kind){const id=tag.tagDecisionMember(s).id;const action=tag.tagActions(s,id).find(x=>x.kind===kind&&(kind!=='attack'||x.target===d.uid));assert.ok(action,kind);s=tag.stepTagDuel(s,id,action);}
 act('attack');s=JSON.parse(JSON.stringify(s));for(let i=0;s.core.phase==='response';i++){assert.ok(i<12);act('pass');}
 assert.deepEqual(s.core.players[team][zone].map(c=>c.uid),untouched);assert.deepEqual(s.reserves[inactive][zone].map(c=>c.uid),fusion?[...reserve,a.uid]:[a.uid,...reserve]);tag.assertTagDuel(s);
});
