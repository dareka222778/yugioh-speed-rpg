const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'npc-gallery-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const db=require('../dist/database');
const ui=require('../dist/npcUI');
const engine=require('../dist/duelEngine');
const {getCard}=require('../dist/collection');
const content=require('../dist/npcContent');
const renderer=require('../dist/npcRenderer');
const sharp=require('sharp');
db.createPlayer('501','Duelo RPG');

test('every NPC gallery shows exactly the actual 30-card duel deck, not a parallel deck',()=>{
 for(const npc of content.npcs){
  assert.equal(npc.cards.length,30);
  const model=ui.galleryModel('501',Date.now(),npc.id);
  assert.deepEqual(model.cards.map(c=>c.id),[...npc.cards,...npc.extra]);
  assert.equal(model.mainCount,30);assert.equal(model.extraCount,npc.extra.length);
  assert.ok(model.cards.every(c=>getCard(c.id)&&c.summary&&c.slot));
  engine.createDuel([{id:'a',name:'A',cards:npc.cards,extra:npc.extra},{id:'b',name:'B',cards:content.npcs[1].cards}],()=>.5);
  const hero=ui.npcLobby('501',Date.now(),npc.id);
  assert.match(hero.embeds[0].toJSON().description,/30 cartas principais/);
  const links=JSON.stringify(hero.components.map(c=>c.toJSON()));
  assert.ok(links.includes(':deck:0'));
  assert.ok(!links.includes(':loadout:')&&!links.includes(':playcard:'));
 }
});

test('character carousel remains one NPC at a time and wraps in both directions',()=>{
 for(let index=0;index<content.npcs.length;index++){
  const npc=content.npcs[index],panel=ui.npcLobby('501',Date.now(),npc.id),buttons=panel.components[0].toJSON().components;
  assert.equal(panel.embeds[0].toJSON().title,npc.name);
  assert.equal(buttons[0].custom_id,`npc:gallery:501:${content.npcs[(index+content.npcs.length-1)%content.npcs.length].id}:hero:0`);
  assert.equal(buttons[1].custom_id,`npc:challenge:501:${npc.id}`);
  assert.equal(buttons[2].custom_id,`npc:gallery:501:${content.npcs[(index+1)%content.npcs.length].id}:hero:0`);
 }
});

test('every card in every NPC duel loadout has a unique reachable index and returns to its correct deck page',()=>{
 const before=db.getCollection('501');
 for(const npc of content.npcs){
  const all=[...npc.cards,...npc.extra],pages=Math.ceil(all.length/10);
  for(let page=0;page<pages;page++){
   const panel=ui.npcLobby('501',Date.now(),npc.id,'deck',page);
   const menu=panel.components[1].toJSON().components[0];
   const expected=all.slice(page*10,page*10+10);
   assert.equal(menu.options.length,expected.length);
   for(const option of menu.options){
    const position=Number(option.value),card=getCard(all[position]),detail=ui.npcLobby('501',Date.now(),npc.id,'card',position);
    assert.ok(card);
    assert.match(detail.embeds[0].toJSON().fields[0].name,new RegExp(`^${position+1}/${all.length} ·`));
    assert.equal(detail.embeds[0].toJSON().fields[1].value,require('../dist/cardText').cardRulesPT(card.id));
    assert.equal(detail.components[0].toJSON().components[1].custom_id,`npc:gallery:501:${npc.id}:deck:${page}`);
    assert.ok(!detail.components.some(r=>r.toJSON().components.some(c=>c.url)));
   }
  }
 }
 assert.deepEqual(db.getCollection('501'),before,'browsing NPC decks must never grant cards');
});

test('unsupported views, nonexistent indexes and unknown NPCs are rejected',()=>{
 for(const invalidPage of [-1,NaN,1.5,99])assert.throws(()=>ui.npcLobby('501',Date.now(),'joey','card',invalidPage));
 for(const removedView of ['loadout','playcard','archive','museum','history'])
  assert.throws(()=>ui.npcLobby('501',Date.now(),'joey',removedView,0));
 assert.throws(()=>ui.npcLobby('501',Date.now(),'joey','deck',6));
 assert.throws(()=>ui.npcLobby('501',Date.now(),'unknown'));
 assert.throws(()=>ui.npcLobby('stranger',Date.now(),'joey'),/Crie seu duelista/);
});

test('NPC interface stays within Discord control and embed limits',()=>{
 for(const npc of content.npcs){
  const last=npc.cards.length+npc.extra.length-1;
  for(const [view,page] of [['hero',0],['deck',0],['deck',Math.floor(last/10)],['card',last]]){
   const panel=ui.npcLobby('501',Date.now(),npc.id,view,page);
   assert.ok(panel.components.length<=5);
   panel.embeds.forEach(e=>e.toJSON());
   for(const row of panel.components){const components=row.toJSON().components;assert.ok(components.length<=5);for(const control of components){if(control.custom_id)assert.ok(control.custom_id.length<=100);if(control.options)assert.ok(control.options.length<=25);}}
  }
 }
});

test('bundled duelists render offline with real distinct character imagery and cache their hero screens',async()=>{
 const first=ui.galleryModel('501',Date.now(),'joey'),a=await renderer.renderNPC(first);
 const b=await renderer.renderNPC(first);
 assert.strictEqual(a,b);
 assert.deepEqual([(await sharp(a).metadata()).width,(await sharp(a).metadata()).height],[1280,720]);
 const region=await sharp(a).extract({left:820,top:100,width:300,height:400}).stats();
 assert.ok(region.channels.some(c=>c.stdev>40),'character portrait must be visible');
 const other=await renderer.renderNPC(ui.galleryModel('501',Date.now(),'kaiba'));
 assert.notDeepEqual(a,other);
});
after(()=>{db.db.close();fs.rmSync(temp,{recursive:true,force:true});});
