import { CustomerId } from '../customer.entity';
import { EventSpotId } from '../event-spot';
import { Order, OrderStatus } from '../order.entity';
import { OrderCancelled } from '../../events/domain-events/order-cancelled.event';
import { initOrm } from './helpers';

describe('Order Entity Unit Tests', () => {
  initOrm();

  function createPaidOrder() {
    const order = Order.create({
      customer_id: new CustomerId(),
      event_spot_id: new EventSpotId(),
      amount: 100,
    });
    order.pay();
    order.clearEvents();
    return order;
  }

  test('deve cancelar um pedido e registrar o OrderCancelled com o event_spot_id', () => {
    const order = createPaidOrder();

    order.cancel();

    expect(order.status).toBe(OrderStatus.CANCELLED);
    const events = [...order.events];
    expect(events).toHaveLength(1);
    const event = events[0] as OrderCancelled;
    expect(event).toBeInstanceOf(OrderCancelled);
    expect(event.aggregate_id.equals(order.id)).toBe(true);
    expect(event.status).toBe(OrderStatus.CANCELLED);
    expect(event.event_spot_id.equals(order.event_spot_id)).toBe(true);
  });

  test('não deve cancelar um pedido já cancelado', () => {
    const order = createPaidOrder();
    order.cancel();
    order.clearEvents();

    expect(() => order.cancel()).toThrowError('Order already cancelled');
    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.events.size).toBe(0);
  });
});
