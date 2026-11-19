const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const evidence = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../docs/evidence/m391-ocg-first-release-audit.json'),
  'utf8',
));
const cutoff = evidence.historicalCutoffInclusive;

test('M391 is an evidence-only OCG first-release audit with an inclusive historical cutoff', () => {
  assert.equal(evidence.mission, 'M391');
  assert.equal(evidence.authority, 'Konami official Yu-Gi-Oh! OCG Card Database');
  assert.equal(evidence.sourceLocale, 'ja');
  assert.equal(cutoff, '2004-09-30');
});

test('all three cards have distinct physical card IDs and official Japanese OCG sources', () => {
  assert.equal(evidence.cards.length, 3);
  assert.equal(new Set(evidence.cards.map(card => card.id)).size, 3);
  for (const card of evidence.cards) {
    assert.match(card.id, /^\d{8}$/);
    assert.match(card.officialSourceUrl, /^https:\/\/www\.db\.yugioh-card\.com\/yugiohdb\/card_search\.action\?/);
    assert.match(card.officialSourceUrl, /request_locale=ja/);
    assert.ok(Number.isSafeInteger(card.konamiCardDatabaseId));
  }
});

test('earliest OCG release is the minimum of the official printings, not a TCG reprint', () => {
  for (const card of evidence.cards) {
    const dates = card.officialOcgPrintings.map(printing => printing.releaseDate).sort();
    assert.equal(card.earliestOcgRelease, dates[0], card.name);
    assert.equal(card.earliestSetCode, card.officialOcgPrintings.find(printing => printing.releaseDate === dates[0]).setCode);
    assert.ok(card.officialOcgPrintings.every(printing => /^\d{4}-\d{2}-\d{2}$/.test(printing.releaseDate)));
  }
});

test('all audited OCG first releases are on or before the historical cutoff', () => {
  for (const card of evidence.cards) {
    assert.ok(card.earliestOcgRelease <= cutoff, `${card.name} is after the cutoff`);
    assert.equal(card.eligibleAtHistoricalCutoff, true);
  }
});

test('source review never changes behavioral certification or grants cards automatically', () => {
  for (const card of evidence.cards) {
    assert.equal(card.behaviorStatus, 'not-certified');
    assert.equal(card.certificationStatus, 'not-certified');
    assert.equal(card.automaticCertification, false);
  }
  assert.deepEqual(evidence.summary, {
    reviewed: 3,
    officialOcgSources: 3,
    eligibleAtHistoricalCutoff: 3,
    historicalIneligible: 0,
    runtimeCertificationsAdded: 0,
    automaticCertifications: 0,
  });
});
