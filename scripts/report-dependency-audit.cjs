'use strict';

const fs = require('node:fs');

const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];

function normalizeCounts(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Relatório npm audit sem metadata.vulnerabilities.');
  }
  const counts = {};
  for (const severity of SEVERITIES) {
    const value = raw[severity] ?? 0;
    if (!Number.isInteger(value) || value < 0) {
      throw new Error('Contagem inválida para severidade: ' + severity);
    }
    counts[severity] = value;
  }
  const sum = SEVERITIES.reduce((total, severity) => total + counts[severity], 0);
  const reportedTotal = raw.total ?? sum;
  if (!Number.isInteger(reportedTotal) || reportedTotal < 0 || reportedTotal !== sum) {
    throw new Error('Total de vulnerabilidades inconsistente no relatório npm audit.');
  }
  counts.total = reportedTotal;
  return counts;
}

function summarizeReport(report, scope) {
  if (!report || typeof report !== 'object' || !report.metadata) {
    throw new Error('Relatório npm audit inválido: metadata ausente para o escopo ' + scope + '.');
  }
  const counts = normalizeCounts(report.metadata.vulnerabilities);
  const vulnerabilities = report.vulnerabilities ?? {};
  if (typeof vulnerabilities !== 'object' || Array.isArray(vulnerabilities)) {
    throw new Error('Mapa de vulnerabilidades inválido para o escopo ' + scope + '.');
  }
  const packages = Object.entries(vulnerabilities).map(([name, item]) => ({
    name,
    severity: item.severity ?? 'unknown',
    isDirect: Boolean(item.isDirect),
    range: item.range ?? null,
    nodes: Array.isArray(item.nodes) ? item.nodes : [],
    via: Array.isArray(item.via)
      ? item.via.map(entry => typeof entry === 'string' ? entry : (entry.title ?? entry.name ?? 'advisory'))
      : [],
    fixAvailable: item.fixAvailable ?? false
  })).sort((a, b) => {
    const rank = severity => SEVERITIES.indexOf(severity);
    return rank(b.severity) - rank(a.severity) || a.name.localeCompare(b.name);
  });
  return {
    scope,
    auditReportVersion: report.auditReportVersion ?? null,
    counts,
    packages
  };
}

function evaluateReports(fullReport, productionReport, exitCodes = {}) {
  const full = summarizeReport(fullReport, 'all');
  const production = summarizeReport(productionReport, 'production');
  const blocking = production.counts.high > 0 || production.counts.critical > 0;
  return {
    generatedAt: new Date().toISOString(),
    npmAuditExitCodes: {
      all: Number.isInteger(exitCodes.all) ? exitCodes.all : null,
      production: Number.isInteger(exitCodes.production) ? exitCodes.production : null
    },
    all: full,
    production,
    productionGate: {
      status: blocking ? 'blocked' : 'pass',
      blockingPackages: production.packages.filter(item => item.severity === 'high' || item.severity === 'critical').map(item => item.name),
      policy: 'Bloquear apenas vulnerabilidades high/critical alcançáveis sem --omit=dev; manter o relatório completo para triagem de dependências de desenvolvimento.'
    }
  };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error('Não foi possível ler relatório JSON ' + file + ': ' + error.message);
  }
}

function readExitCode(file) {
  if (!file || !fs.existsSync(file)) return null;
  const value = Number(fs.readFileSync(file, 'utf8').trim());
  return Number.isInteger(value) ? value : null;
}

function main(argv) {
  const [allPath, productionPath, allExitPath, productionExitPath, outputPath] = argv;
  if (!allPath || !productionPath) {
    throw new Error('Uso: node scripts/report-dependency-audit.cjs <all.json> <production.json> [all.exit] [production.exit] [output.json]');
  }
  const result = evaluateReports(
    readJson(allPath),
    readJson(productionPath),
    { all: readExitCode(allExitPath), production: readExitCode(productionExitPath) }
  );
  const serialized = JSON.stringify(result, null, 2) + '\n';
  if (outputPath) fs.writeFileSync(outputPath, serialized);
  process.stdout.write(serialized);
  if (result.productionGate.status === 'blocked') process.exitCode = 1;
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(error.stack + '\n');
    process.exitCode = 2;
  }
}

module.exports = { normalizeCounts, summarizeReport, evaluateReports };
