import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  CustomerSchema,
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  PartnerSchema,
  WaitingListEntrySchema,
  WaitingListSchema,
} from '../../schemas';
import { Partner } from '../../../../domain/entities/partner.entity';
import { Customer } from '../../../../domain/entities/customer.entity';
import { WaitingList } from '../../../../domain/entities/waiting-list.entity';
import { WaitingListEntryStatus } from '../../../../domain/entities/waiting-list-entry.entity';
import { EventSpotId } from '../../../../domain/entities/event-spot';
import { PartnerMysqlRepository } from '../partner-mysql.repository';
import { CustomerMysqlRepository } from '../customer-mysql.repository';
import { EventMysqlRepository } from '../event-mysql.repository';
import { WaitingListMysqlRepository } from '../waiting-list-mysql.repository';

describe('WaitingListMysqlRepository', () => {
  let orm: MikroORM<MySqlDriver>;

  beforeEach(async () => {
    orm = await MikroORM.init<MySqlDriver>({
      entities: [
        CustomerSchema,
        PartnerSchema,
        EventSchema,
        EventSectionSchema,
        EventSpotSchema,
        WaitingListSchema,
        WaitingListEntrySchema,
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

  async function arrange() {
    const em = orm.em.fork();
    const partner = Partner.create({ name: 'Partner 1' });
    await new PartnerMysqlRepository(em).add(partner);
    const event = partner.initEvent({
      name: 'Event 1',
      date: new Date(),
      description: null,
    });
    event.addSection({ name: 'S1', price: 100, total_spots: 1 });
    event.addSection({ name: 'S2', price: 100, total_spots: 1 });
    await new EventMysqlRepository(em).add(event);
    const customerRepo = new CustomerMysqlRepository(em);
    const customer1 = Customer.create({ name: 'C1', cpf: '70375887091' });
    const customer2 = Customer.create({ name: 'C2', cpf: '59211087074' });
    await customerRepo.add(customer1);
    await customerRepo.add(customer2);
    await em.flush();
    return { event, customer1, customer2 };
  }

  test('deve persistir a lista com entradas e recarregá-la pela busca evento + seção', async () => {
    const { event, customer1, customer2 } = await arrange();
    const [section1, section2] = event.sections.values();
    const em = orm.em.fork();
    const repo = new WaitingListMysqlRepository(em);

    const waitingList = WaitingList.create({
      event_id: event.id,
      section_id: section1.id,
    });
    waitingList.join({ customer_id: customer1.id });
    waitingList.join({ customer_id: customer2.id });
    waitingList.notifyFirstPending({ spot_id: new EventSpotId() });
    await repo.add(waitingList);
    await em.flush();
    em.clear();

    const found = await repo.findByEventAndSection(event.id, section1.id);

    expect(found).toBeInstanceOf(WaitingList);
    expect(found.id.equals(waitingList.id)).toBe(true);
    expect(found.event_id.equals(event.id)).toBe(true);
    expect(found.section_id.equals(section1.id)).toBe(true);
    expect(found.events.size).toBe(0);

    const entries = found.orderedEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].customer_id.equals(customer1.id)).toBe(true);
    expect(entries[0].position).toBe(1);
    expect(entries[0].status).toBe(WaitingListEntryStatus.NOTIFIED);
    expect(entries[0].notified_at).toBeInstanceOf(Date);
    expect(entries[1].customer_id.equals(customer2.id)).toBe(true);
    expect(entries[1].position).toBe(2);
    expect(entries[1].status).toBe(WaitingListEntryStatus.PENDING);
    expect(entries[1].notified_at).toBeNull();

    // as invariantes continuam valendo sobre o agregado reidratado
    expect(() => found.join({ customer_id: customer2.id })).toThrowError(
      'Customer already in waiting list',
    );

    // busca por id e por strings
    const byId = await repo.findById(waitingList.id.value);
    expect(byId.id.equals(waitingList.id)).toBe(true);
    const byStrings = await repo.findByEventAndSection(
      event.id.value,
      section1.id.value,
    );
    expect(byStrings.id.equals(waitingList.id)).toBe(true);

    // outra seção do mesmo evento não tem fila
    expect(await repo.findByEventAndSection(event.id, section2.id)).toBeNull();
  });

  test('deve persistir novas entradas de uma lista já existente', async () => {
    const { event, customer1, customer2 } = await arrange();
    const section = event.sections.values()[0];
    let em = orm.em.fork();
    let repo = new WaitingListMysqlRepository(em);

    const waitingList = WaitingList.create({
      event_id: event.id,
      section_id: section.id,
    });
    waitingList.join({ customer_id: customer1.id });
    await repo.add(waitingList);
    await em.flush();

    em = orm.em.fork();
    repo = new WaitingListMysqlRepository(em);
    const loaded = await repo.findByEventAndSection(event.id, section.id);
    loaded.join({ customer_id: customer2.id });
    await repo.add(loaded);
    await em.flush();

    em = orm.em.fork();
    repo = new WaitingListMysqlRepository(em);
    const reloaded = await repo.findByEventAndSection(event.id, section.id);
    expect(reloaded.orderedEntries().map((e) => e.position)).toEqual([1, 2]);
    expect(await repo.findAll()).toHaveLength(1);
  });
});
