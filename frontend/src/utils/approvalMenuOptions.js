import {canAccessFeature} from './accessControl';

const MENU_FEATURES = {
  EXPENSE: 'OUTSOURCING_RECORD',
  BANK_LEDGER: 'BANK_LEDGER',
  INVOICE: 'INVOICE',
  WORK_TIME: 'WORK_TIME',
  INVENTORY: 'INVENTORY_MOVEMENTS',
};

export const approvalMenuOptions = (authState, systemDefaults = false) =>
  Object.keys(MENU_FEATURES).filter(menu => systemDefaults || canAccessFeature(MENU_FEATURES[menu], authState));
