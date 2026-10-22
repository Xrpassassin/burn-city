import { benchmarkNavigationHarness } from './wilds-navigation-benchmark.mjs';

const report = await benchmarkNavigationHarness();
if (!report) {
  console.error('Navigation benchmark configuration or execution failed.');
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(report, null, 2));
}
