'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/index.ts'), 'utf8');

function between(startToken, endToken, label) {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, label + ' start marker must exist');
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, label + ' end marker must exist');
  return source.slice(start, end);
}

const commandSchema = between(
  "new SlashCommandBuilder().setName('deck')",
  "new SlashCommandBuilder().setName('npc')",
  'Deck slash-command schema'
);
const slashHandler = between(
  "if(i.commandName==='deck'){",
  "if (i.commandName === 'ping')",
  'Deck slash-command handler'
);
const componentRouter = between(
  "if((i.isButton()||i.isStringSelectMenu()||i.isModalSubmit())&&i.customId.startsWith('deck:'))",
  "if (i.isChatInputCommand())",
  'Deck component router'
);

test('the /deck command exposes all six supported subcommands and bounds every slot to 1–3', () => {
  const expected = ['ver', 'adicionar', 'remover', 'nome', 'ativar', 'inicial'];
  for (const name of expected) {
    assert.ok(commandSchema.includes("setName('" + name + "')"), 'missing /deck ' + name);
  }
  assert.equal((commandSchema.match(/\.addSubcommand\(/g) || []).length, 6);
  const slotBounds = commandSchema.match(/setName\('espaco'\)\.setDescription\('Deck 1, 2 ou 3\.'\)\.setMinValue\(1\)\.setMaxValue\(3\)/g) || [];
  assert.equal(slotBounds.length, 6, 'every subcommand must constrain the slot to 1–3');
  assert.equal((commandSchema.match(/setName\('quantidade'\)[^\n]*?setMinValue\(1\)\.setMaxValue\(3\)/g) || []).length, 2,
    'add and remove quantities must be limited to 1–3 copies');
  assert.ok(commandSchema.includes("setName('texto').setDescription('Nome do deck.').setRequired(true).setMaxLength(32)"));
  assert.ok(commandSchema.includes("setName('carta').setDescription('Nome ou ID da carta.').setRequired(true).setAutocomplete(true)"));
});

test('the /deck slash handler keeps edits private and delegates to the revision-aware Deck services', () => {
  assert.ok(slashHandler.includes("await deferReply({flags:MessageFlags.Ephemeral})"));
  assert.ok(slashHandler.includes("const slot=i.options.getInteger('espaco')??1"));
  assert.ok(slashHandler.includes("const action=i.options.getSubcommand()"));
  assert.ok(slashHandler.includes("const card=exactCard(query)"));
  assert.ok(slashHandler.includes("changeDeck(id,slot,card.id,(i.options.getInteger('quantidade')??1)*(action==='adicionar'?1:-1))"));
  assert.ok(slashHandler.includes("renameDeck(id,slot,i.options.getString('texto',true))"));
  assert.ok(slashHandler.includes("activateDeck(id,slot)"));
  assert.ok(slashHandler.includes("fillInitialDeck(id,slot)"));
  assert.ok(slashHandler.includes("visualDeckMessage(id,slot,1,selected)"));
});

test('Deck component interactions reject another owner and stale revisions before any mutation or acknowledgement', () => {
  const ownerGuard = componentRouter.indexOf('if(owner!==id)');
  const firstDatabaseRead = componentRouter.indexOf('openDeck(id,slot)');
  const firstAcknowledgement = componentRouter.indexOf('deferUpdate()');
  const revisionGuard = componentRouter.indexOf('if(!Number.isSafeInteger(revision)||!Number.isSafeInteger(page))');
  const firstMutation = componentRouter.indexOf("changeDeck(id,slot,cardId,1,revision)");

  assert.ok(ownerGuard >= 0 && ownerGuard < firstDatabaseRead);
  assert.ok(ownerGuard < firstAcknowledgement, 'a foreign owner must be rejected before Discord acknowledgement');
  assert.ok(revisionGuard > ownerGuard && revisionGuard < firstMutation);
  assert.ok(componentRouter.includes("changeDeck(id,slot,cardId,1,revision)"));
  assert.ok(componentRouter.includes("changeDeck(id,slot,cardId,-1,revision)"));
  assert.ok(componentRouter.includes("activateDeck(id,slot,revision)"));
  assert.ok(componentRouter.includes("fillInitialDeck(id,slot,revision)"));
  assert.ok(componentRouter.includes("renameDeck(id,slot,i.fields.getTextInputValue('name'),revision)"));
  assert.ok(componentRouter.includes("deck.revision!==revision"));
});
