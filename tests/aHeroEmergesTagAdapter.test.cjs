'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
  A_HERO_EMERGES_ID,
  prepareAHeroEmerges,
  aHeroEmergesHiddenChoices,
  resolveAHeroEmerges
} = require('../dist/aHeroEmergesTagAdapter');

const KINDS = new Map([
  ['MONSTER_NORMAL', 'monster'],
  ['MONSTER_SPECIAL_ONLY', 'monster'],
  ['SPELL_A', 'spell'],
  ['TRAP_A', 'trap']
]);
const getCardKind = id => KINDS.get(id);
const canSummon = (_state, _team, id) => id === 'MONSTER_NORMAL';

function makeState(options = {}) {
  const hand = options.hand ?? [
    {uid:'m0:normal-monster',id:'MONSTER_NORMAL'},
    {uid:'m0:spell-card',id:'SPELL_A'},
    {uid:'m0:trap-card',id:'TRAP_A'}
  ];
  const source = {
    uid:'m2:hero-emerges-owned-by-partner',
    id:A_HERO_EMERGES_ID,
    setTurn:options.setTurn ?? 2,
    faceUp:options.sourceFaceUp !== false,
    resolved:false
  };
  return {
    version:1,
    players:[
      {
        id:'tag-team-0',name:'Equipe Azul',lp:4000,deck:[],hand,
        monsters:options.defenderMonsters ?? [],backrow:[source],grave:[],extra:[],summoned:false
      },
      {
        id:'tag-team-1',name:'Equipe Vermelha',lp:4000,deck:[],hand:[],
        monsters:[{uid:'m1:attacker',id:'MONSTER_NORMAL',position:'atk',faceUp:true,entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0}],
        backrow:[],grave:[],extra:[],summoned:false
      }
    ],
    teamRotation:{
      version:1,cursor:1,active:[0,1],
      reserves:{2:{hand:[{uid:'m2:partner-monster',id:'MONSTER_SPECIAL_ONLY'}],deck:[],extra:[]},3:{hand:[],deck:[],extra:[]}}
    },
    turn:3,current:1,phase:'response',resume:'battle',priority:0,passes:0,
    pending:{kind:'attack',actor:1,card:'m1:attacker',stage:'declare'},
    chain:[],winner:null,reason:'',log:[]
  };
}

function prepare(state, getKind = getCardKind) {
  return prepareAHeroEmerges(state,'m2:hero-emerges-owned-by-partner',getKind);
}

test('Trap owned by the inactive defender partner responds to an opponent attack but uses the active defender hand', () => {
  const state=makeState();
  const before=structuredClone(state);
  const prepared=prepare(state);
  assert.equal(prepared.sourceOwnerSeat,2);
  assert.equal(prepared.defendingTeam,0);
  assert.equal(prepared.attackingTeam,1);
  assert.equal(prepared.defenderSeat,0);
  assert.equal(prepared.chooserSeat,1);
  assert.equal(prepared.attackUid,'m1:attacker');
  assert.deepEqual(state,before);
});

test('opponent sees indistinguishable backs for the active hand only, never card IDs or partner hand', () => {
  const state=makeState();
  const prepared=prepare(state);
  const choices=aHeroEmergesHiddenChoices(state,prepared);
  assert.equal(choices.length,3);
  assert.ok(choices.every(c=>c.label==='Carta oculta'&&c.visibility==='attacking-active-seat-only'));
  assert.deepEqual(choices.map(c=>c.token),['m0:normal-monster','m0:spell-card','m0:trap-card']);
  const projection=JSON.stringify(choices);
  assert.equal(projection.includes('MONSTER_NORMAL'),false);
  assert.equal(projection.includes('MONSTER_SPECIAL_ONLY'),false);
  assert.equal(projection.includes('m2:partner-monster'),false);
});

test('selected monster that can be Special Summoned produces a face-up Attack Position plan', () => {
  const state=makeState();
  const prepared=prepare(state);
  const plan=resolveAHeroEmerges(state,prepared,'m0:normal-monster',getCardKind,canSummon);
  assert.equal(plan.destination,'monsterZone');
  assert.equal(plan.position,'atk');
  assert.equal(plan.faceUp,true);
  assert.equal(plan.cardId,'MONSTER_NORMAL');
  assert.equal(plan.physicalOwnerSeat,0);
  assert.equal(plan.revealScope,'both-teams');
  assert.equal(plan.otherHandCardsRemainPrivate,true);
});

test('non-monster selected from the hand is sent to the shared Graveyard', () => {
  const state=makeState();
  const prepared=prepare(state);
  const plan=resolveAHeroEmerges(state,prepared,'m0:spell-card',getCardKind,canSummon);
  assert.equal(plan.destination,'grave');
  assert.equal(plan.position,null);
  assert.equal(plan.faceUp,false);
});

test('a Special-Summon-only monster that cannot be summoned by this effect is sent to the Graveyard', () => {
  const state=makeState({hand:[{uid:'m0:only-monster',id:'MONSTER_SPECIAL_ONLY'}]});
  const prepared=prepare(state);
  const plan=resolveAHeroEmerges(state,prepared,'m0:only-monster',getCardKind,canSummon);
  assert.equal(plan.destination,'grave');
});

test('partner hand UID cannot be selected by the active representative hand choice', () => {
  const state=makeState();
  const prepared=prepare(state);
  assert.throws(
    ()=>resolveAHeroEmerges(state,prepared,'m2:partner-monster',getCardKind,canSummon),
    /mão privada do representante defensor ativo/
  );
});

test('stale attack or representative rotation invalidates the hidden choice', () => {
  const state=makeState();
  const prepared=prepare(state);
  state.pending.card='m1:another-attacker';
  assert.throws(()=>aHeroEmergesHiddenChoices(state,prepared),/declaração de ataque mudou/);
  const rotated=makeState();
  const rotatedActivation=prepare(rotated);
  rotated.teamRotation.active[0]=2;
  assert.throws(()=>aHeroEmergesHiddenChoices(rotated,rotatedActivation),/representante mudou/);
});

test('Trap cannot activate on its Set turn or when it is face-down', () => {
  assert.throws(()=>prepare(makeState({setTurn:3})),/Setada em turno anterior/);
  assert.throws(()=>prepare(makeState({sourceFaceUp:false})),/Setada em turno anterior/);
});

test('A Hero Emerges cannot activate if the active representative has no Monster Card in hand', () => {
  const state=makeState({hand:[{uid:'m0:only-spell',id:'SPELL_A'}]});
  assert.throws(()=>prepare(state),/sem Monstro na mão/);
});

test('a declaration by the defending team is not a legal trigger', () => {
  const state=makeState();
  state.current=0;
  state.pending.actor=0;
  state.pending.card='m0:attacker';
  assert.throws(()=>prepare(state),/monstro adversário/);
});

test('the card selected after activation is revalidated against the current hand', () => {
  const state=makeState();
  const prepared=prepare(state);
  state.players[0].hand=state.players[0].hand.filter(c=>c.uid!=='m0:normal-monster');
  assert.throws(
    ()=>resolveAHeroEmerges(state,prepared,'m0:normal-monster',getCardKind,canSummon),
    /mão privada do representante defensor ativo/
  );
});

test('a full-field or other Special Summon restriction is delegated to the legality callback', () => {
  const state=makeState();
  const prepared=prepare(state);
  const plan=resolveAHeroEmerges(state,prepared,'m0:normal-monster',getCardKind,()=>false);
  assert.equal(plan.destination,'grave');
});

test('hidden choice and resolution planning never mutate the duel or expose the remaining hand', () => {
  const state=makeState();
  const before=structuredClone(state);
  const prepared=prepare(state);
  const choices=aHeroEmergesHiddenChoices(state,prepared);
  const plan=resolveAHeroEmerges(state,prepared,choices[0].token,getCardKind,canSummon);
  assert.ok(plan.cardId);
  assert.deepEqual(state,before);
});
