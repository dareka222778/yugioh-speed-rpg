const {test}=require('node:test'),assert=require('node:assert/strict');
const t=require('../dist/tagDuel');
const normal=t.tagNormalCardIds.slice(0,10).flatMap(id=>[id,id]);
function game(first=0){
 const s=t.createTagDuel([0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:normal})),{seed:'hane-hane-physical-owner-'+first,classic:true,first});
 s.core.rulesVersion='speed-rpg-v2';
 s.core.turn=4;
 return s;
}
const mon=(seat,name,id,props={})=>({uid:`m${seat}:${name}`,id,owner:seat%2,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...props});
function act(s,kind,filter=()=>true){
 const member=t.tagDecisionMember(s).id;
 const action=t.tagActions(s,member).find(a=>a.kind===kind&&filter(a));
 assert.ok(action,`No ${kind} for ${member} in ${s.core.phase}: ${JSON.stringify(t.tagActions(s,member))}`);
 return t.stepTagDuel(s,member,action);
}
function passes(s){
 for(let n=0;n<20&&s.core.phase==='response';n++)s=act(s,'pass');
 assert.notEqual(s.core.phase,'response','response chain did not close');
 return s;
}
for(let first=0;first<4;first++)for(let target=0;target<4;target++)test(`Hane-Hane returns a shared-field monster to physical owner p${target} (first seat p${first})`,()=>{
 let s=game(first);
 const source=mon(first,'hane','07089711',{faceUp:false,position:'def'});
 const victim=mon(target,'victim','91152256');
 s.core.players[first%2].monsters.push(source);
 s.core.players[target%2].monsters.push(victim);
 t.assertTagDuel(s);
 s=act(s,'position',a=>a.mode==='flip');
 assert.equal(s.core.phase,'choice');
 assert.ok(s.core.choice.targets.includes(victim.uid),`victim ${victim.uid} was not offered`);
 s=act(s,'choose',a=>a.target===victim.uid);
 s=passes(s);
 assert.ok(!s.core.players[target%2].monsters.some(c=>c.uid===victim.uid),'returned monster remained on shared field');
 assert.ok(t.tagMemberHand(s,'p'+target).some(c=>c.uid===victim.uid),'returned monster did not reach its physical owner hand');
 for(let seat=0;seat<4;seat++)if(seat!==target)assert.ok(!t.tagMemberHand(s,'p'+seat).some(c=>c.uid===victim.uid),`monster leaked to p${seat} hand`);
 t.assertTagDuel(s);
});
