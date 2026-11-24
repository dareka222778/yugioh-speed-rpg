'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  NUTRIENT_Z_ID,EMERGENCY_PROVISIONS_ID,createRecoveryLedger,
  resolveNutrientZ,resolveEmergencyProvisions
}=require('../dist/lpRecoveryTagAdapter');

function card(uid,id,{faceUp=true,setTurn=0}={}){return {uid,id,faceUp,setTurn};}
function player(team,{lp=team===0?7000:8000,hand=[],backrow=[],field=null}={}){
  return {id:'tag-team-'+team,name:team===0?'Equipe Azul':'Equipe Vermelha',lp,deck:[],hand,monsters:[],backrow,grave:[],extra:[],banished:[],field,summoned:false};
}
function state({turn=1,cursor=0,priority=cursor%2,phase='main',lp0=7000,lp1=8000,hand0=[],hand1=[],backrow0=[],backrow1=[],field0=null,field1=null}={}){
  const active=[cursor%2===0?cursor:0,cursor%2===1?cursor:1];
  const reserves={};
  for(let seat=0;seat<4;seat++)if(!active.includes(seat))reserves[String(seat)]={deck:[],hand:[],extra:[]};
  return {
    version:1,mode:'tag-classic',
    members:[{id:'p0',name:'A',team:0},{id:'p1',name:'B',team:1},{id:'p2',name:'C',team:0},{id:'p3',name:'D',team:1}],
    active,cursor,reserves,
    core:{
      version:1,turn,current:cursor%2,phase,resume:'main',priority,passes:0,pending:{kind:'none'},chain:[],
      players:[
        player(0,{lp:lp0,hand:hand0,backrow:backrow0,field:field0}),
        player(1,{lp:lp1,hand:hand1,backrow:backrow1,field:field1})
      ],
      teamRotation:{version:1,cursor,active,reserves},winner:null,reason:'',log:[]
    }
  };
}
function nutrientEvent({actionId='nz-1',sourceUid='m0:nz',turn=3,activeMemberId='p0',defendingTeam=0,incomingBattleDamage=2000,effectNegated=false,lp0=7000,lp1=8000}={}){
  return {actionId,sourceUid,turn,window:'damage-calculation',activeMemberId,defendingTeam,incomingBattleDamage,effectNegated,currentLPByTeam:[lp0,lp1]};
}
function emergencyEvent({actionId='ep-1',sourceUid='m0:ep',sourceZone='hand',turn=1,phase='main',activeMemberId='p0',effectNegated=false,lp0=7000,lp1=8000,costUids=[]}={}){
  return {actionId,sourceUid,sourceZone,turn,phase,activeMemberId,effectNegated,currentLPByTeam:[lp0,lp1],costUids};
}

test('Nutrient Z ganha 4000 LP antes de dano de batalha de exatamente 2000',()=>{
  const s=state({turn:3,cursor:1,priority:0,phase:'response',backrow0:[card('m0:nz',NUTRIENT_Z_ID,{faceUp:false,setTurn:1})]});
  const r=resolveNutrientZ(s,createRecoveryLedger(),nutrientEvent());
  assert.equal(r.status,'resolved');
  assert.equal(r.plan.amount,4000);
  assert.equal(r.plan.incomingBattleDamage,2000);
  assert.equal(r.plan.beforeBattleDamage,true);
  assert.equal(r.plan.targetTeam,0);
  assert.equal(r.plan.replacementEligible,true);
});

test('Nutrient Z aceita dano iminente acima do limiar',()=>{
  const s=state({turn:3,cursor:1,priority:0,phase:'response',backrow0:[card('m0:nz',NUTRIENT_Z_ID,{faceUp:false,setTurn:1})]});
  const r=resolveNutrientZ(s,createRecoveryLedger(),nutrientEvent({incomingBattleDamage:4800}));
  assert.equal(r.plan.amount,4000);
  assert.equal(r.plan.incomingBattleDamage,4800);
});

test('Nutrient Z rejeita dano de batalha inferior a 2000',()=>{
  const s=state({turn:3,cursor:1,priority:0,phase:'response',backrow0:[card('m0:nz',NUTRIENT_Z_ID,{faceUp:false,setTurn:1})]});
  assert.throws(()=>resolveNutrientZ(s,createRecoveryLedger(),nutrientEvent({incomingBattleDamage:1999})),/pelo menos 2000/);
});

test('Nutrient Z exige que a equipe defensora tenha prioridade e controle a carta',()=>{
  const wrongPriority=state({turn:3,cursor:1,priority:1,phase:'response',backrow0:[card('m0:nz',NUTRIENT_Z_ID,{faceUp:false,setTurn:1})]});
  assert.throws(()=>resolveNutrientZ(wrongPriority,createRecoveryLedger(),nutrientEvent({activeMemberId:'p1'})),/prioridade da equipe/);
  const wrongTeam=state({turn:3,cursor:1,priority:0,phase:'response',backrow1:[card('m1:nz',NUTRIENT_Z_ID,{faceUp:false,setTurn:1})]});
  assert.throws(()=>resolveNutrientZ(wrongTeam,createRecoveryLedger(),nutrientEvent()),/não pertence à equipe/);
});

test('Nutrient Z não pode ser ativada no mesmo turno em que foi setada',()=>{
  const s=state({turn:3,cursor:1,priority:0,phase:'response',backrow0:[card('m0:nz',NUTRIENT_Z_ID,{faceUp:false,setTurn:3})]});
  assert.throws(()=>resolveNutrientZ(s,createRecoveryLedger(),nutrientEvent()),/ainda não pode ser ativada/);
});

test('Nutrient Z exige carta setada e face-down',()=>{
  const faceUp=state({turn:3,cursor:1,priority:0,phase:'response',backrow0:[card('m0:nz',NUTRIENT_Z_ID,{faceUp:true,setTurn:1})]});
  assert.throws(()=>resolveNutrientZ(faceUp,createRecoveryLedger(),nutrientEvent()),/não está setada/);
});

test('negar Nutrient Z impede ganho mas não devolve a Trap ativada',()=>{
  const s=state({turn:3,cursor:1,priority:0,phase:'response',backrow0:[card('m0:nz',NUTRIENT_Z_ID,{faceUp:false,setTurn:1})]});
  const r=resolveNutrientZ(s,createRecoveryLedger(),nutrientEvent({effectNegated:true}));
  assert.equal(r.status,'negated');
  assert.equal(r.plan.amount,0);
  assert.equal(r.plan.gainApplied,false);
  assert.equal(r.plan.sourceLeavesField,true);
});

test('Nutrient Z rejeita snapshot de LP obsoleto e turno divergente',()=>{
  const s=state({turn:3,cursor:1,priority:0,phase:'response',lp0:6500,backrow0:[card('m0:nz',NUTRIENT_Z_ID,{faceUp:false,setTurn:1})]});
  assert.throws(()=>resolveNutrientZ(s,createRecoveryLedger(),nutrientEvent()),/Snapshot de LP/);
  const fresh=state({turn:4,cursor:1,priority:0,phase:'response',backrow0:[card('m0:nz',NUTRIENT_Z_ID,{faceUp:false,setTurn:1})]});
  assert.throws(()=>resolveNutrientZ(fresh,createRecoveryLedger(),nutrientEvent()),/dano de batalha iminente/);
});

test('Nutrient Z replay é idempotente e não duplica recuperação',()=>{
  const s=state({turn:3,cursor:1,priority:0,phase:'response',backrow0:[card('m0:nz',NUTRIENT_Z_ID,{faceUp:false,setTurn:1})]});
  const once=resolveNutrientZ(s,createRecoveryLedger(),nutrientEvent());
  const replay=resolveNutrientZ(s,once.ledger,nutrientEvent());
  assert.equal(replay.status,'duplicate');
  assert.equal(replay.plan,null);
});

test('Nutrient Z usa o assento ativo da equipe defensora e preserva o estado',()=>{
  const s=state({turn:3,cursor:1,priority:0,phase:'response',backrow0:[card('m2:nz',NUTRIENT_Z_ID,{faceUp:false,setTurn:1})]});
  const before=structuredClone(s);
  const r=resolveNutrientZ(s,createRecoveryLedger(),nutrientEvent({sourceUid:'m2:nz'}));
  assert.equal(r.plan.controllerTeam,0);
  assert.deepEqual(s,before);
});

test('Emergency Provisions envia outras Magias/Armadilhas e ganha 1000 por carta',()=>{
  const s=state({hand0:[card('m0:ep',EMERGENCY_PROVISIONS_ID)],backrow0:[
    card('m0:mst','05318639',{faceUp:true}),card('m2:mirror','44095762',{faceUp:false})
  ]});
  const r=resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({costUids:['m0:mst','m2:mirror']}));
  assert.equal(r.status,'resolved');
  assert.equal(r.plan.baseAmount,2000);
  assert.equal(r.plan.amount,2000);
  assert.equal(r.plan.costPaid,true);
  assert.deepEqual(r.plan.costs.map(c=>c.kind),['spell','trap']);
  assert.equal(r.plan.targetTeam,0);
});

test('Emergency Provisions aceita Quick-Play setada em turno anterior na resposta do adversário',()=>{
  const s=state({turn:3,cursor:1,priority:0,phase:'response',backrow0:[
    card('m2:ep',EMERGENCY_PROVISIONS_ID,{faceUp:false,setTurn:1}),
    card('m0:mst','05318639')
  ]});
  const r=resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({
    sourceUid:'m2:ep',sourceZone:'set',turn:3,phase:'response',activeMemberId:'p0',costUids:['m0:mst']
  }));
  assert.equal(r.status,'resolved');
  assert.equal(r.plan.amount,1000);
  assert.equal(r.plan.timing,'response');
});

test('Emergency Provisions aceita carta setada anteriormente no próprio turno',()=>{
  const s=state({turn:3,cursor:0,backrow0:[
    card('m0:ep',EMERGENCY_PROVISIONS_ID,{faceUp:false,setTurn:1}),
    card('m0:mst','05318639')
  ]});
  const r=resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({
    sourceUid:'m0:ep',sourceZone:'set',turn:3,costUids:['m0:mst']
  }));
  assert.equal(r.plan.amount,1000);
});

test('Emergency Provisions não pode ativar Quick-Play setada no mesmo turno',()=>{
  const s=state({turn:3,cursor:0,backrow0:[card('m0:ep',EMERGENCY_PROVISIONS_ID,{faceUp:false,setTurn:3})]});
  assert.throws(()=>resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({sourceUid:'m0:ep',sourceZone:'set',turn:3})),/ainda não pode ser ativada/);
});

test('Emergency Provisions da mão não pode ser ativada durante turno adversário',()=>{
  const s=state({turn:3,cursor:1,hand0:[card('m0:ep',EMERGENCY_PROVISIONS_ID)]});
  assert.throws(()=>resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({
    sourceUid:'m0:ep',turn:3,phase:'main',activeMemberId:'p1'
  })),/turno adversário/);
});

test('Quick-Play setada não pode ser ativada sem prioridade da equipe controladora',()=>{
  const s=state({turn:3,cursor:1,priority:1,phase:'response',backrow0:[card('m0:ep',EMERGENCY_PROVISIONS_ID,{faceUp:false,setTurn:1})]});
  assert.throws(()=>resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({
    sourceUid:'m0:ep',sourceZone:'set',turn:3,phase:'response',activeMemberId:'p1'
  })),/equipe com prioridade/);
});

test('Emergency Provisions aceita zero custos sem inventar recuperação',()=>{
  const s=state({hand0:[card('m0:ep',EMERGENCY_PROVISIONS_ID)]});
  const r=resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent());
  assert.equal(r.plan.costPaid,true);
  assert.equal(r.plan.baseAmount,0);
  assert.equal(r.plan.amount,0);
  assert.equal(r.plan.gainApplied,false);
});

test('negação de Emergency Provisions não devolve custos e impede ganho',()=>{
  const s=state({hand0:[card('m0:ep',EMERGENCY_PROVISIONS_ID)],backrow0:[card('m0:mst','05318639')]});
  const r=resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({effectNegated:true,costUids:['m0:mst']}));
  assert.equal(r.status,'negated-after-cost');
  assert.equal(r.plan.costPaid,true);
  assert.equal(r.plan.costs.length,1);
  assert.equal(r.plan.baseAmount,1000);
  assert.equal(r.plan.amount,0);
  assert.equal(r.plan.gainApplied,false);
});

test('Emergency Provisions rejeita Magia comum colocada indevidamente na Field Zone',()=>{
  const s=state({hand0:[card('m0:ep',EMERGENCY_PROVISIONS_ID)],field0:card('m2:field','05318639')});
  assert.throws(()=>resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({costUids:['m2:field']})),/Magia de Campo certificada/);
});

test('Emergency Provisions rejeita a própria carta como custo',()=>{
  const s=state({hand0:[card('m0:ep',EMERGENCY_PROVISIONS_ID)]});
  assert.throws(()=>resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({costUids:['m0:ep']})),/Lista de custos/);
});

test('Emergency Provisions rejeita custos duplicados e fora do controle da equipe',()=>{
  const s=state({hand0:[card('m0:ep',EMERGENCY_PROVISIONS_ID)],backrow0:[card('m0:mst','05318639')],backrow1:[card('m1:mirror','44095762')]});
  assert.throws(()=>resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({costUids:['m0:mst','m0:mst']})),/Lista de custos/);
  assert.throws(()=>resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({costUids:['m1:mirror']})),/fora do controle/);
});

test('Emergency Provisions rejeita custo que não é Magia ou Armadilha certificada',()=>{
  const s=state({hand0:[card('m0:ep',EMERGENCY_PROVISIONS_ID)],backrow0:[card('m0:monster','46986414')]});
  assert.throws(()=>resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({costUids:['m0:monster']})),/Magia\/Armadilha certificada/);
});

test('Emergency Provisions exige janela e turno atuais',()=>{
  const s=state({turn:3,cursor:0,phase:'battle',hand0:[card('m0:ep',EMERGENCY_PROVISIONS_ID)]});
  assert.throws(()=>resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({turn:3,phase:'main'})),/janela\/turno obsoleto/);
  assert.throws(()=>resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({turn:2,phase:'battle'})),/janela\/turno obsoleto/);
});

test('Emergency Provisions rejeita snapshot de LP obsoleto e replay não duplica ganho',()=>{
  const s=state({hand0:[card('m0:ep',EMERGENCY_PROVISIONS_ID)],backrow0:[card('m0:mst','05318639')]});
  assert.throws(()=>resolveEmergencyProvisions(state({lp1:7500,hand0:[card('m0:ep',EMERGENCY_PROVISIONS_ID)],backrow0:[card('m0:mst','05318639')]}),createRecoveryLedger(),emergencyEvent({costUids:['m0:mst']})),/Snapshot de LP/);
  const once=resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({costUids:['m0:mst']}));
  const replay=resolveEmergencyProvisions(s,once.ledger,emergencyEvent({costUids:['m0:mst']}));
  assert.equal(replay.status,'duplicate');
  assert.equal(replay.plan,null);
});

test('planos preservam LP, mãos, Decks e zonas; não concedem cartas nem alteram estado',()=>{
  const s=state({hand0:[card('m0:ep',EMERGENCY_PROVISIONS_ID)],backrow0:[card('m0:mst','05318639')]});
  const before=structuredClone(s);
  const r=resolveEmergencyProvisions(s,createRecoveryLedger(),emergencyEvent({costUids:['m0:mst']}));
  assert.deepEqual(s,before);
  assert.equal(r.plan.costs.length,1);
});

test('Nutrient Z não pode ser usada em resposta ou na Battle Phase',()=>{
  const s=state({phase:'response',priority:0,hand0:[card('m0:rain',NUTRIENT_Z_ID)]});
  assert.throws(()=>resolveNutrientZ(s,createRecoveryLedger(),nutrientEvent({phase:'response'})),/Main Phase/);
});

test('ledger malformado e UID físico inválido falham fechado',()=>{
  assert.throws(()=>resolveRainOfMercy(state({hand0:[card('m0:rain',RAIN_OF_MERCY_ID)]}),{
    version:1,processedActionIds:['x','x']
  },rainEvent()),/Ledger/);
  const bad=state({hand0:[card('bad',RAIN_OF_MERCY_ID)]});
  assert.throws(()=>resolveRainOfMercy(bad,createRecoveryLedger(),rainEvent({sourceUid:'bad'})),/UID físico/);
});
