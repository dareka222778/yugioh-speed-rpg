#!/usr/bin/env node
/**
 * Audits the distinction between engine certification and distribution approval.
 * Importing/releasing a card never certifies its behavior.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const { engineCatalog, enabledCardIds, getCardStatus } = require('../dist/effectRegistry');
const { cardCertifications } = require('../dist/cardCertifications');
const { releasedCardIds } = require('../dist/releasedCardIds');
const { cardDistributionAllowed } = require('../dist/cardReleasePolicy');

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b, 'en'));
}

function buildAudit() {
  const registeredIds = engineCatalog.map(card => card.id);
  const certifiedIds = [...enabledCardIds];
  const certificateIds = Object.keys(cardCertifications);
  const releaseIds = [...releasedCardIds];

  assert.equal(new Set(registeredIds).size, registeredIds.length, 'Catálogo contém IDs duplicados.');
  assert.equal(new Set(certifiedIds).size, certifiedIds.length, 'Registry contém IDs certificados duplicados.');
  assert.equal(new Set(releaseIds).size, releaseIds.length, 'Allowlist contém IDs duplicados.');
  assert.deepEqual(sorted(certifiedIds), sorted(certificateIds),
    'enabledCardIds diverge dos registros explícitos de cardCertifications.');

  for (const id of certifiedIds) {
    assert.equal(getCardStatus(id)?.stage, 'certified', 'Status de certificação inconsistente: ' + id);
    const certificate = cardCertifications[id];
    assert.ok(certificate && Array.isArray(certificate.suites) && certificate.suites.length > 0,
      'Certificado sem suíte comportamental: ' + id);
    for (const suite of certificate.suites) {
      assert.match(suite, /^tests\/[A-Za-z0-9_-]+\.test\.cjs$/,
        'Caminho de suíte inválido para ' + id + ': ' + suite);
      assert.ok(fs.existsSync(path.resolve(__dirname, '..', suite)),
        'Suíte de evidência ausente para ' + id + ': ' + suite);
    }
  }

  const releasedButUncertified = releaseIds.filter(id => !cardCertifications[id]);
  const certifiedButNotReleased = certifiedIds.filter(id => !releasedCardIds.has(id));
  const releasedButUncertifiedBlocked = releasedButUncertified.filter(id => !cardDistributionAllowed(id));
  const playableReleased = releaseIds.filter(id => cardDistributionAllowed(id));
  const certifiedAndReleased = certifiedIds.filter(id => releasedCardIds.has(id));
  const registeredButUncertified = registeredIds.filter(id => getCardStatus(id)?.stage !== 'certified');

  assert.equal(releasedButUncertifiedBlocked.length, releasedButUncertified.length,
    'Há ID na allowlist de distribuição que ficou jogável sem certificado.');
  assert.equal(playableReleased.length, certifiedAndReleased.length,
    'A política de distribuição diverge da interseção entre certificação e allowlist.');

  const certified = certifiedIds.length;
  return {
    countSource: 'enabledCardIds from buildCardRegistry, cross-checked against cardCertifications',
    registered: registeredIds.length,
    certified,
    certificateRecords: certificateIds.length,
    registeredButUncertified: registeredButUncertified.length,
    releasedAllowlist: releaseIds.length,
    playableReleased: playableReleased.length,
    releasedButUncertified: releasedButUncertified.length,
    releasedButUncertifiedIds: sorted(releasedButUncertified),
    releasedButUncertifiedBlocked: releasedButUncertifiedBlocked.length,
    certifiedButNotReleased: certifiedButNotReleased.length,
    remainingTo1000: Math.max(0, 1000 - certified),
    milestone: certified >= 1000 ? 'reached' : 'in-progress',
    distributionRequiresCertification: true
  };
}

if (require.main === module) {
  process.stdout.write(JSON.stringify(buildAudit(), null, 2) + '\n');
}

module.exports = { buildAudit };
