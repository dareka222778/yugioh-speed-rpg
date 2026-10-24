const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
test('migrates legacy database without losing account, persists customization, runs twice', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'duelist-db-'));
  const file = path.join(temp,'game.sqlite');
  process.env.DATABASE_PATH = file;
  const old = new Database(file);
  old.exec("CREATE TABLE players (discord_id TEXT PRIMARY KEY, username TEXT NOT NULL, duelist_level INTEGER NOT NULL DEFAULT 1, xp INTEGER NOT NULL DEFAULT 0, dp INTEGER NOT NULL DEFAULT 1000, starter_deck TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO players(discord_id,username,dp,starter_deck) VALUES ('123','Kise',1250,'spellcaster')");
  old.close();
  const modulePath = require.resolve('../dist/database');
  let api = require(modulePath);
  try {
    assert.equal(api.getPlayer('123').dp,1250);
    assert.equal(api.getPlayer('123').starter_deck,'spellcaster');
    api.updateProfile('123',{character_name:'Kairos',biography:'Minha história',theme:'rubi'});
    assert.equal(api.chooseStarterDeck('123','dragon'),false);
    api.db.close(); delete require.cache[modulePath]; api = require(modulePath);
    assert.equal(api.getPlayer('123').character_name,'Kairos');
    assert.equal(api.getPlayer('123').dp,1250);
    assert.equal(api.createPlayer('456','Novo').theme,'ametista');
  } finally { api.db.close(); fs.rmSync(temp,{recursive:true,force:true}); }
});
