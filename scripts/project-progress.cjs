#!/usr/bin/env node
/**
 * Project milestones are an explicitly scoped engineering assessment, not an
 * assertion that a percentage of all Yu-Gi-Oh cards/rulings is implemented.
 * Update scores only alongside commits containing relevant implementation
 * and tests. The playable NPC decks are validated independently.
 */
const {enabledCardIds,getEffect,getPlayableCard}=require('../dist/effectRegistry');
const {npcs}=require('../dist/npcContent');
const {RULES_PROFILE}=require('../dist/rulesProfile');
const {getMonsterEffect}=require('../dist/monsterEffects');

const engine=[
 {id:'format',name:'Formato Speed RPG (4000 PV, zonas, decks)',weight:10,done:10},
 {id:'combat',name:'Turnos, combate e condições de vitória',weight:9,done:9},
 {id:'spells',name:'Magias e Armadilhas clássicas',weight:9,done:8},
 {id:'chains',name:'Correntes, janelas de resposta e prioridade',weight:10,done:10},
 {id:'flip',name:'Efeitos FLIP e cálculo de dano',weight:8,done:8},
 {id:'ignition',name:'Ignição e custos (LP, descarte, Tributo)',weight:8,done:7},
 {id:'graveyard',name:'Gatilhos e buscas do Cemitério',weight:8,done:8},
 {id:'summon',name:'Gatilhos de invocação e invocações especiais',weight:7,done:7},
 {id:'destruction',name:'Outros gatilhos de destruição e ordem de eventos',weight:7,done:6},
 {id:'continuous',name:'Efeitos contínuos, rápidos e negações complexas',weight:8,done:5},
 {id:'playableCards',name:'Cobertura e validação das cartas jogáveis deste RPG',weight:7,done:6},
 {id:'npc',name:'IA dos NPCs com efeitos',weight:4,done:4},
 {id:'acceptance',name:'CI, testes de regressão e aceitação real no Discord',weight:5,done:4}
];
// The duel field intentionally stays in its original amber skin; only Discord command surfaces
// are being standardized under the shared blue design system.
const layout=[
 {id:'design',name:'Sistema de design azul, hierarquia, tipografia',weight:12,done:9},
 {id:'portraits',name:'Retratos, identidades e apresentações dos duelistas',weight:15,done:8},
 {id:'gallery',name:'Galeria, decks e navegação carta por carta',weight:15,done:14},
 {id:'commandPanels',name:'Painéis padronizados dos comandos, sem modificar o campo de duelo',weight:20,done:2},
 {id:'feedback',name:'Feedback visual de ações e resultados nos comandos',weight:12,done:1},
 {id:'responsive',name:'Layouts desktop, mobile e Discord',weight:10,done:3},
 {id:'accessibility',name:'Usabilidade, botões e acessibilidade',weight:10,done:6},
 {id:'validation',name:'Testes, capturas e validação visual humana',weight:6,done:4}
];

function calculate(items){
 const total=items.reduce((s,m)=>s+m.weight,0);
 if(total!==100||items.some(m=>!Number.isInteger(m.done)||m.done<0||m.done>m.weight))throw new Error('Roadmap score must be 0–100 and weights must sum to 100.');
 return {complete:items.reduce((s,m)=>s+m.done,0),remaining:100-items.reduce((s,m)=>s+m.done,0),milestones:items};
}
const playableNPCDecks=npcs.map(n=>({id:n.id,name:n.name,main:n.cards.length,extra:n.extra.length,
 valid:n.cards.length>=20&&n.cards.length<=30&&n.extra.length<=RULES_PROFILE.extraDeckMax&&
  [...n.cards,...n.extra].every(id=>!!getPlayableCard(id)&&!!getEffect(id))}));
const report={readiness:{release:require('../package.json').version,historicalMilestoneScores:true,productionAcceptance:'pending human Discord validation of Speed RPG Clássico v1 and 2v2',scope:'197 enabled cards; not all classic anime cards'},scope:'Playability of this RPG only; not every TCG/anime card',
 engine:calculate(engine),layout:calculate(layout),playableNPCDecks,
 enabledEngineCards:enabledCardIds.length,playableEffectMonsters:enabledCardIds.filter(id=>!!getMonsterEffect(id)).length};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else{
 console.log('ENGINE: aggregate completion percentage unavailable; use scoped acceptance reports. Historical milestones remain in --json only.');
 console.log('LAYOUT: command components implemented; human/mobile acceptance pending; original duel field preserved.');
 console.log(`NPC DECKS ${playableNPCDecks.filter(n=>n.valid).length}/${playableNPCDecks.length} playable in this RPG, ${playableNPCDecks.map(n=>n.main).join('/')} cards in main decks`);
 console.log(`ENGINE CARDS ${report.enabledEngineCards} enabled / ${report.playableEffectMonsters} with monster effect definitions`);
 console.log(`RULES ${RULES_PROFILE.name}: hand ${RULES_PROFILE.handLimit}, discard End Phase, Extra ${RULES_PROFILE.extraDeckMax}. Historical catalog coverage not yet audited by an importer.`);
}
