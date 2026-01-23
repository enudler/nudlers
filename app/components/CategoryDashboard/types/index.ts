export interface ResponseData {
  name: string;
  value: number;
  sum: number;
}

export interface Expense {
  name: string;
  price: number;
  date: string;
  category: string;
  identifier: string;
  vendor: string;
  installments_number?: number;
  installments_total?: number;
  vendor_nickname?: string;
  original_amount?: number;
  original_currency?: string;
  charged_currency?: string;
  card6_digits?: string;
  account_number?: string;
}

export interface ExpensesModalProps {
  open: boolean;
  onClose: () => void;
  data: ModalData;
  color: string;
  setModalData?: (data: ModalData) => void;
  currentMonth?: string;
}

export interface ModalData {
  type: string;
  data: Expense[];
}

export interface BoxPanelData {
  allTransactions: string;
  nonMapped: string;
  categories: string;
  lastMonth: string;
}