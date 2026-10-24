#!/usr/bin/env node
/**
 * Project milestones are an explicitly scoped engineering assessment, not an
 * assertion that a percentage of all Yu-Gi-Oh cards/rulings is implemented.
 * Update scores only alongside a commit containing relevant implementation
 * and tests. The classic archive's coverage is independently measured below.
 */
const {classicCoverage,enabledCardIds}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const engine=[
 {id:'format',name:'Formato Speed RPG (4000 PV, zonas, decks)',weight:10,done:10},
 {id:'combat',name:'Turnos, combate e condições de vitória',weight:9,done:9},
 {id:'spells',name:'Magias e Armadilhas clássicas',weight:9,done:6},
 {id:'chains',name:'Correntes, janelas de resposta e prioridade',weight:10,done:5},
 {id:'flip',name:'Efeitos FLIP e cálculo de dano',weight:8,done:7},
 {id:'ignition',name:'Ignição e custos (LP, descarte, Tributo)',weight:8,done:7},
 {id:'graveyard',name:'Gatilhos e buscas do Cemitério',weight:8,done:5},
 {id:'summon',name:'Gatilhos de invocação e invocações especiais',weight:7,done:2},
 {id:'destruction',name:'Outros gatilhos de destruição e ordem de eventos',weight:7,done:0},
 {id:'continuous',name:'Efeitos contínuos, rápidos e negações complexas',weight:8,done:0},
 {id:'archive',name:'Cobertura do lote histórico inicial (123 cartas)',weight:7,done:4},
 {id:'npc',name:'IA dos NPCs com efeitos',weight:4,done:2},
 {id:'acceptance',name:'CI, testes de regressão e aceitação real no Discord',weight:5,done:3}
];
const layout=[
 {id:'design',name:'Sistema de design azul, hierarquia, tipografia',weight:12,done:0},
 {id:'portraits',name:'Retratos, identidades e apresentações dos duelistas',weight:15,done:0},
 {id:'gallery',name:'Galeria, decks e navegação carta por carta',weight:15,done:0},
 {id:'arena',name:'Campo e HUD responsivos no estilo Duel Links',weight:20,done:0},
 {id:'feedback',name:'Feedback visual de invocações e efeitos',weight:12,done:0},
 {id:'responsive',name:'Layouts desktop, mobile e Discord',weight:10,done:0},
 {id:'accessibility',name:'Usabilidade, botões e acessibilidade',weight:10,done:0},
 {id:'validation',name:'Testes, capturas e validação visual humana',weight:6,done:0}
];

function calculate(items){
 const total=items.reduce((s,m)=>s+m.weight,0);
 if(total!==100||items.some(m=>!Number.isInteger(m.done)||m.done<0||m.done>m.weight))throw new Error('Roadmap score must be 0–100 and weights must sum to 100.');
 return {complete:items.reduce((s,m)=>s+m.done,0),remaining:100-items.reduce((s,m)=>s+m.done,0),milestones:items};
}
const cards=classicCoverage();
const archive={total:cards.length,enabled:cards.filter(c=>c.enabled).length,incompatible:cards.filter(c=>c.status==='format-incompatible').length,pending:cards.filter(c=>c.status==='pending').length};
const report={scope:'A first-batch classic engine milestone, not every TCG/anime card',engine:calculate(engine),layout:calculate(layout),classicArchive:archive,enabledEngineCards:enabledCardIds.length,playableEffectMonsters:enabledCardIds.filter(id=>!!getMonsterEffect(id)).length};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else{
 console.log(`ENGINE ${report.engine.complete}% complete / ${report.engine.remaining}% remaining`);
 console.log(`LAYOUT REBUILD ${report.layout.complete}% complete / ${report.layout.remaining}% remaining`);
 console.log(`HISTORICAL BATCH ${archive.enabled}/${archive.total} enabled, ${archive.pending} pending, ${archive.incompatible} incompatible`);
 console.log(`ENGINE CARDS ${report.enabledEngineCards} enabled / ${report.playableEffectMonsters} with monster effect definitions`);
 console.log('Milestone scores are manually evidence-reviewed; archive coverage is measured from the actual registry.');
}
