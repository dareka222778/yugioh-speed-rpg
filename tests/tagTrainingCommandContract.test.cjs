'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m498-training-command-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const {db,createPlayer,chooseStarterDeck}=require('../dist/database');
const decks=require('../dist/decks');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const ui=require('../dist/tagUI');
const {getNPC}=require('../dist/npcContent');
const {getCard}=require('../dist/collection');
const {validateDiscordPayload}=require('../dist/discordPayload');
const source=fs.readFileSync(path.join(__dirname,'../src/index.ts'),'utf8');

function physical(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function sorted(values){return [...values].sort();}
function loadout(deck){
  const main=deck.items.filter(item=>!getCard(item.card_key)?.fusion)
    .flatMap(item=>Array(item.quantity).fill(item.card_key));
  const extra=deck.items.filter(item=>getCard(item.card_key)?.fusion)
    .flatMap(item=>Array(item.quantity).fill(item.card_key));
  return {main,extra};
}
function economy(owner){
  return JSON.stringify({
    player:db.prepare('SELECT * FROM players WHERE discord_id=?').get(owner),
    cards:db.prepare('SELECT * FROM player_cards WHERE discord_id=? ORDER BY card_key').all(owner),
    grants:db.prepare('SELECT * FROM starter_grants WHERE discord_id=? ORDER BY starter_deck').all(owner),
    decks:db.prepare('SELECT * FROM decks WHERE discord_id=? ORDER BY slot').all(owner),
    deckCards:db.prepare('SELECT * FROM deck_cards WHERE discord_id=? ORDER BY slot,card_key').all(owner)
  });
}
function verifyPanels(record,owner){
  const publicPayload=ui.tagPublicMessage(record);
  validateDiscordPayload(publicPayload);
  const rendered=JSON.stringify(publicPayload);
  for(const card of tag.tagMemberHand(record.state,owner)){
    assert.ok(!rendered.includes(card.uid),'public /dupla treino panel leaked the owner private hand UID');
  }
  validateDiscordPayload(ui.tagPrivateMessage(record,owner));
}

test('/dupla treino exposes all supported deck choices, defaults to Yugi and uses the public training reply',()=>{
  const commandStart=source.indexOf("new SlashCommandBuilder().setName('dupla')");
  const commandEnd=source.indexOf("new SlashCommandBuilder().setName('ajuda')",commandStart);
  assert.ok(commandStart>=0&&commandEnd>commandStart,'the /dupla command builder must exist');
  const command=source.slice(commandStart,commandEnd);
  assert.match(command,/addSubcommand\(c=>c\.setName\('treino'\)/);
  assert.match(command,/setName\('deck'\)/);
  for(const choice of ["value:'yugi'","value:'joey'","value:'kaiba'","value:'meu_deck'"])assert.ok(command.includes(choice),'missing /dupla treino choice '+choice);

  const handlerStart=source.indexOf("if(i.isChatInputCommand()&&i.commandName==='dupla')");
  const handlerEnd=source.indexOf("if(i.isChatInputCommand()&&['ajuda','regras']",handlerStart);
  assert.ok(handlerStart>=0&&handlerEnd>handlerStart,'the real /dupla interaction handler must exist');
  const handler=source.slice(handlerStart,handlerEnd);
  assert.match(handler,/deferReply\(sub==='convidar'\|\|sub==='campo'\|\|sub==='treino'\?\{\}:\{flags:MessageFlags\.Ephemeral\}\)/,
    '/dupla treino must publish a normal channel reply, not an ephemeral private lobby');
  assert.match(handler,/if\(sub==='treino'\)\{\s*const r=runTagBots\(createTagTraining\(id,i\.guildId,i\.channelId,i\.options\.getString\?\.\('deck'\)\?\?'yugi'\)\.id\)/,
    'the selected deck and Yugi default must reach the real TagDuel training store');
  assert.match(handler,/await i\.editReply\(await visualTagPublic\(r\)\)/);
  assert.match(handler,/setTagMessage\(r\.id,message\.id\);markTagPublished\(r\.id,r\.revision\)/,
    'the public training panel must be persisted and marked published');
});

test('Yugi default and meu_deck training preserve physical loadouts and player economy',()=>{
  const yugiOwner='m498-yugi-owner';
  createPlayer(yugiOwner,yugiOwner);
  const yugiBefore=economy(yugiOwner);
  const yugi=store.createTagTraining(yugiOwner,'m498-guild','m498-channel');
  assert.equal(yugi.status,'playing');
  assert.equal(yugi.state.mode,'tag-classic');
  assert.equal(yugi.members.filter(member=>member.automated).length,3);
  const yugiPhysical=physical(yugi.state,0);
  const npc=getNPC('yugi');
  assert.deepEqual(sorted([...yugiPhysical.deck,...yugiPhysical.hand].map(card=>card.id)),sorted(npc.cards));
  assert.deepEqual(sorted(yugiPhysical.extra.map(card=>card.id)),sorted(npc.extra));
  verifyPanels(yugi,yugiOwner);
  assert.equal(economy(yugiOwner),yugiBefore,'Yugi training must not mutate the human collection or economy');
  store.quitTag(yugi.id,yugiOwner,'m498-guild',yugi.revision);

  const owned='m498-owned-owner';
  createPlayer(owned,owned);
  assert.equal(chooseStarterDeck(owned,'warrior'),true);
  const opened=decks.openDeck(owned,1);
  assert.equal(opened.errors.length,0);
  assert.equal(decks.activateDeck(owned,1).active,1);
  const expected=loadout(decks.openDeck(owned,1));
  assert.ok(expected.main.length>=20&&expected.main.length<=30);
  assert.ok(expected.extra.length<=5);
  const before=economy(owned);
  const training=store.createTagTraining(owned,'m498-guild','m498-channel','meu_deck');
  assert.equal(training.status,'playing');
  assert.equal(training.state.mode,'tag-classic');
  const ownerPhysical=physical(training.state,0);
  assert.deepEqual(sorted([...ownerPhysical.deck,...ownerPhysical.hand].map(card=>card.id)),sorted(expected.main));
  assert.deepEqual(sorted(ownerPhysical.extra.map(card=>card.id)),sorted(expected.extra));
  assert.equal(tag.tagMemberHand(training.state,owned).length,4);
  verifyPanels(training,owned);
  assert.equal(economy(owned),before,'meu_deck training must not consume, grant or rewrite owned cards/decks');
  store.quitTag(training.id,owned,'m498-guild',training.revision);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
