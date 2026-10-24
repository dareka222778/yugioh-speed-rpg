const {test,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const sharp=require('sharp');const Module=require('node:module');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'duel-ui-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const load=Module._load;Module._load=function(name,parent){if(name==='./cardArt'&&parent.filename.endsWith('/dist/duelRenderer.js'))return {getCardArt:async()=>undefined};return load.apply(this,arguments);};
const {renderDuel}=require('../dist/duelRenderer');Module._load=load;
const {createDuel,step}=require('../dist/duelEngine');const {publicDuelData,duelPrivateMessage,duelCardMessage,duelPublicMessage,visualDuelPrivate,visualDuelPublic,invitationMessage}=require('../dist/duelUI');const db=require('../dist/database');const {starterContents}=require('../dist/cardCatalog');
const ids=style=>starterContents[style].flatMap(c=>Array(c.quantity).fill(c.id));
let s=createDuel([{id:'101',name:'Kise',cards:ids('warrior')},{id:'102',name:'Oponente',cards:ids('spellcaster')}],()=>.5);
const m={uid:'hidden',id:'15025844',position:'def',faceUp:false,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0};s.players[1].monsters=[m];s.players[1].backrow=[{uid:'set-trap',id:'44209392',setTurn:1,faceUp:false}];
function record(){return {id:'d',guild_id:'g',channel_id:'c',message_id:null,status:'playing',revision:0,updated:Date.now(),state:s,invite:null};}
test('public projection never includes hand, deck order, face-down IDs or internal card UIDs',()=>{
 const data=publicDuelData(s);assert.equal(data.players[1].monsters[0].id,null);assert.equal(data.players[1].backrow[0].id,null);assert.equal('hand' in data.players[1],false);assert.equal('deck' in data.players[1],false);
 const text=JSON.stringify(duelPublicMessage(record()).embeds.map(e=>e.toJSON()));assert.ok(!text.includes('15025844'));assert.ok(!text.includes('44209392'));assert.ok(!text.includes('hidden'));assert.throws(()=>duelPrivateMessage(record(),'stranger'),/participantes/);
});
test('public renderer never requests hidden art; private renderer requests only own hand and own hidden cards',async()=>{
 const publicRequests=[];const image=await renderDuel(s,undefined,async id=>{publicRequests.push(id);return undefined;});assert.equal(publicRequests.length,0);assert.equal((await sharp(image).metadata()).height,1020);
 const requests=[];await renderDuel(s,'101',async id=>{requests.push(id);return undefined;});const own=new Set(s.players[0].hand.map(c=>c.id));assert.deepEqual(new Set(requests),own);
 const privateRequests=[];await renderDuel(s,'102',async id=>{privateRequests.push(id);return undefined;});assert.ok(privateRequests.includes('15025844')&&privateRequests.includes('44209392'));
});
test('PNG attachments, menus and invitations serialize within Discord limits, and final/no-actions panels work',async()=>{
 for(const owner of ['101','102'])for(const page of [-1,1,999]){const p=duelPrivateMessage(record(),owner,page);assert.ok(p.components.length<=5);for(const row of p.components){const data=row.toJSON();for(const c of data.components){assert.ok(c.custom_id.length<=100);if(c.options)assert.ok(c.options.length<=25);}}for(const e of p.embeds)e.toJSON();}
 const pub=await visualDuelPublic(record());assert.equal(pub.files.length,1);assert.equal(pub.embeds[0].toJSON().image.url,'attachment://campo-duelo.png');
 const privatePanel=await visualDuelPrivate(record(),'101');assert.equal(privatePanel.files.length,2);assert.equal((await sharp(privatePanel.files[0].attachment).metadata()).height,340);assert.equal((await sharp(privatePanel.files[1].attachment).metadata()).height,1020);
 const inv={...record(),status:'pending',state:null,invite:{owner:'101',opponent:'102',name:'Kise',cards:ids('warrior')}};for(const row of invitationMessage(inv).components)row.toJSON();
 const done={...record(),status:'finished',state:step(s,'101',{kind:'concede'})};assert.equal(duelPrivateMessage(done,'101').components.length,0);
});
test('identical views reuse the PNG cache, with isolation by viewer and invalidation after a draw',async()=>{
 const a=await renderDuel(s);assert.strictEqual(await renderDuel(s),a);const own=await renderDuel(s,'101');assert.notStrictEqual(own,a);assert.strictEqual(await renderDuel(s,'101'),own);const next=structuredClone(s);next.players[0].hand.push(next.players[0].deck.shift());assert.notStrictEqual(await renderDuel(next,'101'),own);
});
test('uploaded card back is rendered from the asset and rotated as a whole for face-down DEF',async()=>{
 const {CARD_BACK_PNG,CARD_BACK_WIDTH,CARD_BACK_HEIGHT}=require('../dist/cardBackAsset');const asset=Buffer.from(CARD_BACK_PNG,'base64');const metadata=await sharp(asset).metadata();assert.equal(metadata.width,CARD_BACK_WIDTH);assert.equal(metadata.height,CARD_BACK_HEIGHT);
 const png=await renderDuel(s,undefined,async()=>undefined);const actual=await sharp(png).extract({left:350,top:332,width:172,height:119}).removeAlpha().raw().toBuffer();
 const expected=await sharp(asset).rotate(90).resize(172,119,{fit:'contain',background:'#55484c'}).removeAlpha().raw().toBuffer();let error=0;for(let n=0;n<actual.length;n++)error+=Math.abs(actual[n]-expected[n]);assert.ok(error/actual.length<12,'DEF back must match the supplied portrait image rotated 90 degrees');
});
test('hand inspector is per-card, owner-only, and offers original legal-action indexes',()=>{
 const r=record(),hand=s.players[0].hand;
 assert.ok(hand.length>=2);
 const panel=duelCardMessage(r,'101',0);
 assert.match(panel.embeds[0].toJSON().title,/1\\/4/);
 assert.equal(panel.cardId,hand[0].id);
 assert.ok(panel.components[0].toJSON().components[0].custom_id.startsWith('duel:card:'));
 assert.ok(panel.components[0].toJSON().components[2].custom_id.endsWith(':1'));
 const other=duelCardMessage(r,'101',1);
 assert.equal(other.cardId,hand[1].id);
 const own=duelPrivateMessage(r,'101');
 const picker=own.components.find(row=>row.toJSON().components[0].custom_id?.startsWith('duel:card:'));
 assert.ok(picker);assert.equal(picker.toJSON().components[0].options.length,hand.length);
});
test('card-by-card controls never expose opponent hidden IDs or cards to other users',()=>{
 const r=record();
 assert.throws(()=>duelCardMessage(r,'intruder',0),/participantes/);
 assert.throws(()=>duelCardMessage(r,'101',-1),/mão/);
 assert.throws(()=>duelCardMessage(r,'101',9999),/mão/);
 assert.throws(()=>duelCardMessage(r,'101',NaN),/mão/);
 const data=JSON.stringify(duelCardMessage(r,'101',0).embeds[0].toJSON());
 assert.ok(!data.includes('15025844'));assert.ok(!data.includes('44209392'));
 const victim=duelCardMessage(r,'102',0);
 assert.equal(victim.cardId,s.players[1].hand[0].id);
});
test('new Azure palette satisfies text contrast and preserves public/private renderer isolation',()=>{
 const {azure,contrast,duelLayout}=require('../dist/duelTheme');
 assert.ok(contrast(azure.text,azure.deep)>=7);
 assert.ok(contrast(azure.muted,azure.surface)>=4.5);
 assert.equal(duelLayout.width,1400);assert.equal(duelLayout.zoneCount,3);
});
after(()=>{db.db.close();fs.rmSync(temp,{recursive:true,force:true});});
