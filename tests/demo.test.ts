import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOrder, nextStatus, totalOf, type DemoCartItem, type DemoSession } from '../src/demo/orders';

const cart: DemoCartItem[] = [
  { productId: 'burger', quantity: 2, unitPrice: 3290, notes: '', selectedOptions: [] },
  { productId: 'fries', quantity: 1, unitPrice: 1490, notes: '', selectedOptions: [] },
];
const session: DemoSession = { sessionId: 'test-session', cart, orders: [], selectedOrderId: null };
const prices = new Map([['burger', 3290], ['fries', 1490]]);

test('demo checkout calculates integer cents and consumes the confirmed cart once', () => {
  const updated = createOrder(session, cart, 'Pix simulado', prices);
  assert.equal(totalOf(cart), 8070);
  assert.equal(updated.orders.length, 1);
  const [order] = updated.orders;
  assert.equal(order.id, updated.selectedOrderId);
  assert.equal(order.total, 8070);
  assert.equal(order.subtotal, 8070);
  assert.equal(order.paymentStatus, 'SIMULADO');
  assert.equal(order.status, 'RECEBIDO');
  assert.match(order.createdAt, /Z$/);
  assert.deepEqual(updated.cart, []);
  assert.throws(() => createOrder(updated, cart, 'Pix simulado', prices), /carrinho mudou/);
});

test('demo checkout rejects stale carts and invalid catalog prices or quantities', () => {
  assert.throws(() => createOrder(session, [], 'Pix simulado', prices), /carrinho mudou/);
  for (const invalid of [{ ...cart[0], unitPrice: 1 }, { ...cart[0], quantity: 1.5 }, { ...cart[0], quantity: 21 }, { ...cart[0], productId: 'unknown' }]) {
    assert.throws(() => createOrder({ ...session, cart: [invalid] }, [invalid], 'Pix simulado', prices), /Revise/);
  }
});

test('demo order status has one successor and a terminal state', () => {
  assert.equal(nextStatus('RECEBIDO'), 'EM_PREPARO');
  assert.equal(nextStatus('EM_PREPARO'), 'PRONTO');
  assert.equal(nextStatus('PRONTO'), 'CONCLUIDO');
  assert.equal(nextStatus('CONCLUIDO'), undefined);
});
