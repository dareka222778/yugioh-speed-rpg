'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  DARK_SNAKE_SYNDROME_ID,WAVE_MOTION_CANNON_ID,
  createStandbyBurnLedger,registerStandbyBurnSource,
  resolveStandbyBurnPhase,resolveWaveMotionCannon
}=require('../dist/standbyBurnTagAdapter');

function source(uid,id,faceUp=true){return {uid,id,faceUp,setTurn:0};}
function player(team,{lp=team===0?7000:8000,backrow=[]}={}){
  return {id:'tag-team-'+team,name:team===0?'Equipe Azul':'Equipe Vermelha',lp,deck:[],hand:[],monsters:[],backrow,grave:[],extra:[],banished:[],field:null,summoned:false};
}
function state({turn=1,cursor=0,lp0=7000,lp1=8000,backrow0=[],backrow1=[],phase='main'}={}){
  const active=[cursor%2===0?cursor:0,cursor%2===1?cursor:1];
  const reserves={};
  for(let seat=0;seat<4;seat++)if(!active.includes(seat))reserves[String(seat)]={deck:[],hand:[],extra:[]};
  const players=[player(0,{lp:lp0,backrow:backrow0}),player(1,{lp:lp1,backrow:backrow1})];
  const core={
    version:1,turn,current:cursor%2,phase,resume:'main',priority:cursor%2,
    passes:0,pending:{kind:'none'},chain:[],players,
    teamRotation:{version:1,cursor,active,reserves},winner:null,reason:'',log:[]
  };
  return {
    version:1,mode:'tag-classic',
    members:[
      {id:'p0',name:'A',team:0},{id:'p1',name:'B',team:1},
      {id:'p2',name:'C',team:0},{id:'p3',name:'D',team:1}
    ],
    active,cursor,reserves,core
  };
}
function register(cardId=DARK_SNAKE_SYNDROME_ID,{uid='m0:source',activationId='activation-1',turn=1}={}){
  const s=state({turn,cursor:0,backrow0:[source(uid,cardId)]});
  const r=registerStandbyBurnSource(s,createStandbyBurnLedger(),{
    sourceUid:uid,activationId,cardId,controllerMemberId:'p0',turn
  });
  return {state:s,ledger:r.ledger};
}
function standby(ledger,{turn=3,cursor=2,uid='m0:source',cardId=DARK_SNAKE_SYNDROME_ID,backrow0=[source(uid,cardId)],backrow1=[],lp0=7000,lp1=8000,phaseId='phase-'+turn+'-'+cursor,negatedSourceUids=[]}={}){
  const s=state({turn,cursor,backrow0,backrow1,lp0,lp1});
  const r=resolveStandbyBurnPhase(s,ledger,{
    phaseId,phase:'standby',activeMemberId:'p'+cursor,turn,
    currentLPByTeam:[lp0,lp1],negatedSourceUids
  });
  return {state:s,...r};
}
function waveAction(ledger,{turn=3,cursor=2,uid='m0:source',activationId='activation-1',backrow0=[source(uid,WAVE_MOTION_CANNON_ID)],lp0=7000,lp1=8000,effectNegated=false,actionId='wave-action'}={}){
  const s=state({turn,cursor,lp0,lp1,backrow0,phase:'main'});
  const r=resolveWaveMotionCannon(s,ledger,{
    actionId,activeMemberId:'p'+cursor,sourceUid:uid,activationId,turn,
    phase:'main',currentLPByTeam:[lp0,lp1],effectNegated
  });
  return {state:s,...r};
}

test('registra Dark Snake Syndrome somente após ativação face-up no campo da equipe ativa',()=>{
  const s=state({turn:1,backrow0:[source('m0:snake',DARK_SNAKE_SYNDROME_ID)]});
  const r=registerStandbyBurnSource(s,createStandbyBurnLedger(),{
    sourceUid:'m0:snake',activationId:'snake-a1',cardId:DARK_SNAKE_SYNDROME_ID,controllerMemberId:'p0',turn:1
  });
  assert.equal(r.status,'registered');
  assert.equal(r.ledger.sources[0].passedStandbyPhases,0);
  assert.equal(r.ledger.sources[0].activationTurn,1);
});

test('registra Wave-Motion Cannon com contador inicial zero',()=>{
  const s=state({turn:1,backrow0:[source('m0:wave',WAVE_MOTION_CANNON_ID)]});
  const r=registerStandbyBurnSource(s,createStandbyBurnLedger(),{
    sourceUid:'m0:wave',activationId:'wave-a1',cardId:WAVE_MOTION_CANNON_ID,controllerMemberId:'p0',turn:1
  });
  assert.equal(r.status,'registered');
  assert.equal(r.ledger.sources[0].passedStandbyPhases,0);
});

test('replay da mesma ativação é idempotente',()=>{
  const first=register();
  const s=state({turn:1,backrow0:[source('m0:source',DARK_SNAKE_SYNDROME_ID)]});
  const replay=registerStandbyBurnSource(s,first.ledger,{
    sourceUid:'m0:source',activationId:'activation-1',cardId:DARK_SNAKE_SYNDROME_ID,controllerMemberId:'p0',turn:1
  });
  assert.equal(replay.status,'duplicate');
  assert.equal(replay.ledger.sources[0].passedStandbyPhases,0);
});

test('reativação com novo ID reinicia a contagem da mesma identidade física',()=>{
  const first=register();
  const counted=standby(first.ledger,{turn:3});
  const s=state({turn:5,cursor:0,backrow0:[source('m0:source',DARK_SNAKE_SYNDROME_ID)]});
  const reactivated=registerStandbyBurnSource(s,counted.ledger,{
    sourceUid:'m0:source',activationId:'activation-2',cardId:DARK_SNAKE_SYNDROME_ID,controllerMemberId:'p0',turn:5
  });
  assert.equal(reactivated.status,'registered');
  assert.equal(reactivated.ledger.sources[0].passedStandbyPhases,0);
  assert.equal(reactivated.ledger.sources[0].activationId,'activation-2');
});

test('Dark Snake Syndrome causa 200 aos dois times na primeira Standby própria posterior à ativação',()=>{
  const first=register();
  const r=standby(first.ledger,{turn:3});
  assert.equal(r.status,'triggered');
  assert.equal(r.plans.length,2);
  assert.deepEqual(r.plans.map(p=>p.targetTeam),[0,1]);
  assert.deepEqual(r.plans.map(p=>p.amount),[200,200]);
  assert.equal(r.ledger.sources[0].passedStandbyPhases,1);
});

test('dano dobra a cada Standby Phase própria subsequente: 200, 400, 800',()=>{
  let ledger=register().ledger;
  const amounts=[];
  for(const [turn,cursor] of [[3,2],[5,0],[7,2]]){
    const r=standby(ledger,{turn,cursor,phaseId:'snake-'+turn});
    amounts.push(r.plans[0].amount);
    ledger=r.ledger;
  }
  assert.deepEqual(amounts,[200,400,800]);
});

test('Standby do time adversário não incrementa o contador',()=>{
  const first=register();
  const s=state({turn:2,cursor:1,backrow0:[source('m0:source',DARK_SNAKE_SYNDROME_ID)]});
  const r=resolveStandbyBurnPhase(s,first.ledger,{
    phaseId:'opponent-standby',phase:'standby',activeMemberId:'p1',turn:2,currentLPByTeam:[7000,8000]
  });
  assert.equal(r.status,'unchanged');
  assert.equal(r.ledger.sources[0].passedStandbyPhases,0);
  assert.equal(r.plans.length,0);
});

test('Standby do parceiro ativo da mesma equipe conta como Standby do controlador',()=>{
  const first=register();
  const r=standby(first.ledger,{turn:3,cursor:2});
  assert.equal(r.plans.length,2);
  assert.equal(r.plans[0].controllerTeam,0);
});

test('a contagem avança mesmo quando Dark Snake Syndrome está negada',()=>{
  const first=register();
  const negated=standby(first.ledger,{turn:3,negatedSourceUids:['m0:source']});
  assert.equal(negated.status,'advanced-while-negated');
  assert.equal(negated.plans.length,0);
  assert.equal(negated.ledger.sources[0].passedStandbyPhases,1);
  const restored=standby(negated.ledger,{turn:5,cursor:0,phaseId:'restored-standby'});
  assert.equal(restored.plans[0].amount,400);
});

test('múltiplas cópias de Dark Snake Syndrome acumulam dano por cópia',()=>{
  const s=state({turn:1,backrow0:[
    source('m0:snake-a',DARK_SNAKE_SYNDROME_ID),
    source('m2:snake-b',DARK_SNAKE_SYNDROME_ID)
  ]});
  let ledger=createStandbyBurnLedger();
  for(const [uid,activationId] of [['m0:snake-a','a1'],['m2:snake-b','b1']]){
    ledger=registerStandbyBurnSource(s,ledger,{
      sourceUid:uid,activationId,cardId:DARK_SNAKE_SYNDROME_ID,controllerMemberId:'p0',turn:1
    }).ledger;
  }
  const r=standby(ledger,{turn:3,backrow0:[
    source('m0:snake-a',DARK_SNAKE_SYNDROME_ID),
    source('m2:snake-b',DARK_SNAKE_SYNDROME_ID)
  ]});
  assert.equal(r.plans.length,4);
  assert.deepEqual(r.plans.map(p=>p.amount),[200,200,200,200]);
});

test('cópias ativadas em turnos diferentes mantêm contadores independentes',()=>{
  let ledger=register().ledger;
  const s=state({turn:3,cursor:2,backrow0:[
    source('m0:source',DARK_SNAKE_SYNDROME_ID),
    source('m2:late',DARK_SNAKE_SYNDROME_ID)
  ]});
  ledger=registerStandbyBurnSource(s,ledger,{
    sourceUid:'m2:late',activationId:'late-a1',cardId:DARK_SNAKE_SYNDROME_ID,controllerMemberId:'p2',turn:3
  }).ledger;
  const first=standby(ledger,{turn:5,cursor:0,backrow0:[
    source('m0:source',DARK_SNAKE_SYNDROME_ID),
    source('m2:late',DARK_SNAKE_SYNDROME_ID)
  ]});
  assert.deepEqual(first.plans.map(p=>p.amount),[400,400,200,200]);
});

test('não dispara no mesmo turno em que a Continuous Spell foi ativada',()=>{
  const first=register();
  const s=state({turn:1,cursor:0,backrow0:[source('m0:source',DARK_SNAKE_SYNDROME_ID)]});
  const r=resolveStandbyBurnPhase(s,first.ledger,{
    phaseId:'same-turn',phase:'standby',activeMemberId:'p0',turn:1,currentLPByTeam:[7000,8000]
  });
  assert.equal(r.status,'unchanged');
  assert.equal(r.ledger.sources[0].passedStandbyPhases,0);
});

test('evento de Standby repetido não duplica dano nem contador',()=>{
  const first=register();
  const event={phaseId:'idempotent-phase',phase:'standby',activeMemberId:'p2',turn:3,currentLPByTeam:[7000,8000]};
  const s=state({turn:3,cursor:2,backrow0:[source('m0:source',DARK_SNAKE_SYNDROME_ID)]});
  const once=resolveStandbyBurnPhase(s,first.ledger,event);
  const twice=resolveStandbyBurnPhase(s,once.ledger,event);
  assert.equal(twice.status,'duplicate');
  assert.equal(twice.plans.length,0);
  assert.equal(twice.ledger.sources[0].passedStandbyPhases,1);
});

test('fonte removida do campo deixa de ser rastreada',()=>{
  const first=register();
  const s=state({turn:3,cursor:2,backrow0:[]});
  const r=resolveStandbyBurnPhase(s,first.ledger,{
    phaseId:'removed-source',phase:'standby',activeMemberId:'p2',turn:3,currentLPByTeam:[7000,8000]
  });
  assert.equal(r.plans.length,0);
  assert.equal(r.ledger.sources.length,0);
});

test('fonte face-down não causa dano e precisa de novo registro ao ser reativada',()=>{
  const first=register();
  const r=standby(first.ledger,{turn:3,backrow0:[source('m0:source',DARK_SNAKE_SYNDROME_ID,false)]});
  assert.equal(r.plans.length,0);
  assert.equal(r.ledger.sources.length,0);
});

test('snapshot de LP obsoleto falha fechado',()=>{
  const first=register();
  const s=state({turn:3,cursor:2,lp0:6500,backrow0:[source('m0:source',DARK_SNAKE_SYNDROME_ID)]});
  assert.throws(()=>resolveStandbyBurnPhase(s,first.ledger,{
    phaseId:'stale-lp',phase:'standby',activeMemberId:'p2',turn:3,currentLPByTeam:[7000,8000]
  }),/Snapshot de LP/);
});

test('assento que não está ativo não pode avançar o contador',()=>{
  const first=register();
  const s=state({turn:3,cursor:2,backrow0:[source('m0:source',DARK_SNAKE_SYNDROME_ID)]});
  assert.throws(()=>resolveStandbyBurnPhase(s,first.ledger,{
    phaseId:'wrong-seat',phase:'standby',activeMemberId:'p0',turn:3,currentLPByTeam:[7000,8000]
  }),/participante físico ativo/);
});

test('UID físico malformado é rejeitado no registro',()=>{
  const s=state({turn:1,backrow0:[source('bad-uid',DARK_SNAKE_SYNDROME_ID)]});
  assert.throws(()=>registerStandbyBurnSource(s,createStandbyBurnLedger(),{
    sourceUid:'bad-uid',activationId:'a1',cardId:DARK_SNAKE_SYNDROME_ID,controllerMemberId:'p0',turn:1
  }),/UID físico/);
});

test('UID duplicado no campo compartilhado falha fechado',()=>{
  const first=register();
  const s=state({turn:3,cursor:2,backrow0:[source('m0:source',DARK_SNAKE_SYNDROME_ID),source('m0:source',DARK_SNAKE_SYNDROME_ID)]});
  assert.throws(()=>resolveStandbyBurnPhase(s,first.ledger,{
    phaseId:'duplicate-uid',phase:'standby',activeMemberId:'p2',turn:3,currentLPByTeam:[7000,8000]
  }),/UID duplicado/);
});

test('contador exponencial que ultrapassa inteiro seguro falha fechado',()=>{
  const first=register();
  const ledger={...first.ledger,sources:[{...first.ledger.sources[0],passedStandbyPhases:45}]};
  const rstate=state({turn:3,cursor:2,backrow0:[source('m0:source',DARK_SNAKE_SYNDROME_ID)]});
  assert.throws(()=>resolveStandbyBurnPhase(rstate,ledger,{
    phaseId:'overflow',phase:'standby',activeMemberId:'p2',turn:3,currentLPByTeam:[7000,8000]
  }),/limite seguro/);
});

test('Wave-Motion Cannon acumula apenas Standby Phases próprias posteriores à ativação',()=>{
  let ledger=register(WAVE_MOTION_CANNON_ID,{uid:'m0:wave'}).ledger;
  const one=standby(ledger,{turn:3,uid:'m0:wave',cardId:WAVE_MOTION_CANNON_ID});
  ledger=one.ledger;
  const two=standby(ledger,{turn:5,cursor:0,uid:'m0:wave',cardId:WAVE_MOTION_CANNON_ID,phaseId:'wave-second'});
  assert.equal(two.ledger.sources[0].passedStandbyPhases,2);
  assert.equal(two.plans.length,0);
});

test('Wave-Motion Cannon causa 1000 por Standby transcorrida e envia a própria carta ao GY como custo',()=>{
  let ledger=register(WAVE_MOTION_CANNON_ID,{uid:'m0:wave'}).ledger;
  ledger=standby(ledger,{turn:3,uid:'m0:wave',cardId:WAVE_MOTION_CANNON_ID}).ledger;
  ledger=standby(ledger,{turn:5,cursor:0,uid:'m0:wave',cardId:WAVE_MOTION_CANNON_ID,phaseId:'wave-two'}).ledger;
  const r=waveAction(ledger,{turn:5,cursor:0,uid:'m0:wave',activationId:'activation-1'});
  assert.equal(r.status,'resolved');
  assert.equal(r.plan.amount,2000);
  assert.equal(r.plan.targetTeam,1);
  assert.equal(r.plan.sendToGraveAsCost,true);
  assert.equal(r.plan.damageApplied,true);
  assert.equal(r.ledger.sources.length,0);
});

test('Wave-Motion Cannon pode ser enviado antes de qualquer Standby e causa zero dano',()=>{
  const ledger=register(WAVE_MOTION_CANNON_ID,{uid:'m0:wave'}).ledger;
  const r=waveAction(ledger,{turn:1,cursor:0,uid:'m0:wave'});
  assert.equal(r.status,'resolved');
  assert.equal(r.plan.amount,0);
  assert.equal(r.plan.damageApplied,false);
  assert.equal(r.ledger.sources.length,0);
});

test('negar o efeito de Wave-Motion Cannon não desfaz o custo de envio ao GY',()=>{
  const ledger=register(WAVE_MOTION_CANNON_ID,{uid:'m0:wave'}).ledger;
  const r=waveAction(ledger,{turn:1,cursor:0,uid:'m0:wave',effectNegated:true});
  assert.equal(r.status,'negated-after-cost');
  assert.equal(r.plan.sendToGraveAsCost,true);
  assert.equal(r.plan.amount,0);
  assert.equal(r.plan.effectNegated,true);
  assert.equal(r.ledger.sources.length,0);
});

test('Wave-Motion Cannon exige Main Phase e o participante físico ativo',()=>{
  const ledger=register(WAVE_MOTION_CANNON_ID,{uid:'m0:wave'}).ledger;
  const wrongPhase=state({turn:1,cursor:0,backrow0:[source('m0:wave',WAVE_MOTION_CANNON_ID)],phase:'battle'});
  assert.throws(()=>resolveWaveMotionCannon(wrongPhase,ledger,{
    actionId:'a',activeMemberId:'p0',sourceUid:'m0:wave',activationId:'activation-1',
    turn:1,phase:'main',currentLPByTeam:[7000,8000],effectNegated:false
  }),/Main Phase/);
  const wrongSeat=state({turn:1,cursor:0,backrow0:[source('m0:wave',WAVE_MOTION_CANNON_ID)]});
  assert.throws(()=>resolveWaveMotionCannon(wrongSeat,ledger,{
    actionId:'b',activeMemberId:'p2',sourceUid:'m0:wave',activationId:'activation-1',
    turn:1,phase:'main',currentLPByTeam:[7000,8000],effectNegated:false
  }),/participante físico ativo/);
});

test('Wave-Motion Cannon rejeita ID de ativação divergente e replay de ação é idempotente',()=>{
  const ledger=register(WAVE_MOTION_CANNON_ID,{uid:'m0:wave'}).ledger;
  const s=state({turn:1,cursor:0,backrow0:[source('m0:wave',WAVE_MOTION_CANNON_ID)]});
  assert.throws(()=>resolveWaveMotionCannon(s,ledger,{
    actionId:'wrong',activeMemberId:'p0',sourceUid:'m0:wave',activationId:'other',
    turn:1,phase:'main',currentLPByTeam:[7000,8000],effectNegated:false
  }),/registro de ativação/);
  const once=waveAction(ledger,{turn:1,cursor:0,uid:'m0:wave',actionId:'same'});
  const replay=waveAction(once.ledger,{turn:1,cursor:0,uid:'m0:wave',actionId:'same'});
  assert.equal(replay.status,'duplicate');
  assert.equal(replay.plan,null);
});

test('controle transferido exige novo registro em vez de atribuir dano à equipe errada',()=>{
  const first=register();
  const s=state({turn:3,cursor:2,backrow1:[source('m0:source',DARK_SNAKE_SYNDROME_ID)]});
  assert.throws(()=>resolveStandbyBurnPhase(s,first.ledger,{
    phaseId:'control-change',phase:'standby',activeMemberId:'p2',turn:3,currentLPByTeam:[7000,8000]
  }),/controle da fonte mudou/);
});

test('registrar carta em campo face-down é proibido',()=>{
  const s=state({turn:1,backrow0:[source('m0:snake',DARK_SNAKE_SYNDROME_ID,false)]});
  assert.throws(()=>registerStandbyBurnSource(s,createStandbyBurnLedger(),{
    sourceUid:'m0:snake',activationId:'a1',cardId:DARK_SNAKE_SYNDROME_ID,controllerMemberId:'p0',turn:1
  }),/não está face-up/);
});

test('IDs de fase diferentes não podem avançar a mesma fonte duas vezes no mesmo turno',()=>{
  const first=register();
  const once=standby(first.ledger,{turn:3,phaseId:'phase-a'});
  const s=state({turn:3,cursor:0,backrow0:[source('m0:source',DARK_SNAKE_SYNDROME_ID)]});
  assert.throws(()=>resolveStandbyBurnPhase(s,once.ledger,{
    phaseId:'phase-b',phase:'standby',activeMemberId:'p0',turn:3,currentLPByTeam:[7000,8000]
  }),/já avançou/);
});

test('registro exige Main Phase atual e turno correspondente',()=>{
  const s=state({turn:1,cursor:0,backrow0:[source('m0:snake',DARK_SNAKE_SYNDROME_ID)],phase:'battle'});
  assert.throws(()=>registerStandbyBurnSource(s,createStandbyBurnLedger(),{
    sourceUid:'m0:snake',activationId:'a1',cardId:DARK_SNAKE_SYNDROME_ID,controllerMemberId:'p0',turn:1
  }),/Main Phase/);
  const main=state({turn:2,cursor:0,backrow0:[source('m0:snake',DARK_SNAKE_SYNDROME_ID)]});
  assert.throws(()=>registerStandbyBurnSource(main,createStandbyBurnLedger(),{
    sourceUid:'m0:snake',activationId:'a1',cardId:DARK_SNAKE_SYNDROME_ID,controllerMemberId:'p0',turn:1
  }),/turno obsoleto/);
});

test('planos não alteram LP, mãos, Decks, zonas nem o estado recebido',()=>{
  const first=register();
  const s=state({turn:3,cursor:2,backrow0:[source('m0:source',DARK_SNAKE_SYNDROME_ID)]});
  const before=structuredClone(s);
  const r=resolveStandbyBurnPhase(s,first.ledger,{
    phaseId:'immutable',phase:'standby',activeMemberId:'p2',turn:3,currentLPByTeam:[7000,8000]
  });
  assert.deepEqual(s,before);
  assert.equal(r.plans.reduce((sum,p)=>sum+p.amount,0),400);
});

test('ledger malformado e IDs de ativação reutilizados falham fechado',()=>{
  assert.throws(()=>resolveStandbyBurnPhase(state({turn:3,cursor:2}),{
    version:1,processedPhaseIds:['x','x'],processedActionIds:[],sources:[]
  },{
    phaseId:'bad-ledger',phase:'standby',activeMemberId:'p2',turn:3,currentLPByTeam:[7000,8000]
  }),/Ledger/);
  const first=register();
  const s=state({turn:1,backrow0:[
    source('m0:source',DARK_SNAKE_SYNDROME_ID),
    source('m2:other',DARK_SNAKE_SYNDROME_ID)
  ]});
  assert.throws(()=>registerStandbyBurnSource(s,first.ledger,{
    sourceUid:'m2:other',activationId:'activation-1',cardId:DARK_SNAKE_SYNDROME_ID,controllerMemberId:'p0',turn:1
  }),/reutilizado/);
});
