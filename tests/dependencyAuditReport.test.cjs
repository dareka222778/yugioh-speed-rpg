'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateReports, summarizeReport } = require('../scripts/report-dependency-audit.cjs');

function report(entries = {}, counts = {}) {
  const normalized = {
    info: 0, low: 0, moderate: 0, high: 0, critical: 0,
    ...counts
  };
  normalized.total = normalized.info + normalized.low + normalized.moderate + normalized.high + normalized.critical;
  return {
    auditReportVersion: 2,
    vulnerabilities: entries,
    metadata: { vulnerabilities: normalized }
  };
}

test('keeps full dependency findings visible while allowing dev-only high findings', () => {
  const full = report({
    'test-tool': {
      severity: 'high', isDirect: false, range: '<2.0.0',
      nodes: ['node_modules/test-tool'], via: ['transitive advisory'], fixAvailable: true
    }
  }, { high: 1 });
  const production = report();
  const result = evaluateReports(full, production, { all: 1, production: 0 });

  assert.equal(result.all.counts.high, 1);
  assert.equal(result.all.packages[0].name, 'test-tool');
  assert.equal(result.productionGate.status, 'pass');
  assert.deepEqual(result.productionGate.blockingPackages, []);
});

test('blocks a high-severity production dependency and names the package', () => {
  const full = report({
    'discord-runtime-dependency': {
      severity: 'high', isDirect: false, range: '>=1 <1.2',
      nodes: ['node_modules/discord-runtime-dependency'], via: [{ title: 'Remote code execution' }]
    }
  }, { high: 1 });
  const production = report({
    'discord-runtime-dependency': {
      severity: 'high', isDirect: false, range: '>=1 <1.2',
      nodes: ['node_modules/discord-runtime-dependency'], via: [{ title: 'Remote code execution' }]
    }
  }, { high: 1 });

  const result = evaluateReports(full, production);
  assert.equal(result.productionGate.status, 'blocked');
  assert.deepEqual(result.productionGate.blockingPackages, ['discord-runtime-dependency']);
});

test('blocks critical production findings even when no high findings exist', () => {
  const critical = report({
    'critical-runtime-dependency': {
      severity: 'critical', isDirect: true, range: '*',
      nodes: ['node_modules/critical-runtime-dependency'], via: ['critical advisory']
    }
  }, { critical: 1 });

  const result = evaluateReports(critical, critical);
  assert.equal(result.productionGate.status, 'blocked');
});

test('rejects malformed or internally inconsistent audit reports', () => {
  assert.throws(() => summarizeReport({}, 'all'), /metadata/);
  assert.throws(() => summarizeReport({
    metadata: { vulnerabilities: { high: 1, total: 0 } },
    vulnerabilities: {}
  }, 'all'), /inconsistente/);
});
