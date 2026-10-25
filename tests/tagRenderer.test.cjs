const {test}=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');const tag=require('../dist/tagDuel'),{renderTag}=require('../dist/tagRenderer'),{getPlayableCard}=require('../dist/effectRegistry');
const cards=tag.tagNormalCardIds.filter(id=>(getPlayableCard(id).level??0)<=4).slice(0,10).flatMap(id=>[id,id,id]);
const game=()=>tag.createTagDuel([0,1,2,3].map(i=>({id:'v'+i,name:'Duelista '+i,cards})),{seed:'renderer'});
test('public image never requests hidden hands or set field identities; private image requests only its own hand',async()=>{
 let s=game();s=tag.stepTagDuel(s,'v0',tag.tagActions(s,'v0').find(a=>a.kind==='summon'&&a.position==='set'));const requested=[];const provider=async id=>{requested.push(id);return undefined;};
 const publicPng=await renderTag(s,undefined,provider),m=await sharp(publicPng).metadata();assert.equal(m.width,1200);assert.equal(m.height,930);assert.deepEqual(requested,[]);
 const privatePng=await renderTag(s,'v2',provider);assert.equal((await sharp(privatePng).metadata()).height,1260);assert.deepEqual(new Set(requested),new Set(tag.tagMemberHand(s,'v2').map(c=>c.id)));await assert.rejects(renderTag(s,'outsider',provider),/participa/);
});
test('missing/corrupt art still renders legible board and queue releases after provider errors',async()=>{
 let s=game();s=tag.stepTagDuel(s,'v0',tag.tagActions(s,'v0').find(a=>a.kind==='summon'&&a.position==='atk'));assert.ok((await renderTag(s,undefined,async()=>Buffer.from('badimage'))).length>10000);assert.ok((await renderTag(s,'v0',async()=>{throw Error('unavailable');})).length>10000);
});
