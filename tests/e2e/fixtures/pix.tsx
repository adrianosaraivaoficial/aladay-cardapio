import { createRoot } from 'react-dom/client';
import { PixPaymentModal } from '../../../src/components/PixPaymentModal';
import type { Order, RestaurantTenant } from '../../../src/types';

const order: Order = {
  id: 'fixture-order', orderNumber: 123, tenantId: 'fixture', tenantSlug: 'fixture',
  customerName: 'Cliente de teste', customerPhone: '', type: 'pickup', items: [],
  subtotalCents: 3290, deliveryFeeCents: 0, totalCents: 3290, status: 'received',
  paymentStatus: 'pending', paymentMethod: 'Pix', whatsAppStatus: 'sending',
  whatsAppLogs: [], createdAt: '', updatedAt: '',
};
const tenant = { id: 'fixture', slug: 'fixture', name: 'Restaurante de teste' } as RestaurantTenant;
const element = document.createElement('div');
document.body.append(element);
createRoot(element).render(
  <PixPaymentModal order={order} tenant={tenant} isOpen
    onPaymentApproved={updated => { element.dataset.payment = updated.paymentStatus; }}
    onClose={() => {}} onViewTracking={() => {}} />,
);
