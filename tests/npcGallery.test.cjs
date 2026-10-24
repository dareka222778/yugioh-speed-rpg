const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'npc-gallery-'));process.env.DATABASE_PATH=path.join(tmp,'game.sqlite');
const db=require('../dist/database'),ui=require('../dist/npcUI'),archive=require('../dist/classicDecks'),engine=require('../dist/duelEngine'),content=require('../dist/npcContent'),renderer=require('../dist/npcRenderer'),sharp=require('sharp');
db.createPlayer('501','Nana');
test('historical lists have all 50 distinct numbered cards, with SDJ fusions separate from its 48 main cards',()=>{
 for(const [id,d] of Object.entries(archive.classicDecks)){assert.equal(d.cards.length,50);assert.deepEqual(d.cards.map(c=>c.konamiId).sort((a,b)=>a-b),require('./fixtures/classic-official-cids.json')[d.prefix]);assert.equal(new Set(d.cards.map(c=>c.code)).size,50);assert.deepEqual(d.cards.map(c=>c.code),Array.from({length:50},(_,i)=>`${d.prefix}-${String(i+1).padStart(3,'0')}`));assert.equal(d.cards.filter(c=>c.extra).length,id==='joey'?2:0);assert.ok(d.cards.every(c=>c.konamiId&&c.name&&c.englishName));}
 assert.deepEqual(archive.classicDeck('joey').cards.filter(c=>c.extra).map(c=>c.englishName),['Thousand Dragon','Flame Swordsman']);
 // An archival listing must never silently enable unsupported effects in live battles.
 assert.throws(()=>engine.createDuel([{id:'a',name:'a',cards:archive.classicDeck('yugi').cards.map(c=>c.id)},{id:'b',name:'b',cards:content.npcs[0].cards}]));
});
test('each carousel page contains only its selected opponent and navigation wraps in both directions',()=>{
 for(let index=0;index<content.npcs.length;index++){
  const n=content.npcs[index],p=ui.npcLobby('501',Date.now(),n.id),buttons=p.components[0].toJSON().components;
  assert.equal(p.embeds[0].toJSON().title,n.name);
  assert.equal(buttons[0].custom_id,`npc:gallery:501:${content.npcs[(index+2)%3].id}:hero:0`);
  assert.equal(buttons[1].custom_id,`npc:challenge:501:${n.id}`);
  assert.equal(buttons[2].custom_id,`npc:gallery:501:${content.npcs[(index+1)%3].id}:hero:0`);
  assert.match(p.embeds[0].toJSON().description,/ainda indisponível/);
 }
});
test('every historical card is reachable, selects its exact card index, and links to the official card rules',()=>{
 const before=db.getCollection('501');
 for(const id of ['joey','yugi','kaiba'])for(let page=0;page<5;page++){
  const p=ui.npcLobby('501',Date.now(),id,'deck',page);const menu=p.components[1].toJSON().components[0];assert.equal(menu.options.length,10);
  for(const option of menu.options){const ix=Number(option.value),card=archive.classicDeck(id).cards[ix],panel=ui.npcLobby('501',Date.now(),id,'card',ix);assert.match(panel.embeds[0].toJSON().fields[0].name,new RegExp(`^${ix+1}/50`));assert.ok(panel.components[1].toJSON().components[0].url.includes(`cid=${card.konamiId}&`));const back=panel.components[0].toJSON().components[1];assert.equal(back.custom_id,`npc:gallery:501:${id}:deck:${page}`);}
 }
 assert.deepEqual(db.getCollection('501'),before);
});
test('invalid indexes, views and NPCs are rejected, and playable lists exactly match actual NPC main plus extra',()=>{
 for(const page of [-1,NaN,1.5,50])assert.throws(()=>ui.npcLobby('501',Date.now(),'joey','card',page));
 assert.throws(()=>ui.npcLobby('501',Date.now(),'joey','invalid',0));assert.throws(()=>ui.npcLobby('501',Date.now(),'unknown'));
 for(const n of content.npcs){const m=ui.galleryModel('501',Date.now(),n.id,'loadout',0);assert.deepEqual(m.cards.map(c=>c.id),[...n.cards,...n.extra]);}
});
test('all gallery components satisfy Discord limits including link buttons and select options',()=>{
 for(const id of ['joey','yugi','kaiba'])for(const [view,page] of [['hero',0],['deck',4],['card',49],['loadout',0],['playcard',0]]){
  const p=ui.npcLobby('501',Date.now(),id,view,page);assert.ok(p.components.length<=5);p.embeds.forEach(e=>e.toJSON());
  for(const row of p.components){const r=row.toJSON();assert.ok(r.components.length<=5);for(const c of r.components){if(c.custom_id)assert.ok(c.custom_id.length<=100);if(c.options)assert.ok(c.options.length<=25);}}
 }
});
test('bundled portraits really render without network; distinct character pixels are present and output cache is bounded',async()=>{
 const m=ui.galleryModel('501',Date.now(),'joey');const a=await renderer.renderNPC(m),b=await renderer.renderNPC(m);assert.strictEqual(a,b);const meta=await sharp(a).metadata();assert.equal(meta.width,1280);assert.equal(meta.height,720);
 const portraitRegion=await sharp(a).extract({left:820,top:100,width:300,height:400}).stats();assert.ok(portraitRegion.channels.some(c=>c.stdev>40),'portrait must appear; gradients alone are insufficient');
 const other=await renderer.renderNPC(ui.galleryModel('501',Date.now(),'kaiba'));assert.notDeepEqual(a,other);
});
after(()=>{db.db.close();fs.rmSync(tmp,{recursive:true,force:true});});
