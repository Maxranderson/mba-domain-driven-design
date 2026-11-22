import { IDomainEventHandler } from '../../../common/application/domain-event-handler.interface';
import { DomainEventManager } from '../../../common/domain/domain-event-manager';
import { EventSpotReleased } from '../../domain/events/domain-events/event-spot-released.event';
import { IWaitingListRepository } from '../../domain/repositories/waiting-list-repository.interface';

export class NotifyWaitingListOnSpotReleasedHandler
  implements IDomainEventHandler
{
  constructor(
    private waitingListRepo: IWaitingListRepository,
    private domainEventManager: DomainEventManager,
  ) {}

  async handle(domainEvent: EventSpotReleased): Promise<void> {
    const waitingList = await this.waitingListRepo.findByEventAndSection(
      domainEvent.aggregate_id,
      domainEvent.section_id,
    );

    // seção sem lista de espera: a reação termina sem efeito
    if (!waitingList) {
      return;
    }

    waitingList.notifyFirstPending({ spot_id: domainEvent.spot_id });
    await this.waitingListRepo.add(waitingList);

    await this.domainEventManager.publish(waitingList);
    await this.domainEventManager.publishForIntegrationEvent(waitingList);
  }

  static listensTo(): string[] {
    return [EventSpotReleased.name];
  }
}
