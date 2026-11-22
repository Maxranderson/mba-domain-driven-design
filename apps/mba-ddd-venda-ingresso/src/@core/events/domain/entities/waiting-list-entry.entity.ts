import { Entity } from '../../../common/domain/entity';
import Uuid from '../../../common/domain/value-objects/uuid.vo';
import { CustomerId } from './customer.entity';

export class WaitingListEntryId extends Uuid {}

export enum WaitingListEntryStatus {
  PENDING = 'PENDING',
  NOTIFIED = 'NOTIFIED',
}

export type WaitingListEntryCreateCommand = {
  customer_id: CustomerId;
  position: number;
};

export type WaitingListEntryConstructorProps = {
  id?: WaitingListEntryId | string;
  customer_id: CustomerId | string;
  status: WaitingListEntryStatus;
  position: number;
  joined_at: Date;
  notified_at: Date | null;
};

export class WaitingListEntry extends Entity {
  id: WaitingListEntryId;
  customer_id: CustomerId;
  status: WaitingListEntryStatus;
  position: number;
  joined_at: Date;
  notified_at: Date | null;

  constructor(props: WaitingListEntryConstructorProps) {
    super();
    this.id =
      typeof props.id === 'string'
        ? new WaitingListEntryId(props.id)
        : props.id ?? new WaitingListEntryId();
    this.customer_id =
      props.customer_id instanceof CustomerId
        ? props.customer_id
        : new CustomerId(props.customer_id);
    this.status = props.status;
    this.position = props.position;
    this.joined_at = props.joined_at;
    this.notified_at = props.notified_at ?? null;
  }

  static create(command: WaitingListEntryCreateCommand) {
    return new WaitingListEntry({
      customer_id: command.customer_id,
      position: command.position,
      status: WaitingListEntryStatus.PENDING,
      joined_at: new Date(),
      notified_at: null,
    });
  }

  isPending() {
    return this.status === WaitingListEntryStatus.PENDING;
  }

  belongsTo(customer_id: CustomerId) {
    return this.customer_id.equals(customer_id);
  }

  notify() {
    if (!this.isPending()) {
      throw new Error('Waiting list entry is not pending');
    }
    this.status = WaitingListEntryStatus.NOTIFIED;
    this.notified_at = new Date();
  }

  toJSON() {
    return {
      id: this.id.value,
      customer_id: this.customer_id.value,
      status: this.status,
      position: this.position,
      joined_at: this.joined_at,
      notified_at: this.notified_at,
    };
  }
}
