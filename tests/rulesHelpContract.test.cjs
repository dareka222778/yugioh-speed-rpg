const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RULES_PROFILE,rulesFor}=require('../dist/rulesProfile');
const {helpMessage,helpPages}=require('../dist/commandUI');
const {validateDiscordPayload}=require('../dist/discordPayload');

const pageText=page=>JSON.stringify(page);
const rulesText=pageText(helpPages.rules);
const teamsText=pageText(helpPages.teams);
const cardsText=pageText(helpPages.cards);

test('current owner profile fixes the exact classic format boundaries',()=>{
  assert.deepEqual({
    startingLP:RULES_PROFILE.startingLP,
    startingHand:RULES_PROFILE.startingHand,
    mainDeckMin:RULES_PROFILE.mainDeckMin,
    mainDeckMax:RULES_PROFILE.mainDeckMax,
    extraDeckMax:RULES_PROFILE.extraDeckMax,
    monsterZones:RULES_PROFILE.monsterZones,
    spellTrapZones:RULES_PROFILE.spellTrapZones,
    handLimit:RULES_PROFILE.handLimit,
    handCheck:RULES_PROFILE.handCheck,
    afterBattlePhase:RULES_PROFILE.afterBattlePhase,
    skillsEnabled:RULES_PROFILE.skillsEnabled,
    copiesPerCard:RULES_PROFILE.copiesPerCard
  },{
    startingLP:4000,startingHand:4,mainDeckMin:20,mainDeckMax:30,
    extraDeckMax:5,monsterZones:3,spellTrapZones:3,handLimit:6,
    handCheck:'end',afterBattlePhase:'end',skillsEnabled:false,copiesPerCard:3
  });
});

test('the rules page describes 3+3 shared zones and a separate Field Zone',()=>{
  assert.match(rulesText,/4000 PV/);
  assert.match(rulesText,/três zonas de Monstro/);
  assert.match(rulesText,/três de Magia[/]Armadilha/);
  assert.match(rulesText,/Campo separado/);
  assert.equal(RULES_PROFILE.monsterZones+RULES_PROFILE.spellTrapZones,6);
});

test('the six-card limit is checked only in the active player End Phase',()=>{
  assert.equal(RULES_PROFILE.handLimit,6);
  assert.equal(RULES_PROFILE.handCheck,'end');
  assert.match(rulesText,/Compras, buscas e devoluções resolvem normalmente/);
  assert.match(rulesText,/Na Fase Final do seu turno, descarte o excedente até seis cartas/);
  assert.doesNotMatch(rulesText,/limite de seis antes da compra|descarte imediatamente ao comprar/i);
});

test('Main Deck and Extra Deck help text agree with the owner profile',()=>{
  assert.equal(RULES_PROFILE.mainDeckMin,20);
  assert.equal(RULES_PROFILE.mainDeckMax,30);
  assert.equal(RULES_PROFILE.extraDeckMax,5);
  assert.match(rulesText,/Principal de 20–30 cartas/);
  assert.match(rulesText,/Adicional de até cinco/);
  assert.match(cardsText,/Limite de três cópias por carta/);
});

test('the 2v2 guide separates shared team state from physical private zones',()=>{
  assert.match(teamsText,/Cada equipe compartilha PV, campo e cemitério/);
  assert.match(teamsText,/Mãos, decks e adicionais são individuais/);
  assert.match(teamsText,/O representante ativo da equipe decide as respostas/);
  assert.match(teamsText,/O parceiro inativo não oferece uma segunda resposta/);
  assert.match(teamsText,/Cartas devolvidas retornam ao dono original/);
});

test('the 2v2 guide applies six cards per person at that person End Phase',()=>{
  assert.match(teamsText,/Seis cartas por pessoa, descarte na Fase Final do próprio turno/);
  assert.match(teamsText,/mão privada por participante/);
});

test('legacy saves retain their versioned limits instead of inheriting current help limits',()=>{
  const legacySix=rulesFor({rulesVersion:'speed-rpg-v1'});
  const legacySeven=rulesFor({rulesVersion:'speed-rpg-v2'});
  assert.equal(legacySix.handLimit,6);
  assert.equal(legacySix.extraDeckMax,6);
  assert.equal(legacySeven.handLimit,7);
  assert.equal(legacySeven.handCheck,'before-draw');
  assert.equal(legacySeven.extraDeckMax,6);
  assert.match(rulesText,/Partidas antigas mantêm suas regras até terminar/);
});

test('the /regras payload is a valid owner-bound Discord help panel',()=>{
  const payload=helpMessage('398001','rules');
  assert.equal(validateDiscordPayload(payload),payload);
  const embed=payload.embeds[0].toJSON();
  assert.equal(embed.title,'Regras do duelo');
  assert.match(embed.fields.map(f=>f.value).join(' '),/descarte o excedente até seis cartas/);
  const menu=payload.components[0].toJSON().components[0];
  assert.equal(menu.custom_id,'help:page:398001');
  assert.equal(menu.options.find(o=>o.value==='rules').default,true);
});

test('every help page remains valid after the rules contract is fixed',()=>{
  for(const page of Object.keys(helpPages)){
    const payload=helpMessage('398001',page);
    assert.equal(validateDiscordPayload(payload),payload);
    assert.equal(payload.components[0].toJSON().components[0].custom_id,'help:page:398001');
  }
  assert.throws(()=>helpMessage('398001','not-a-page'),/Página de ajuda inválida/);
});
