const {test,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const sharp=require('sharp');const Module=require('node:module');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'visual-deck-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const load=Module._load;Module._load=function(name,parent,isMain){if(name==='./cardArt'&&parent.filename.endsWith('/dist/deckRenderer.js'))return {getCardArt:async()=>undefined};return load.apply(this,arguments);};
const {renderDeck,renderOwnedCard}=require('../dist/deckRenderer');Module._load=load;
const db=require('../dist/database');const {openDeck}=require('../dist/decks');const {visualDeckMessage,visualDeckCard}=require('../dist/deckUI');
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
test('custom owned-card detail is a readable 1200x720 blue PNG with real art or local fallback',async()=>{
 const art=await sharp({create:{width:200,height:300,channels:3,background:'#e53045'}}).jpeg().toBuffer();
 const canvas={id:visible[0],deckName:'Meu Deck Azul',inDeck:2,owned:2,index:0,total:12};
 const png=await renderOwnedCard(canvas,async()=>art),size=await sharp(png).metadata();
 assert.deepEqual([size.width,size.height],[1200,720]);
 const {data}=await sharp(png).extract({left:100,top:200,width:1,height:1}).raw().toBuffer({resolveWithObject:true});
 assert.ok(data[0]>180&&data[1]<90&&data[2]<110,'the card artwork must appear on the branded sheet');
 const fallback=await renderOwnedCard(canvas,async()=>undefined);
 assert.ok(fallback.length>12000);
 const message=await visualDeckCard('101',1,0);
 assert.equal(message.files.length,1);
 assert.equal(message.files[0].name,'minha-carta.png');
 assert.equal((await sharp(message.files[0].attachment).metadata()).height,720);
 assert.equal(message.embeds[0].toJSON().image.url,'attachment://minha-carta.png');
 for(const row of message.components)row.toJSON();
});
test('owned-card navigation never duplicates IDs for collections with one or two cards',()=>{
 const {deckCardMessage}=require('../dist/deckUI');
 for(let n=1;n<=2;n++){
  const id='small-'+n;db.createPlayer(id,'Small');openDeck(id);for(let i=0;i<n;i++)db.db.prepare('INSERT INTO player_cards(discord_id,card_key,quantity) VALUES(?,?,?)').run(id,['91152256','86318356'][i],1);
  for(let index=0;index<n;index++){const p=deckCardMessage(id,1,index);const ids=p.components.flatMap(row=>row.toJSON().components.map(c=>c.custom_id));assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,n);}
 }
});
after(()=>{db.db.close();fs.rmSync(temp,{recursive:true,force:true});});
