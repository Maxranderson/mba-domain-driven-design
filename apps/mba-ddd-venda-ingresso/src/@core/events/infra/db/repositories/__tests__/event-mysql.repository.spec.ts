import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  PartnerSchema,
} from '../../schemas';
import { Event } from '../../../../domain/entities/event.entity';
import { EventMysqlRepository } from '../event-mysql.repository';
import { Partner } from '../../../../domain/entities/partner.entity';
import { PartnerMysqlRepository } from '../partner-mysql.repository';
import { EventSpotId } from '../../../../domain/entities/event-spot';

test('Event repository', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [EventSchema, EventSectionSchema, EventSpotSchema, PartnerSchema],
    dbName: 'events',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    type: 'mysql',
    forceEntityConstructor: true,
    debug: true,
  });
  await orm.schema.refreshDatabase();
  const em = orm.em.fork();
  const partnerRepo = new PartnerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);

  const partner = Partner.create({ name: 'Partner 1' });
  await partnerRepo.add(partner);
  const event = partner.initEvent({
    name: 'Event 1',
    date: new Date(),
    description: 'Event 1 description',
  });

  event.addSection({
    name: 'Section 1',
    description: 'Section 1 description',
    price: 100,
    total_spots: 1000,
  });

  await eventRepo.add(event);
  await em.flush();
  await em.clear();

  const eventFound = await eventRepo.findById(event.id);
  console.log(eventFound);

  await orm.close();
});

test('deve encontrar o evento dono de um lugar (findByEventSpotId)', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [EventSchema, EventSectionSchema, EventSpotSchema, PartnerSchema],
    dbName: 'events',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    type: 'mysql',
    forceEntityConstructor: true,
  });
  await orm.schema.refreshDatabase();
  const em = orm.em.fork();
  const partnerRepo = new PartnerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);

  const partner = Partner.create({ name: 'Partner 1' });
  await partnerRepo.add(partner);
  const event1 = partner.initEvent({ name: 'Event 1', date: new Date() });
  event1.addSection({ name: 'S1', price: 100, total_spots: 3 });
  event1.addSection({ name: 'S2', price: 100, total_spots: 2 });
  const event2 = partner.initEvent({ name: 'Event 2', date: new Date() });
  event2.addSection({ name: 'S1', price: 100, total_spots: 1 });
  await eventRepo.add(event1);
  await eventRepo.add(event2);
  await em.flush();
  em.clear();

  const spotOfSection2 = event1.sections.values()[1].spots.values()[1];
  const found = await eventRepo.findByEventSpotId(spotOfSection2.id);

  expect(found).toBeInstanceOf(Event);
  expect(found.id.equals(event1.id)).toBe(true);
  // o agregado vem inteiro, não só o ramo filtrado
  expect(found.sections.size).toBe(2);
  expect(found.sections.values().find((s) => s.name === 'S1').spots.size).toBe(
    3,
  );
  expect(found.sections.values().find((s) => s.name === 'S2').spots.size).toBe(
    2,
  );

  const foundByString = await eventRepo.findByEventSpotId(
    event2.sections.values()[0].spots.values()[0].id.value,
  );
  expect(foundByString.id.equals(event2.id)).toBe(true);

  expect(await eventRepo.findByEventSpotId(new EventSpotId())).toBeNull();

  await orm.close();
});
