import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  CustomerSchema,
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  OrderSchema,
  PartnerSchema,
  SpotReservationSchema,
  WaitingListEntrySchema,
  WaitingListSchema,
} from '../infra/db/schemas';
import { StoredEventSchema } from '../../stored-events/infra/db/schemas';
import { StoredEventMysqlRepository } from '../../stored-events/infra/db/repositories/stored-event-mysql.repository';
import { StoredEvent } from '../../stored-events/domain/entities/stored-event.entity';
import { UnitOfWorkMikroOrm } from '../../common/infra/unit-of-work-mikro-orm';
import { ApplicationService } from '../../common/application/application.service';
import { DomainEventManager } from '../../common/domain/domain-event-manager';
import { IDomainEvent } from '../../common/domain/domain-event';
import { IIntegrationEvent } from '../../common/domain/integration-event';
import { CustomerMysqlRepository } from '../infra/db/repositories/customer-mysql.repository';
import { PartnerMysqlRepository } from '../infra/db/repositories/partner-mysql.repository';
import { EventMysqlRepository } from '../infra/db/repositories/event-mysql.repository';
import { OrderMysqlRepository } from '../infra/db/repositories/order-mysql.repository';
import { SpotReservationMysqlRepository } from '../infra/db/repositories/spot-reservation-mysql.repository';
import { WaitingListMysqlRepository } from '../infra/db/repositories/waiting-list-mysql.repository';
import { Customer } from '../domain/entities/customer.entity';
import { Partner } from '../domain/entities/partner.entity';
import { OrderStatus } from '../domain/entities/order.entity';
import { WaitingListEntryStatus } from '../domain/entities/waiting-list-entry.entity';
import { SpotOfferedToWaitingCustomer } from '../domain/events/domain-events/spot-offered-to-waiting-customer.event';
import { SpotOfferedToWaitingCustomerIntegrationEvent } from '../domain/events/integration-events/spot-offered-to-waiting-customer.int-events';
import { OrderService } from './order.service';
import { WaitingListService } from './waiting-list.service';
import { PaymentGateway } from './payment.gateway';
import { ReleaseSpotOnOrderCancelledHandler } from './handlers/release-spot-on-order-cancelled.handler';
import { NotifyWaitingListOnSpotReleasedHandler } from './handlers/notify-waiting-list-on-spot-released.handler';
import { EntityManager } from '@mikro-orm/mysql';

describe('Fluxo: cancelamento do pedido -> liberação do lugar -> notificação da lista de espera', () => {
  let orm: MikroORM<MySqlDriver>;

  beforeEach(async () => {
    orm = await MikroORM.init<MySqlDriver>({
      entities: [
        CustomerSchema,
        PartnerSchema,
        EventSchema,
        EventSectionSchema,
        EventSpotSchema,
        OrderSchema,
        SpotReservationSchema,
        WaitingListSchema,
        WaitingListEntrySchema,
        StoredEventSchema,
      ],
      dbName: 'events',
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'root',
      type: 'mysql',
      forceEntityConstructor: true,
    });
    await orm.schema.refreshDatabase();
  });

  afterEach(async () => {
    await orm.close();
  });

  /**
   * Monta o grafo de objetos de um "request": um EntityManager, os
   * repositórios, o ApplicationService e os handlers registrados no
   * DomainEventManager, reproduzindo DomainEventsModule.onModuleInit (stored
   * events) e EventsModule.onModuleInit (handlers + evento de integração).
   */
  function compose(em: EntityManager) {
    const uow = new UnitOfWorkMikroOrm(em);
    const domainEventManager = new DomainEventManager();
    const applicationService = new ApplicationService(uow, domainEventManager);

    const customerRepo = new CustomerMysqlRepository(em);
    const eventRepo = new EventMysqlRepository(em);
    const orderRepo = new OrderMysqlRepository(em);
    const spotReservationRepo = new SpotReservationMysqlRepository(em);
    const waitingListRepo = new WaitingListMysqlRepository(em);
    const storedEventRepo = new StoredEventMysqlRepository(em);

    // DomainEventsModule.onModuleInit
    domainEventManager.register('*', async (event: IDomainEvent) => {
      storedEventRepo.add(event);
    });

    // EventsModule.onModuleInit
    const releaseSpotHandler = new ReleaseSpotOnOrderCancelledHandler(
      eventRepo,
      spotReservationRepo,
      domainEventManager,
    );
    const notifyWaitingListHandler = new NotifyWaitingListOnSpotReleasedHandler(
      waitingListRepo,
      domainEventManager,
    );
    [releaseSpotHandler, notifyWaitingListHandler].forEach((handler) => {
      (handler.constructor as any)
        .listensTo()
        .forEach((eventName: string) =>
          domainEventManager.register(eventName, (e) => handler.handle(e)),
        );
    });

    // no app real, o mapeamento enfileira na fila Bull "integration-events"
    const integrationEventsQueue: IIntegrationEvent[] = [];
    domainEventManager.registerForIntegrationEvent(
      SpotOfferedToWaitingCustomer.name,
      async (event) => {
        integrationEventsQueue.push(
          new SpotOfferedToWaitingCustomerIntegrationEvent(event),
        );
      },
    );

    const orderService = new OrderService(
      orderRepo,
      customerRepo,
      eventRepo,
      spotReservationRepo,
      uow,
      new PaymentGateway(),
      applicationService,
    );
    const waitingListService = new WaitingListService(
      waitingListRepo,
      customerRepo,
      eventRepo,
      applicationService,
    );

    return {
      orderService,
      waitingListService,
      eventRepo,
      orderRepo,
      spotReservationRepo,
      waitingListRepo,
      integrationEventsQueue,
    };
  }

  async function arrangeSoldOutSection() {
    const em = orm.em.fork();
    const customerRepo = new CustomerMysqlRepository(em);
    const buyer = Customer.create({ name: 'Buyer', cpf: '70375887091' });
    const waiting1 = Customer.create({ name: 'First', cpf: '59211087074' });
    const waiting2 = Customer.create({ name: 'Second', cpf: '99346413050' });
    await customerRepo.add(buyer);
    await customerRepo.add(waiting1);
    await customerRepo.add(waiting2);

    const partner = Partner.create({ name: 'Partner 1' });
    await new PartnerMysqlRepository(em).add(partner);
    const event = partner.initEvent({
      name: 'Event 1',
      description: 'Event 1',
      date: new Date(),
    });
    event.addSection({ name: 'VIP', price: 500, total_spots: 1 });
    event.addSection({ name: 'Pista', price: 100, total_spots: 5 });
    event.publishAll();
    await new EventMysqlRepository(em).add(event);
    await em.flush();

    const section = event.sections.values()[0];
    const spot = section.spots.values()[0];

    // compra do único lugar da seção pelo fluxo existente
    const purchase = compose(orm.em.fork());
    const order = await purchase.orderService.create({
      event_id: event.id.value,
      section_id: section.id.value,
      spot_id: spot.id.value,
      customer_id: buyer.id.value,
      card_token: 'tok_visa',
    });

    // seção esgotada: dois clientes entram na fila, por ordem de chegada
    const joining = compose(orm.em.fork());
    await joining.waitingListService.join({
      event_id: event.id.value,
      section_id: section.id.value,
      customer_id: waiting1.id.value,
    });
    await joining.waitingListService.join({
      event_id: event.id.value,
      section_id: section.id.value,
      customer_id: waiting2.id.value,
    });

    return { event, section, spot, order, buyer, waiting1, waiting2 };
  }

  test('um único comando de cancelamento libera o lugar, remove a trava e notifica o primeiro da fila', async () => {
    const { event, section, spot, order, waiting1, waiting2 } =
      await arrangeSoldOutSection();

    // pré-condições
    let check = compose(orm.em.fork());
    expect((await check.orderRepo.findById(order.id)).status).toBe(
      OrderStatus.PAID,
    );
    expect(await check.spotReservationRepo.findById(spot.id)).not.toBeNull();
    expect(
      (await check.eventRepo.findById(event.id)).isSectionSoldOut(section.id),
    ).toBe(true);

    // o comando
    const request = compose(orm.em.fork());
    const cancelled = await request.orderService.cancel({
      order_id: order.id.value,
    });
    expect(cancelled.status).toBe(OrderStatus.CANCELLED);

    // asserções sobre o estado persistido, a partir de um EM limpo
    check = compose(orm.em.fork());

    const orderFound = await check.orderRepo.findById(order.id);
    expect(orderFound.status).toBe(OrderStatus.CANCELLED);

    // 1) o lugar voltou a disponível
    const eventFound = await check.eventRepo.findById(event.id);
    const spotFound = eventFound.sections
      .find((s) => s.id.equals(section.id))
      .spots.find((s) => s.id.equals(spot.id));
    expect(spotFound.is_reserved).toBe(false);
    expect(
      eventFound.allowReserveSpot({ section_id: section.id, spot_id: spot.id }),
    ).toBe(true);
    expect(eventFound.isSectionSoldOut(section.id)).toBe(false);

    // 2) a trava de reserva não existe mais
    expect(await check.spotReservationRepo.findById(spot.id)).toBeNull();

    // 3) a primeira entrada da fila está NOTIFIED; a segunda segue PENDING
    const waitingList = await check.waitingListRepo.findByEventAndSection(
      event.id,
      section.id,
    );
    const [first, second] = waitingList.orderedEntries();
    expect(first.customer_id.equals(waiting1.id)).toBe(true);
    expect(first.status).toBe(WaitingListEntryStatus.NOTIFIED);
    expect(second.customer_id.equals(waiting2.id)).toBe(true);
    expect(second.status).toBe(WaitingListEntryStatus.PENDING);

    // o evento de integração foi produzido para o contexto de e-mails
    expect(request.integrationEventsQueue).toHaveLength(1);
    const integrationEvent = request.integrationEventsQueue[0];
    expect(integrationEvent.event_name).toBe(
      'SpotOfferedToWaitingCustomerIntegrationEvent',
    );
    expect(integrationEvent.payload).toEqual({
      customer_id: waiting1.id.value,
      event_id: event.id.value,
      section_id: section.id.value,
      spot_id: spot.id.value,
    });

    // e toda a cadeia ficou registrada na stored_event
    const storedTypes = (
      await orm.em
        .fork()
        .find(StoredEvent, {}, { orderBy: { occurred_on: 'ASC' } })
    ).map((e) => e.type_name);
    expect(storedTypes).toEqual(
      expect.arrayContaining([
        'CustomerJoinedWaitingList',
        'OrderCancelled',
        'EventSpotReleased',
        'SpotOfferedToWaitingCustomer',
      ]),
    );
  });

  test('o cancelamento libera o lugar sem erro quando a seção não tem lista de espera', async () => {
    const em = orm.em.fork();
    const buyer = Customer.create({ name: 'Buyer', cpf: '70375887091' });
    await new CustomerMysqlRepository(em).add(buyer);
    const partner = Partner.create({ name: 'Partner 1' });
    await new PartnerMysqlRepository(em).add(partner);
    const event = partner.initEvent({ name: 'Event 1', date: new Date() });
    event.addSection({ name: 'VIP', price: 500, total_spots: 1 });
    event.publishAll();
    await new EventMysqlRepository(em).add(event);
    await em.flush();
    const section = event.sections.values()[0];
    const spot = section.spots.values()[0];

    const order = await compose(orm.em.fork()).orderService.create({
      event_id: event.id.value,
      section_id: section.id.value,
      spot_id: spot.id.value,
      customer_id: buyer.id.value,
      card_token: 'tok_visa',
    });

    const request = compose(orm.em.fork());
    await request.orderService.cancel({ order_id: order.id.value });

    const check = compose(orm.em.fork());
    const eventFound = await check.eventRepo.findById(event.id);
    expect(eventFound.isSectionSoldOut(section.id)).toBe(false);
    expect(await check.spotReservationRepo.findById(spot.id)).toBeNull();
    expect(
      await check.waitingListRepo.findByEventAndSection(event.id, section.id),
    ).toBeNull();
    expect(request.integrationEventsQueue).toHaveLength(0);
  });

  test('não cancela duas vezes o mesmo pedido', async () => {
    const { order } = await arrangeSoldOutSection();
    await compose(orm.em.fork()).orderService.cancel({
      order_id: order.id.value,
    });

    await expect(
      compose(orm.em.fork()).orderService.cancel({ order_id: order.id.value }),
    ).rejects.toThrowError('Order already cancelled');
  });

  test('a fila só aceita clientes quando a seção está esgotada e não repete cliente pendente', async () => {
    const { event, waiting1 } = await arrangeSoldOutSection();
    const svc = compose(orm.em.fork()).waitingListService;
    const pista = event.sections.values()[1];

    await expect(
      svc.join({
        event_id: event.id.value,
        section_id: pista.id.value,
        customer_id: waiting1.id.value,
      }),
    ).rejects.toThrowError('Section is not sold out');

    await expect(
      compose(orm.em.fork()).waitingListService.join({
        event_id: event.id.value,
        section_id: event.sections.values()[0].id.value,
        customer_id: waiting1.id.value,
      }),
    ).rejects.toThrowError('Customer already in waiting list');

    const list = await compose(
      orm.em.fork(),
    ).waitingListService.findWaitingList({
      event_id: event.id.value,
      section_id: event.sections.values()[0].id.value,
    });
    expect(list.entries.size).toBe(2);
  });
});
