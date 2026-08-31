import { ACTIVITY_TYPES } from '../summaries/activity-counts.js';
import type { InspectionReport } from './inspection.js';

export function formatInspection(report: InspectionReport): string {
  const lines = [
    `Broker: ${report.broker}`,
    `File: ${report.file}`,
    `Records: ${report.sourceRecords}`,
    `Executions: ${report.executions}`,
    `Activities: ${report.activities}`,
    `Supported records: ${report.supportedRecords}`,
    `Unsupported records: ${report.unsupportedRecords}`,
  ];
  if (report.dateRange !== undefined) {
    lines.push(`Date range: ${report.dateRange.first} to ${report.dateRange.last}`);
  }
  lines.push('', 'Activity types:');
  for (const type of ACTIVITY_TYPES) {
    if (report.activityTypes[type] > 0) lines.push(`  ${type}: ${report.activityTypes[type]}`);
  }
  lines.push('', 'Asset types:');
  for (const type of ['equity', 'option', 'unspecified'] as const) {
    if (report.assetTypes[type] > 0) lines.push(`  ${type}: ${report.assetTypes[type]}`);
  }
  lines.push('', `Diagnostics: ${report.diagnostics.length}`);
  return `${lines.join('\n')}\n`;
}
