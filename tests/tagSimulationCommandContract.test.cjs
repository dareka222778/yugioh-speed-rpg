'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'m501-tag-simulation-'));
process.env.DATABASE_PATH=path.join(folder,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];

const {db}=require('../dist/database');
const store=require('../dist/tagStore');
const {simulateTag,tagSimulationMessage}=require('../dist/tagSimulation');
const {validateDiscordPayload}=require('../dist/discordPayload');
const source=fs.readFileSync(path.join(__dirname,'../src/index.ts'),'utf8');
const simulationSource=fs.readFileSync(path.join(__dirname,'../src/tagSimulation.ts'),'utf8');

function persistentSnapshot(){
  const names=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
  const result={};
  for(const table of ['players','player_cards','starter_grants','decks','deck_cards','tag_sessions','tag_members']){
    if(names.has(table))result[table]=db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all();
  }
  return JSON.stringify(result);
}

test('/dupla simular is ephemeral and runs only the isolated normal-monster laboratory',()=>{
  const commandStart=source.indexOf("new SlashCommandBuilder().setName('dupla')");
  const commandEnd=source.indexOf("new SlashCommandBuilder().setName('ajuda')",commandStart);
  const command=source.slice(commandStart,commandEnd);
  assert.match(command,/addSubcommand\(c=>c\.setName\('simular'\)/);
  assert.match(command,/apenas monstros normais; não é uma partida humana/);

  const handlerStart=source.indexOf("if(i.isChatInputCommand()&&i.commandName==='dupla')");
  const handlerEnd=source.indexOf("if(i.isChatInputCommand()&&['ajuda','regras']",handlerStart);
  const handler=source.slice(handlerStart,handlerEnd);
  assert.match(handler,/deferReply\(sub==='convidar'\|\|sub==='campo'\|\|sub==='treino'\?\{\}:\{flags:MessageFlags\.Ephemeral\}\)/,
    'simulation must be an ephemeral response');
  assert.match(handler,/if\(sub==='simular'\)\{await i\.editReply\(tagSimulationMessage\(simulateTag\(\)\)\);return;\}/,
    'the command must call the isolated simulator and publish its report');

  assert.match(simulationSource,/tagNormalCardIds\.filter/);
  assert.match(simulationSource,/getPlayableCard\(id\)\?\.level/);
  assert.match(simulationSource,/createTagDuel/);
  assert.match(simulationSource,/chooseNPC/);
  assert.match(simulationSource,/JSON\.parse\(JSON\.stringify\(game\)\)/,
    'the simulation must exercise JSON restoration without persistent sessions');

  const before=persistentSnapshot();
  const result=simulateTag('m501-normal-only');
  assert.ok(result.decisions>0&&result.decisions<=2000);
  assert.ok(result.restores>=1,'the deterministic simulation must cross at least one JSON restore boundary');
  assert.ok(result.game.turn>0);
  assert.ok(['tag-team-0','tag-team-1',null].includes(result.game.winner));
  assert.equal(result.game.teams.length,2);
  const publicState=JSON.stringify(result.game);
  assert.ok(!publicState.includes('"hand":'));
  assert.ok(!publicState.includes('"deck":'));
  assert.ok(!publicState.includes('lab-0:'));
  assert.ok(!publicState.includes('lab-1:'));
  assert.ok(!publicState.includes('lab-2:'));
  assert.ok(!publicState.includes('lab-3:'));

  const payload=tagSimulationMessage(result);
  validateDiscordPayload(payload);
  const embed=payload.embeds[0].toJSON();
  assert.equal(embed.title,'Laboratório 2v2 • simulação');
  assert.match(embed.description,/nenhum item ou progresso do seu personagem foi alterado/i);
  assert.match(embed.fields.find(field=>field.name==='Escopo desta primeira etapa').value,/Somente monstros normais/);
  assert.deepEqual(payload.allowedMentions,{parse:[]});
  assert.equal(persistentSnapshot(),before,'simulation must not create sessions, locks, cards, decks or player progress');
  assert.equal(store.dueTags().length,0);
});

after(()=>{
  if(db.open)db.close();
  fs.rmSync(folder,{recursive:true,force:true});
});
