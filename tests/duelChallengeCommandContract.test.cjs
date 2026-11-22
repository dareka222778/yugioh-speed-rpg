'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m504-duel-challenge-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const database=require('../dist/database');
const db=database.db;
const decks=require('../dist/decks');
const store=require('../dist/duelStore');
const ui=require('../dist/duelUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const source=fs.readFileSync(path.join(__dirname,'../src/index.ts'),'utf8');

const guild='m504-guild';
const channel='m504-channel';
function makePlayer(id){
  database.createPlayer(id,'Player '+id);
  database.chooseStarterDeck(id,'warrior');
  decks.openDeck(id);
  decks.activateDeck(id,1);
  return {player:database.getPlayer(id),collection:database.getCollection(id),deck:decks.openDeck(id,1)};
}
function commandSource(){
  const start=source.indexOf("new SlashCommandBuilder().setName('duelo')");
  const end=source.indexOf('];',start);
  return source.slice(start,end);
}
function handlerSource(){
  const start=source.indexOf("if(i.isChatInputCommand()&&i.commandName==='duelo')");
  const end=source.indexOf("if((i.isButton()||i.isStringSelectMenu()||i.isModalSubmit())&&i.customId.startsWith('deck:')",start);
  return source.slice(start,end);
}
function buttonIds(payload){
  return payload.components.flatMap(row=>row.toJSON().components).map(button=>button.custom_id);
}

test('/duelo desafiar is a public human-to-human command with a required opponent',()=>{
  const command=commandSource();
  assert.match(command,/addSubcommand\(c=>c\.setName\('desafiar'\)\.setDescription\('Convide outro jogador para um duelo\.'\)\.addUserOption\(o=>o\.setName\('oponente'\)\.setDescription\('Jogador que receberá o convite\.'\)\.setRequired\(true\)\)/,
    'the opponent must be a required user option');
  const handler=handlerSource();
  assert.match(handler,/await deferReply\(action==='ver'\|\|action==='sair'\?\{flags:MessageFlags\.Ephemeral\}:\{\}\)/,
    'challenge creation must not be accidentally made ephemeral');
  assert.match(handler,/const other=i\.options\.getUser\('oponente',true\);if\(other\.bot\)throw new Error\('Para enfrentar o bot, use \/duelo treino\.'\);r=challenge\(id,other\.id,i\.guildId,i\.channelId\)/,
    'bots must be redirected to the training command and human challenges must use the authenticated owner');
  assert.match(handler,/const message=await i\.editReply\(await arenaPayload\(r\)\);setDuelMessage\(r\.id,message\.channelId,message\.id,r\.revision\)/,
    'the public invitation must be published and its message/revision persisted');

  const owner='m504-public-owner',opponent='m504-public-opponent';
  const ownerData=makePlayer(owner),opponentData=makePlayer(opponent);
  const invitation=store.challenge(owner,opponent,guild,channel);
  assert.equal(invitation.status,'pending');
  assert.equal(invitation.invite.owner,owner);
  assert.equal(invitation.invite.opponent,opponent);
  assert.equal(invitation.invite.cards.length,20);
  assert.equal(store.currentDuel(owner).id,invitation.id);
  assert.equal(store.currentDuel(opponent),undefined,'the invited player is not locked before accepting');

  const payload=ui.invitationMessage(invitation);
  validateDiscordPayload(payload);
  assert.deepEqual(buttonIds(payload),[
    'duel:accept:'+invitation.id+':0',
    'duel:decline:'+invitation.id+':0'
  ]);
  assert.deepEqual(payload.allowedMentions.parse,[]);
  const serialized=JSON.stringify(payload.embeds.map(embed=>embed.toJSON()));
  for(const card of invitation.invite.cards)assert.ok(!serialized.includes(card),'public invite leaked a private card ID');
  assert.deepEqual(database.getPlayer(owner),ownerData.player);
  assert.deepEqual(database.getCollection(owner),ownerData.collection);
  assert.deepEqual(database.getPlayer(opponent),opponentData.player);
  assert.deepEqual(database.getCollection(opponent),opponentData.collection);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members').get().n,1);
});

test('only the invited human can accept; acceptance snapshots both active decks without granting inventory',()=>{
  const owner='m504-accept-owner',opponent='m504-accept-opponent',outsider='m504-accept-outsider';
  const ownerData=makePlayer(owner),opponentData=makePlayer(opponent),outsiderData=makePlayer(outsider);
  const ownerDeckBefore=ownerData.deck.items.map(item=>item.card_key);
  const opponentDeckBefore=opponentData.deck.items.map(item=>item.card_key);
  const invitation=store.challenge(owner,opponent,guild,channel);

  assert.throws(()=>store.acceptChallenge(invitation.id,outsider,guild,0),/convidado/);
  assert.throws(()=>store.acceptChallenge(invitation.id,opponent,'m504-other-guild',0),/expirou/);
  const started=store.acceptChallenge(invitation.id,opponent,guild,0);
  assert.equal(started.status,'playing');
  assert.equal(started.revision,1);
  assert.deepEqual(started.state.players.map(player=>player.id),[owner,opponent]);
  assert.equal(started.state.players[0].hand.length+started.state.players[0].deck.length,20);
  assert.equal(started.state.players[1].hand.length+started.state.players[1].deck.length,20);
  assert.equal(store.currentDuel(owner).id,invitation.id);
  assert.equal(store.currentDuel(opponent).id,invitation.id);
  assert.throws(()=>store.acceptChallenge(invitation.id,opponent,guild,0),/expirou/);

  const ownerDeckAfter=decks.openDeck(owner,1).items.map(item=>item.card_key);
  const opponentDeckAfter=decks.openDeck(opponent,1).items.map(item=>item.card_key);
  assert.deepEqual(ownerDeckAfter,ownerDeckBefore);
  assert.deepEqual(opponentDeckAfter,opponentDeckBefore);
  assert.deepEqual(database.getPlayer(owner),ownerData.player);
  assert.deepEqual(database.getCollection(owner),ownerData.collection);
  assert.deepEqual(database.getPlayer(opponent),opponentData.player);
  assert.deepEqual(database.getCollection(opponent),opponentData.collection);
  assert.deepEqual(database.getPlayer(outsider),outsiderData.player);
  assert.deepEqual(database.getCollection(outsider),outsiderData.collection);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_members WHERE duel_id=?').get(invitation.id).n,2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM duel_action_receipts').get().n,0);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
