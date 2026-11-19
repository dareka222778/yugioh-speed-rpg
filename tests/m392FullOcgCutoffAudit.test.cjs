const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/evidence/m392-full-ocg-cutoff-audit.json'),
  'utf8',
));
const cutoff = evidence.historicalCutoffInclusive;

test('M392 is a complete 31-identity OCG audit with an explicit inclusive cutoff', () => {
  assert.equal(evidence.mission, 'M392');
  assert.equal(cutoff, '2004-09-30');
  assert.equal(evidence.authority, 'Konami official Yu-Gi-Oh! OCG Card Database');
  assert.equal(evidence.sourceLocale, 'ja');
  assert.equal(evidence.cards.length, 31);
});

test('the 31 physical card IDs are unique and preserve leading zeroes', () => {
  const ids = evidence.cards.map(card => card.id);
  assert.equal(new Set(ids).size, 31);
  assert.ok(ids.includes('00980973'));
  assert.ok(ids.includes('07180418'));
  assert.ok(ids.includes('09156135'));
});

test('every source is the official Japanese OCG card page matching its Konami database ID', () => {
  for (const card of evidence.cards) {
    assert.match(card.id, /^\d{8}$/);
    assert.ok(Number.isSafeInteger(card.konamiCardDatabaseId));
    const url = new URL(card.officialSourceUrl);
    assert.equal(url.hostname, 'www.db.yugioh-card.com');
    assert.equal(url.pathname, '/yugiohdb/card_search.action');
    assert.equal(url.searchParams.get('cid'), String(card.konamiCardDatabaseId));
    assert.equal(url.searchParams.get('request_locale'), 'ja');
    assert.deepEqual(card.sourceLocale, 'ja');
    assert.equal(card.sourceSection, 'OCG');
    assert.equal(card.sourceLineRange.length, 2);
    assert.ok(card.sourceLineRange[0] > 0 && card.sourceLineRange[1] >= card.sourceLineRange[0]);
  }
});

test('the recorded earliest OCG printing is on or before the 2004-09-30 cutoff for all 31', () => {
  for (const card of evidence.cards) {
    assert.match(card.earliestOcgRelease, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(card.earliestOcgRelease <= cutoff, card.name);
    assert.ok(card.earliestOcgSetCode.length > 0, card.name);
    assert.equal(card.eligibleAtHistoricalCutoff, true);
  }
});

test('the audit does not infer TCG eligibility from OCG evidence', () => {
  assert.equal(evidence.cards.filter(card => card.tcgFirstReleaseAudited).length, 0);
  assert.equal(evidence.summary.tcgEligibilityAudited, 0);
});

test('historical eligibility evidence does not certify behavior or grant inventory', () => {
  for (const card of evidence.cards) {
    assert.equal(card.behaviorStatus, 'not-certified');
    assert.equal(card.certificationStatus, 'not-certified');
    assert.equal(card.automaticCertification, false);
  }
  assert.deepEqual(evidence.summary, {
    reviewed: 31,
    uniqueCardIds: 31,
    officialOcgSources: 31,
    eligibleAtHistoricalCutoff: 31,
    historicalIneligible: 0,
    tcgEligibilityAudited: 0,
    behaviorCertificationsAdded: 0,
    automaticCertifications: 0,
  });
});
