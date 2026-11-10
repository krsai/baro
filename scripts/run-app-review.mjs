import {spawn} from 'node:child_process';

// Local checks only: no operational maintenance, rollout or production DB scripts.
const suites = [
  'access-policy-regression','security-boundaries-regression','company-menu-layout','system-menu-layout','page-naming',
  'workspace-navigation-regression','workspace-tab-keep-alive-regression','auth-background-refresh-regression','tab-editing-regression',
  'style-product-ownership','manufacturer-ownership','style-save-consistency','style-list-performance',
  'freight-jobs','freight-operations','shipping-requests','transport-exchange','railway-schema-preflight',
  'company-profile-save','company-connections','common-company-identity','linked-subscriber-profile','company-industries','partner-classification',
  'internal-ledger-transfers','expense-payment-schedule','approval-settings-batch','approval-review','ledger-registration','change-approvals','bank-ledger','ledger-evidence','approval-vacancy',
  'general-invoice','invoice-workflow','order-workflow','production-progress','issued-invoice-print','invoice-list-query','invoice-draft-store','invoice-issue-store','document-number','expense-request-editor',
  'employee-salary-preview','tenure-recognition','payroll-management-versions','calendar-payroll',
  'attendance-import-regression','attendance-employment-regression','attendance-management-regression','attendance-day-summary-import-regression',
  'currency-format-regression','dashboard-widgets',
];
const child=spawn(process.execPath,['--test','--test-concurrency=2',...suites.map(name=>`scripts/${name}.test.mjs`)],{stdio:'inherit',windowsHide:true});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
