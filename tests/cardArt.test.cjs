const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const sharp=require('sharp');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'card-art-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');const {getCardArt}=require('../dist/cardArt');
test('card art is cached once and failures/unknown IDs do not block card lookup',async()=>{
 const original=global.fetch;let calls=0;const jpg=await sharp({create:{width:8,height:8,channels:3,background:'#e1a464'}}).jpeg().toBuffer();
 global.fetch=async()=>{calls++;return new Response(jpg);};
 try{
  const results=await Promise.all([getCardArt('91152256'),getCardArt('91152256')]);assert.deepEqual(results[0],jpg);assert.equal(calls,1);
  assert.deepEqual(await getCardArt('91152256'),jpg);assert.equal(calls,1);
  assert.equal(await getCardArt('../private'),undefined);assert.equal(calls,1);
  global.fetch=async()=>{calls++;return new Response('unavailable',{status:503});};
  assert.equal(await getCardArt('15025844'),undefined);assert.equal(await getCardArt('15025844'),undefined);assert.equal(calls,2);
 }finally{global.fetch=original;fs.rmSync(temp,{recursive:true,force:true});}
});
