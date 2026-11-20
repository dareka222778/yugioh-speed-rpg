const assert = require('node:assert/strict');
const tag = require('../../dist/tagDuel');
const {getPlayableCard} = require('../../dist/effectRegistry');
const {atk,def} = require('../../dist/duelEngine');

const normalIds = tag.tagNormalCardIds.filter(id => getPlayableCard(id)?.kind === 'monster');
const deck = normalIds.slice(0, 10).flatMap(id => [id, id]);
if (deck.length !== 20) throw new Error('M418 requires at least ten enabled Normal Monsters.');

function createGame(first = 0, seed = 'm418-tag-classic') {
  return tag.createTagDuel(
    [0, 1, 2, 3].map(i => ({id: `p${i}`, name: `P${i}`, cards: deck})),
    {classic: true, first, seed}
  );
}
function holder(state, seat) {
  const team = seat % 2;
  return state.active[team] === seat ? state.core.players[team] : state.reserves[seat];
}
function takeFromDeck(state, seat, id, label) {
  const h = holder(state, seat);
  const source = h.deck.pop();
  assert.ok(source, `seat ${seat} needs a physical card for ${label}`);
  return {...source, uid: `m${seat}:${label}`, id};
}
function addToHand(state, seat, id, label) {
  const card = takeFromDeck(state, seat, id, label);
  holder(state, seat).hand.push(card);
  return card;
}
function deployMonster(state, seat, id, label, options = {}) {
  const card = takeFromDeck(state, seat, id, label);
  const monster = {
    ...card,
    owner: seat % 2,
    faceUp: options.faceUp ?? true,
    position: options.position ?? 'atk',
    entered: 0,
    changed: 0,
    attacked: 0,
    atkBoost: options.atkBoost ?? 0,
    defBoost: options.defBoost ?? 0
  };
  state.core.players[seat % 2].monsters.push(monster);
  return monster;
}
function setBackrow(state, seat, id, label) {
  const card = takeFromDeck(state, seat, id, label);
  const backrow = {...card, setTurn: 0, faceUp: false};
  state.core.players[seat % 2].backrow.push(backrow);
  return backrow;
}
function putInGrave(state, seat, id, label) {
  const card = takeFromDeck(state, seat, id, label);
  state.core.players[seat % 2].grave.push(card);
  return card;
}
function act(state, seat, kind, predicate = () => true) {
  const member = `p${seat}`;
  const actions = tag.tagActions(state, member);
  const action = actions.find(a => a.kind === kind && predicate(a));
  assert.ok(action, `missing ${kind} for ${member} in ${state.core.phase}: ${JSON.stringify(actions)}`);
  return tag.stepTagDuel(state, member, action);
}
function currentSeat(state) {
  return Number(tag.tagDecisionMember(state).id.slice(1));
}
function actCurrent(state, kind, predicate = () => true) {
  return act(state, currentSeat(state), kind, predicate);
}
function passAll(state) {
  for (let i = 0; i < 12 && state.core.phase === 'response'; i++) state = actCurrent(state, 'pass');
  assert.notEqual(state.core.phase, 'response', 'response chain did not close after passes');
  return state;
}
function normalCard(predicate) {
  const found = normalIds.map(getPlayableCard).find(predicate);
  assert.ok(found, 'no enabled Normal Monster satisfies the requested test stats');
  return found;
}
module.exports = {
  tag, atk, def, createGame, addToHand, deployMonster, setBackrow, putInGrave,
  act, actCurrent, passAll, normalCard, normalIds
};
