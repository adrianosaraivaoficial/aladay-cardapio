export const statuses = ['RECEBIDO', 'EM_PREPARO', 'PRONTO', 'CONCLUIDO'] as const;
export type OrderStatus = typeof statuses[number];
export const statusLabel: Record<OrderStatus, string> = {
  RECEBIDO: 'Recebido', EM_PREPARO: 'Em preparo', PRONTO: 'Pronto', CONCLUIDO: 'Concluído',
};
export const paymentMethods = ['Pix simulado', 'Cartão simulado', 'Dinheiro simulado'] as const;
export type PaymentMethod = typeof paymentMethods[number];

export interface DemoCartItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  notes: string;
  selectedOptions: string[];
}

export interface DemoOrder {
  id: string;
  items: DemoCartItem[];
  subtotal: number;
  total: number;
  createdAt: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: 'SIMULADO';
}

export interface DemoSession {
  sessionId: string;
  cart: DemoCartItem[];
  orders: DemoOrder[];
  selectedOrderId: string | null;
}

export const maxQuantity = 20;
export const totalOf = (items: DemoCartItem[]) =>
  items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
export const nextStatus = (status: OrderStatus): OrderStatus | undefined =>
  statuses[statuses.indexOf(status) + 1];
export function emptySession(): DemoSession {
  return { sessionId: crypto.randomUUID(), cart: [], orders: [], selectedOrderId: null };
}

export function createOrder(session: DemoSession, expectedCart: DemoCartItem[], payment: PaymentMethod, priceOf: (item: DemoCartItem) => number | undefined): DemoSession {
  if (!session.cart.length || JSON.stringify(session.cart) !== JSON.stringify(expectedCart)) {
    throw new Error('O carrinho mudou. Revise os itens antes de confirmar.');
  }
  if (!paymentMethods.includes(payment) || session.cart.some(item =>
    priceOf(item) !== item.unitPrice || !Number.isSafeInteger(item.unitPrice) ||
    item.unitPrice <= 0 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > maxQuantity
  )) {
    throw new Error('Revise os itens e a forma de pagamento.');
  }
  const total = totalOf(session.cart);
  if (!Number.isSafeInteger(total)) throw new Error('Valor inválido.');
  const order: DemoOrder = {
    id: 'DEMO-' + String(session.orders.length + 1).padStart(3, '0'),
    items: session.cart,
    subtotal: total,
    total,
    createdAt: new Date().toISOString(),
    status: 'RECEBIDO',
    paymentMethod: payment,
    paymentStatus: 'SIMULADO',
  };
  return { ...session, cart: [], orders: [order, ...session.orders], selectedOrderId: order.id };
}
