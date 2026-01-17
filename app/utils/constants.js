// Credit card vendors
export const CREDIT_CARD_VENDORS = ['visaCal', 'max', 'isracard', 'amex'];

// Bank vendors (standard format: id, password, num)
export const STANDARD_BANK_VENDORS = ['hapoalim', 'poalim', 'leumi', 'mizrahi', 'discount', 'yahav', 'union', 'fibi', 'jerusalem', 'onezero', 'pepper'];

// Beinleumi Group banks (special format: username, password only)
export const BEINLEUMI_GROUP_VENDORS = ['otsarHahayal', 'otsar_hahayal', 'beinleumi', 'massad', 'pagi'];

// All bank vendors
export const BANK_VENDORS = [...STANDARD_BANK_VENDORS, ...BEINLEUMI_GROUP_VENDORS];

// All vendors
export const ALL_VENDORS = [...CREDIT_CARD_VENDORS, ...BANK_VENDORS]; 