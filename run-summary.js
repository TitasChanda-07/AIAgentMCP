const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } = require('docx');

const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, 'test-results');
const screenshotsDir = path.join(outputDir, 'Screenshots');
const reportsDir = path.join(outputDir, 'reports');
const markdownReportPath = path.join(outputDir, 'playwright-run-summary.md');
const jsonReportPath = path.join(outputDir, 'playwright-report.json');

fs.mkdirSync(screenshotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const sanitizeText = (text) => String(text || '').replace(/\r?\n/g, ' ');
const normalizeCaseName = (value) => {
  const cleaned = sanitizeText(value).replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length ? words[0] : 'TestCase';
};

const getDateStamp = () => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
};

const getNextReportNumber = (caseName, dateStamp) => {
  const counterFile = path.join(outputDir, '.report-counter.json');
  let counters = {};

  if (fs.existsSync(counterFile)) {
    try {
      counters = JSON.parse(fs.readFileSync(counterFile, 'utf8'));
    } catch (error) {
      counters = {};
    }
  }

  let maxNo = 0;
  if (fs.existsSync(reportsDir)) {
    const prefix = `${caseName}_${dateStamp}_`;
    for (const entry of fs.readdirSync(reportsDir)) {
      const lowerEntry = entry.toLowerCase();
      const lowerPrefix = prefix.toLowerCase();
      if (lowerEntry.startsWith(lowerPrefix) && lowerEntry.endsWith('.docx')) {
        const trailing = entry.slice(prefix.length).replace(/\.docx$/i, '');
        const value = Number(trailing);
        if (!Number.isNaN(value) && value > maxNo) {
          maxNo = value;
        }
      }
    }
  }

  const key = `${caseName}_${dateStamp}`;
  const nextNo = Math.max(maxNo, Number(counters[key] || 0)) + 1;
  counters[key] = nextNo;
  fs.writeFileSync(counterFile, JSON.stringify(counters, null, 2), 'utf8');
  return nextNo;
};

const getScreenshotsForCase = (caseName) => {
  const base = normalizeCaseName(caseName).toLowerCase();
  if (!fs.existsSync(screenshotsDir)) {
    return [];
  }

  return fs.readdirSync(screenshotsDir)
    .filter((fileName) => fileName.toLowerCase().startsWith(`${base}_`) && fileName.toLowerCase().endsWith('.png'))
    .sort()
    .map((fileName) => path.join(screenshotsDir, fileName));
};

const quoteArg = (value) => {
  if (!value || !/[\s"']/g.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
};

const extraArgs = process.argv.slice(2).map(quoteArg).join(' ');
const command = `npx playwright test --reporter=json ${extraArgs} > "${jsonReportPath}"`;
const result = spawnSync(command, {
  cwd: projectRoot,
  shell: true,
  stdio: 'inherit'
});

const rawData = fs.readFileSync(jsonReportPath);
const utf8Text = rawData.toString('utf8').replace(/^\uFEFF/, '');
let report = { suites: [], stats: { expected: 0, unexpected: 0, skipped: 0 } };

try {
  const jsonText = utf8Text.includes('{') ? utf8Text.slice(utf8Text.indexOf('{'), utf8Text.lastIndexOf('}') + 1) : utf8Text;
  report = JSON.parse(jsonText);
} catch (error) {
  try {
    const utf16Text = rawData.toString('utf16le').replace(/^\uFEFF/, '');
    const jsonText = utf16Text.includes('{') ? utf16Text.slice(utf16Text.indexOf('{'), utf16Text.lastIndexOf('}') + 1) : utf16Text;
    report = JSON.parse(jsonText);
  } catch (fallbackError) {
    report = { suites: [], stats: { expected: 0, unexpected: 0, skipped: 0 } };
  }
}

const tests = [];
const collectTests = (suite) => {
  (suite.specs || []).forEach((spec) => {
    (spec.tests || []).forEach((testCase) => {
      const finalResult = (testCase.results || []).at(-1) || {};
      const statusText = finalResult.status || 'unknown';
      const status = statusText === 'passed' ? 'Pass' : statusText === 'failed' ? 'Fail' : statusText === 'skipped' ? 'Skipped' : 'Fail';
      tests.push({
        name: normalizeCaseName(spec.title || testCase.title || 'Unnamed test'),
        status,
        screenshots: getScreenshotsForCase(spec.title || testCase.title || 'Unnamed test')
      });
    });
  });

  (suite.suites || []).forEach(collectTests);
};

(report.suites || []).forEach(collectTests);

const passCount = tests.filter((test) => test.status === 'Pass').length;
const failCount = tests.filter((test) => test.status === 'Fail').length;
const skipCount = tests.filter((test) => test.status === 'Skipped').length;
const overallStatus = failCount > 0 ? 'Fail' : 'Pass';

const markdownLines = [
  '# Playwright Run Summary',
  '',
  `- Timestamp: ${new Date().toISOString()}`,
  `- Overall Status: ${overallStatus}`,
  `- Passed: ${passCount}`,
  `- Failed: ${failCount}`,
  `- Skipped: ${skipCount}`,
  '',
  '| Test | Status | Screenshots |',
  '| --- | --- | --- |'
];

for (const test of tests) {
  const screenshotCells = test.screenshots.length
    ? test.screenshots.map((screenshotPath) => {
        const relativePath = path.relative(projectRoot, screenshotPath).replace(/\\/g, '/');
        return `![${path.basename(screenshotPath)}](${relativePath})`;
      }).join('<br>')
    : 'No screenshot';

  markdownLines.push(`| ${test.name} | ${test.status} | ${screenshotCells} |`);
}

fs.writeFileSync(markdownReportPath, `${markdownLines.join('\n')}\n`, 'utf8');

const docSections = [
  new Paragraph({ text: 'Playwright Run Summary', heading: HeadingLevel.TITLE }),
  new Paragraph({ children: [new TextRun({ text: `Timestamp: ${new Date().toISOString()}` })] }),
  new Paragraph({
    children: [
      new TextRun({ text: 'Overall Status: ', bold: true }),
      new TextRun({ text: overallStatus, bold: true, color: overallStatus === 'Pass' ? '2E7D32' : 'C62828' })
    ]
  }),
  new Paragraph({ children: [new TextRun({ text: `Passed: ${passCount}` })] }),
  new Paragraph({ children: [new TextRun({ text: `Failed: ${failCount}` })] }),
  new Paragraph({ children: [new TextRun({ text: `Skipped: ${skipCount}` })] }),
  new Paragraph({ text: 'Test Results', heading: HeadingLevel.HEADING_2 })
];

for (const test of tests) {
  docSections.push(
    new Paragraph({
      children: [
        new TextRun({ text: `${test.name}: `, bold: true }),
        new TextRun({ text: test.status, color: test.status === 'Pass' ? '2E7D32' : test.status === 'Fail' ? 'C62828' : '6A1B9A' })
      ]
    })
  );

  const screenshotPaths = test.screenshots;
  if (screenshotPaths.length) {
    for (const screenshotPath of screenshotPaths) {
      docSections.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: fs.readFileSync(screenshotPath),
              transformation: { width: 450, height: 260 }
            })
          ]
        })
      );
    }
  }
}

const docBaseName = tests.length ? normalizeCaseName(tests[0].name) : 'TestCase';
const dateStamp = getDateStamp();
const nextReportNo = getNextReportNumber(docBaseName, dateStamp);
fs.mkdirSync(reportsDir, { recursive: true });
const docxReportPath = path.join(reportsDir, `${docBaseName}_${dateStamp}_${String(nextReportNo).padStart(2, '0')}.docx`);

const doc = new Document({ sections: [{ children: docSections }] });
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(docxReportPath, buffer);
  console.log(`Playwright summary written to ${markdownReportPath}`);
  console.log(`Word report written to ${docxReportPath}`);
  console.log(`Screenshot report written to ${jsonReportPath}`);
  process.exit(result.status ?? 0);
}).catch((error) => {
  console.error('Failed to generate DOCX report:', error);
  process.exit(1);
});
