import { IDomainEvent } from '../../../../common/domain/domain-event';
import { CustomerId } from '../../entities/customer.entity';
import { EventSectionId } from '../../entities/event-section';
import { EventSpotId } from '../../entities/event-spot';
import { EventId } from '../../entities/event.entity';
import { WaitingListEntryId } from '../../entities/waiting-list-entry.entity';
import { WaitingListId } from '../../entities/waiting-list.entity';

export class SpotOfferedToWaitingCustomer implements IDomainEvent {
  readonly event_version: number = 1;
  readonly occurred_on: Date;

  constructor(
    readonly aggregate_id: WaitingListId,
    readonly event_id: EventId,
    readonly section_id: EventSectionId,
    readonly spot_id: EventSpotId,
    readonly entry_id: WaitingListEntryId,
    readonly customer_id: CustomerId,
  ) {
    this.occurred_on = new Date();
  }
}
