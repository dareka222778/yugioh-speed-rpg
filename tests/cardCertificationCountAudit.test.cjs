const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAudit } = require('../scripts/card-certification-audit.cjs');

test('contagem certificada vem do registry, não da allowlist de distribuição', () => {
  const report = buildAudit();
  assert.equal(report.certified, report.certificateRecords);
  assert.equal(report.remainingTo1000, Math.max(0, 1000 - report.certified));
  assert.ok(report.releasedAllowlist >= report.playableReleased);
  assert.equal(report.releasedButUncertifiedBlocked, report.releasedButUncertified);
  assert.equal(report.playableReleased, report.certified - report.certifiedButNotReleased);
  assert.ok(['in-progress', 'reached'].includes(report.milestone));
});

test('IDs liberados sem certificado permanecem bloqueados para distribuição', () => {
  const report = buildAudit();
  assert.equal(report.releasedButUncertifiedBlocked, report.releasedButUncertified);
  assert.equal(report.distributionRequiresCertification, true);
});
