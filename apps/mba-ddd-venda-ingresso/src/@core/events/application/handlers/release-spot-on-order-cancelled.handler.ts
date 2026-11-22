import { IDomainEventHandler } from '../../../common/application/domain-event-handler.interface';
import { DomainEventManager } from '../../../common/domain/domain-event-manager';
import { OrderCancelled } from '../../domain/events/domain-events/order-cancelled.event';
import { IEventRepository } from '../../domain/repositories/event-repository.interface';
import { ISpotReservationRepository } from '../../domain/repositories/spot-reservation-repository.interface';

/**
 * Reação ao pedido cancelado: liberação do lugar.
 * Devolve o lugar no agregado Event e remove a trava de reserva (SpotReservation).
 */
export class ReleaseSpotOnOrderCancelledHandler implements IDomainEventHandler {
  constructor(
    private eventRepo: IEventRepository,
    private spotReservationRepo: ISpotReservationRepository,
    private domainEventManager: DomainEventManager,
  ) {}

  async handle(domainEvent: OrderCancelled): Promise<void> {
    const event = await this.eventRepo.findByEventSpotId(
      domainEvent.event_spot_id,
    );

    if (!event) {
      throw new Error('Event not found');
    }

    event.markSpotAsAvailable({ spot_id: domainEvent.event_spot_id });
    await this.eventRepo.add(event);

    const spotReservation = await this.spotReservationRepo.findById(
      domainEvent.event_spot_id,
    );
    if (spotReservation) {
      await this.spotReservationRepo.delete(spotReservation);
    }

    // eventos de agregados manipulados em handlers não se publicam sozinhos
    await this.domainEventManager.publish(event);
  }

  static listensTo(): string[] {
    return [OrderCancelled.name];
  }
}
