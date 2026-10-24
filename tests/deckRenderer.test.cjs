const {test,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const sharp=require('sharp');const Module=require('node:module');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'visual-deck-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const load=Module._load;Module._load=function(name,parent,isMain){if(name==='./cardArt'&&parent.filename.endsWith('/dist/deckRenderer.js'))return {getCardArt:async()=>undefined};return load.apply(this,arguments);};
const {renderDeck}=require('../dist/deckRenderer');Module._load=load;
const db=require('../dist/database');const {openDeck}=require('../dist/decks');const {visualDeckMessage}=require('../dist/deckUI');
db.createPlayer('101','Kise');db.chooseStarterDeck('101','spellcaster');
const deck=openDeck('101');const visible=deck.items.slice(0,6).map(c=>c.card_key);const owned=db.getCollection('101');
test('six real image inputs appear as pixels in their slots and selected-card inspector; fallback and empty decks render',async()=>{
 const jpeg=await sharp({create:{width:222,height:322,channels:3,background:'#e53045'}}).jpeg().toBuffer();const requested=[];
 const image=await renderDeck({deck,visible,owned,selected:visible[0],page:1,pages:2},async id=>{requested.push(id);return jpeg;});
 assert.equal(requested.length,6);const meta=await sharp(image).metadata();assert.equal(meta.width,1200);assert.equal(meta.height,1090);
 for(const [left,top]of [[60,200],[340,200],[620,200],[60,620],[340,620],[620,620],[940,300]]){
  const {data}=await sharp(image).extract({left,top,width:1,height:1}).raw().toBuffer({resolveWithObject:true});assert.ok(data[0]>200&&data[1]<80&&data[2]<100,`card art missing at ${left},${top}`);
 }
 const fallback=await renderDeck({deck,visible,owned,selected:visible[0],page:1,pages:2},async()=>{throw Error('offline');});assert.ok(fallback.length>10000);
 const empty=await renderDeck({deck:openDeck('101',2),visible:[],owned, page:1,pages:1});assert.ok(empty.length>10000);
});
test('visual Discord payload attaches one PNG, replaces stale attachments and retains the interactive controls',async()=>{
 const p=await visualDeckMessage('101');assert.equal(p.files.length,1);assert.equal(p.files[0].name,'oficina-de-decks.png');assert.deepEqual(p.attachments,[]);
 assert.equal(p.embeds[0].toJSON().image.url,'attachment://oficina-de-decks.png');assert.equal(p.embeds[0].toJSON().fields?.length??0,0);assert.equal(p.components.length,4);for(const row of p.components)row.toJSON();
 const p2=await visualDeckMessage('101',2);assert.equal(p2.files.length,1);
});
after(()=>{db.db.close();fs.rmSync(temp,{recursive:true,force:true});});
