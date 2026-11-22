import { CustomerId } from '../customer.entity';
import { EventSectionId } from '../event-section';
import { EventSpotId } from '../event-spot';
import { EventId } from '../event.entity';
import { WaitingListEntryStatus } from '../waiting-list-entry.entity';
import { WaitingList } from '../waiting-list.entity';
import { CustomerJoinedWaitingList } from '../../events/domain-events/customer-joined-waiting-list.event';
import { SpotOfferedToWaitingCustomer } from '../../events/domain-events/spot-offered-to-waiting-customer.event';
import { initOrm } from './helpers';

describe('WaitingList Aggregate Unit Tests', () => {
  initOrm();

  function createWaitingList() {
    return WaitingList.create({
      event_id: new EventId(),
      section_id: new EventSectionId(),
    });
  }

  test('deve registrar a entrada na fila por ordem de chegada', () => {
    const waitingList = createWaitingList();
    const customer1 = new CustomerId();
    const customer2 = new CustomerId();

    const entry1 = waitingList.join({ customer_id: customer1 });
    const entry2 = waitingList.join({ customer_id: customer2 });

    expect(waitingList.entries.size).toBe(2);
    expect(entry1.position).toBe(1);
    expect(entry2.position).toBe(2);
    expect(entry1.status).toBe(WaitingListEntryStatus.PENDING);
    expect(entry2.status).toBe(WaitingListEntryStatus.PENDING);

    const events = [...waitingList.events] as CustomerJoinedWaitingList[];
    expect(events).toHaveLength(2);
    events.forEach((e) => expect(e).toBeInstanceOf(CustomerJoinedWaitingList));
    expect(events[0].aggregate_id.equals(waitingList.id)).toBe(true);
    expect(events[0].event_id.equals(waitingList.event_id)).toBe(true);
    expect(events[0].section_id.equals(waitingList.section_id)).toBe(true);
    expect(events[0].customer_id.equals(customer1)).toBe(true);
    expect(events[0].entry_id.equals(entry1.id)).toBe(true);
    expect(events[0].position).toBe(1);
    expect(events[1].customer_id.equals(customer2)).toBe(true);
  });

  test('não deve aceitar o mesmo cliente duas vezes enquanto tiver entrada pendente', () => {
    const waitingList = createWaitingList();
    const customer = new CustomerId();
    waitingList.join({ customer_id: customer });
    waitingList.clearEvents();

    expect(() =>
      waitingList.join({ customer_id: new CustomerId(customer.value) }),
    ).toThrowError('Customer already in waiting list');
    expect(waitingList.entries.size).toBe(1);
    expect(waitingList.events.size).toBe(0);
  });

  test('deve permitir que o cliente volte à fila depois de notificado', () => {
    const waitingList = createWaitingList();
    const customer = new CustomerId();
    waitingList.join({ customer_id: customer });
    waitingList.notifyFirstPending({ spot_id: new EventSpotId() });

    const entry = waitingList.join({ customer_id: customer });

    expect(entry.position).toBe(2);
    expect(waitingList.entries.size).toBe(2);
  });

  test('a notificação promove a primeira entrada pendente e registra o SpotOfferedToWaitingCustomer', () => {
    const waitingList = createWaitingList();
    const customer1 = new CustomerId();
    const customer2 = new CustomerId();
    const entry1 = waitingList.join({ customer_id: customer1 });
    const entry2 = waitingList.join({ customer_id: customer2 });
    waitingList.clearEvents();
    const spotId = new EventSpotId();

    const notified = waitingList.notifyFirstPending({ spot_id: spotId });

    expect(notified).toBe(entry1);
    expect(entry1.status).toBe(WaitingListEntryStatus.NOTIFIED);
    expect(entry1.notified_at).toBeInstanceOf(Date);
    expect(entry2.status).toBe(WaitingListEntryStatus.PENDING);

    const events = [...waitingList.events];
    expect(events).toHaveLength(1);
    const offered = events[0] as SpotOfferedToWaitingCustomer;
    expect(offered).toBeInstanceOf(SpotOfferedToWaitingCustomer);
    expect(offered.aggregate_id.equals(waitingList.id)).toBe(true);
    expect(offered.customer_id.equals(customer1)).toBe(true);
    expect(offered.entry_id.equals(entry1.id)).toBe(true);
    expect(offered.event_id.equals(waitingList.event_id)).toBe(true);
    expect(offered.section_id.equals(waitingList.section_id)).toBe(true);
    expect(offered.spot_id.equals(spotId)).toBe(true);

    // a próxima notificação vai para o segundo da fila
    waitingList.notifyFirstPending({ spot_id: new EventSpotId() });
    expect(entry2.status).toBe(WaitingListEntryStatus.NOTIFIED);
  });

  test('notificar sem entradas pendentes não faz nada', () => {
    const emptyList = createWaitingList();

    expect(emptyList.notifyFirstPending({ spot_id: new EventSpotId() })).toBe(
      null,
    );
    expect(emptyList.events.size).toBe(0);

    const allNotified = createWaitingList();
    const entry = allNotified.join({ customer_id: new CustomerId() });
    allNotified.notifyFirstPending({ spot_id: new EventSpotId() });
    allNotified.clearEvents();

    expect(allNotified.notifyFirstPending({ spot_id: new EventSpotId() })).toBe(
      null,
    );
    expect(entry.status).toBe(WaitingListEntryStatus.NOTIFIED);
    expect(allNotified.events.size).toBe(0);
  });
});
