const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'duelist-test-'));
process.env.DATABASE_PATH = path.join(temp, 'game.sqlite');
const { profileMessage, validateProfile, portraitPath } = require('../dist/profile');
const { savePortrait, removePortrait, imageExtension } = require('../dist/portrait');
const { renderCard, xml, wrapText } = require('../dist/cardRenderer');
const { isStarterDeck } = require('../dist/starterDecks');
const player = { discord_id:'123', username:'Kise', character_name:'Kairos', biography:'O coração das cartas.', theme:'ouro', duelist_level:1, xp:0, dp:1000, starter_deck:'spellcaster' };
const avatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
test('profile is one image, includes accessible real stats and private controls', async () => {
  const payload = await profileMessage(player, avatar);
  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.color,0xf1c40f); assert.equal(embed.image.url,'attachment://ficha-duelista.png');
  assert.match(payload.files[0].description,/1000 DP/);
  assert.equal(payload.components[0].toJSON().components.length,3);
  assert.equal((await profileMessage(player,avatar,false)).components.length,0);
  const meta = await sharp(payload.files[0].attachment).metadata();
  assert.equal(meta.width,1000); assert.equal(meta.height,760);
});
test('validation rejects invalid theme, empty/long name and long bio', () => {
  for (const input of [['','bio','ouro'],['x'.repeat(33),'','ouro'],['K','x'.repeat(241),'ouro'],['K','','__proto__']]) assert.throws(() => validateProfile(...input));
  assert.equal(validateProfile(' Kise ','','rubi').character_name,'Kise');
  assert.equal(isStarterDeck('__proto__'),false);
});
test('portrait enforces CDN, size and signature without network', async () => {
  await assert.rejects(savePortrait('123',{url:'https://example.com/a',size:1}));
  await assert.rejects(savePortrait('123',{url:'https://cdn.discordapp.com/a',size:3e6}));
  assert.throws(() => portraitPath('../x')); assert.throws(() => imageExtension(Buffer.from('<svg/>')));
});
test('upload persists bytes, integrates portrait in card and removes it', async () => {
  const original = global.fetch;
  const bytes = await sharp({create:{width:50,height:80,channels:3,background:'#ff0000'}}).png().toBuffer();
  global.fetch = async () => new Response(bytes);
  try {
    await savePortrait('123',{url:'https://cdn.discordapp.com/attachments/1/2/image.png',size:bytes.length});
    assert.deepEqual(fs.readFileSync(portraitPath('123')),bytes);
    const withPhoto = (await profileMessage(player,avatar)).files[0].attachment;
    const pixel = await sharp(withPhoto).extract({left:222,top:300,width:1,height:1}).raw().toBuffer();
    assert.equal(pixel[0],255); assert.equal(pixel[1],0);
    await removePortrait('123');
    const withoutPhoto = (await profileMessage(player,avatar)).files[0].attachment;
    assert.notDeepEqual(withPhoto,withoutPhoto);
  } finally { global.fetch = original; }
});
test('long names, full bio, XML characters, all themes and broken portraits render', async () => {
  assert.equal(xml('<&>'), '&lt;&amp;&gt;');
  assert.ok(wrapText('W'.repeat(240),38).every(l=>Array.from(l).length<=38));
  for (const theme of ['ametista','ouro','oceano','rubi','esmeralda']) {
    const out = await renderCard({...player,theme,character_name:'W'.repeat(32),biography:'<&> '.repeat(60)}, Buffer.from('broken'));
    assert.equal((await sharp(out).metadata()).width,1000);
    assert.ok(out.length<2e6);
  }
});
test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
test('welcome screen renders and cached rendering is reused', async () => {
  const {renderWelcome}=require('../dist/cardRenderer');
  const a=await renderWelcome(); const b=await renderWelcome();
  assert.equal(a,b); assert.equal((await sharp(a).metadata()).width,1000);
});
