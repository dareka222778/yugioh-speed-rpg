const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'duelist-test-'));
process.env.DATABASE_PATH = path.join(temp, 'game.sqlite');
const { profileMessage, validateProfile, portraitPath } = require('../dist/profile');
const { savePortrait, removePortrait, imageExtension } = require('../dist/portrait');
const { isStarterDeck } = require('../dist/starterDecks');
const player = { discord_id:'123', username:'Kise', character_name:'Kairos', biography:'O coração das cartas.', theme:'ouro', duelist_level:1, xp:0, dp:1000, starter_deck:'spellcaster' };
const avatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
test('profile preserves real stats and renders Discord payload', () => {
  const payload = profileMessage(player, avatar);
  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.title,'Kairos'); assert.equal(embed.color,0xf1c40f);
  assert.equal(embed.fields[2].value,'1.000 DP');
  assert.match(embed.fields[3].value,/Feiticeiros/);
  assert.equal(payload.components[0].toJSON().components.length,3);
  assert.equal(profileMessage(player,avatar,false).components.length,0);
});
test('validation rejects invalid theme, empty/long name and long bio', () => {
  for (const input of [['','bio','ouro'],['x'.repeat(33),'','ouro'],['K','x'.repeat(241),'ouro'],['K','','__proto__']]) assert.throws(() => validateProfile(...input));
  assert.equal(validateProfile(' Kise ','','rubi').character_name,'Kise');
  assert.equal(isStarterDeck('__proto__'),false);
});
test('portrait enforces CDN, size and signature without network', async () => {
  await assert.rejects(savePortrait('123',{url:'https://example.com/a',size:1}));
  await assert.rejects(savePortrait('123',{url:'https://cdn.discordapp.com/a',size:3e6}));
  assert.throws(() => portraitPath('../x'));
  assert.throws(() => imageExtension(Buffer.from('<svg/>')));
});
test('upload persists bytes, displays portrait after reload, removes it', async () => {
  const original = global.fetch;
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=', 'base64');
  global.fetch = async () => new Response(bytes);
  try {
    await savePortrait('123',{url:'https://cdn.discordapp.com/attachments/1/2/image.png',size:bytes.length});
    assert.deepEqual(fs.readFileSync(portraitPath('123')),bytes);
    const payload = profileMessage(player,avatar);
    assert.equal(payload.embeds[0].toJSON().image.url,'attachment://personagem.png');
    assert.equal(payload.files.length,1);
    await removePortrait('123');
    assert.equal(profileMessage(player,avatar).files.length,0);
  } finally { global.fetch = original; fs.rmSync(temp,{recursive:true,force:true}); }
});
