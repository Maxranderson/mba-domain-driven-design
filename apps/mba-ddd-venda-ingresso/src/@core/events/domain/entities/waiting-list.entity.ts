import { AggregateRoot } from '../../../common/domain/aggregate-root';
import {
  AnyCollection,
  ICollection,
  MyCollectionFactory,
} from '../../../common/domain/my-collection';
import Uuid from '../../../common/domain/value-objects/uuid.vo';
import { CustomerJoinedWaitingList } from '../events/domain-events/customer-joined-waiting-list.event';
import { SpotOfferedToWaitingCustomer } from '../events/domain-events/spot-offered-to-waiting-customer.event';
import { CustomerId } from './customer.entity';
import { EventSectionId } from './event-section';
import { EventSpotId } from './event-spot';
import { EventId } from './event.entity';
import { WaitingListEntry } from './waiting-list-entry.entity';

export class WaitingListId extends Uuid {}

export type CreateWaitingListCommand = {
  event_id: EventId;
  section_id: EventSectionId;
};

export type WaitingListConstructorProps = {
  id?: WaitingListId | string;
  event_id: EventId | string;
  section_id: EventSectionId | string;
};

export class WaitingList extends AggregateRoot {
  id: WaitingListId;
  event_id: EventId;
  section_id: EventSectionId;
  private _entries: ICollection<WaitingListEntry>;

  constructor(props: WaitingListConstructorProps) {
    super();
    this.id =
      typeof props.id === 'string'
        ? new WaitingListId(props.id)
        : props.id ?? new WaitingListId();
    this.event_id =
      props.event_id instanceof EventId
        ? props.event_id
        : new EventId(props.event_id);
    this.section_id =
      props.section_id instanceof EventSectionId
        ? props.section_id
        : new EventSectionId(props.section_id);
    this._entries = MyCollectionFactory.create<WaitingListEntry>(this);
  }

  static create(command: CreateWaitingListCommand) {
    return new WaitingList({
      event_id: command.event_id,
      section_id: command.section_id,
    });
  }

  join(command: { customer_id: CustomerId }) {
    const alreadyWaiting = this.entries.find(
      (entry) => entry.belongsTo(command.customer_id) && entry.isPending(),
    );
    if (alreadyWaiting) {
      throw new Error('Customer already in waiting list');
    }

    const entry = WaitingListEntry.create({
      customer_id: command.customer_id,
      position: this.nextPosition(),
    });
    this.entries.add(entry);
    this.addEvent(
      new CustomerJoinedWaitingList(
        this.id,
        this.event_id,
        this.section_id,
        entry.id,
        entry.customer_id,
        entry.position,
      ),
    );
    return entry;
  }

  notifyFirstPending(command: { spot_id: EventSpotId }) {
    const entry = this.firstPendingEntry();
    if (!entry) {
      return null;
    }

    entry.notify();
    this.addEvent(
      new SpotOfferedToWaitingCustomer(
        this.id,
        this.event_id,
        this.section_id,
        command.spot_id,
        entry.id,
        entry.customer_id,
      ),
    );
    return entry;
  }

  firstPendingEntry(): WaitingListEntry | undefined {
    return this.orderedEntries().find((entry) => entry.isPending());
  }

  orderedEntries(): WaitingListEntry[] {
    return [...this.entries.values()].sort((a, b) => a.position - b.position);
  }

  private nextPosition() {
    const positions = this.entries.map((entry) => entry.position);
    return positions.length ? Math.max(...positions) + 1 : 1;
  }

  get entries(): ICollection<WaitingListEntry> {
    return this._entries as ICollection<WaitingListEntry>;
  }

  set entries(entries: AnyCollection<WaitingListEntry>) {
    this._entries = MyCollectionFactory.createFrom<WaitingListEntry>(entries);
  }

  toJSON() {
    return {
      id: this.id.value,
      event_id: this.event_id.value,
      section_id: this.section_id.value,
      entries: this.orderedEntries().map((entry) => entry.toJSON()),
    };
  }
}
