import { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/mysql';
import { Event, EventId } from '../../../domain/entities/event.entity';
import { EventSpotId } from '../../../domain/entities/event-spot';
import { IEventRepository } from '../../../domain/repositories/event-repository.interface';

export class EventMysqlRepository implements IEventRepository {
  constructor(private entityManager: EntityManager) {}

  async add(entity: Event): Promise<void> {
    this.entityManager.persist(entity);
  }

  async findById(id: string | EventId): Promise<Event> {
    return this.entityManager.findOne(Event, {
      id: typeof id === 'string' ? new EventId(id) : id,
    });
  }

  async findByEventSpotId(spot_id: string | EventSpotId): Promise<Event> {
    // atravessa Event -> EventSection -> EventSpot para achar o dono do lugar
    // (o cast é necessário porque o domínio expõe ICollection, não Collection)
    const where = {
      sections: {
        spots: {
          id: typeof spot_id === 'string' ? new EventSpotId(spot_id) : spot_id,
        },
      },
    } as unknown as FilterQuery<Event>;
    return this.entityManager.findOne(Event, where);
  }

  async findAll(): Promise<Event[]> {
    return this.entityManager.find(Event, {});
  }

  async delete(entity: Event): Promise<void> {
    await this.entityManager.remove(entity);
  }
}
