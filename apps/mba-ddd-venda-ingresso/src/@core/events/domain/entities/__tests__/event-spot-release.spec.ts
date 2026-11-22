import { Event } from '../event.entity';
import { EventSpotId } from '../event-spot';
import { PartnerId } from '../partner.entity';
import { EventSpotReleased } from '../../events/domain-events/event-spot-released.event';
import { initOrm } from './helpers';

describe('Event - liberação de lugar (markSpotAsAvailable)', () => {
  initOrm();

  function createPublishedEvent() {
    const event = Event.create({
      name: 'Evento 1',
      description: 'Descrição do evento 1',
      date: new Date(),
      partner_id: new PartnerId(),
    });
    event.addSection({
      name: 'Sessão 1',
      description: null,
      total_spots: 2,
      price: 100,
    });
    event.addSection({
      name: 'Sessão 2',
      description: null,
      total_spots: 1,
      price: 200,
    });
    event.publishAll();
    event.clearEvents();
    return event;
  }

  test('deve liberar um lugar reservado localizando a seção pelo spot_id', () => {
    const event = createPublishedEvent();
    const section2 = event.sections.values()[1];
    const spot = section2.spots.values()[0];
    event.markSpotAsReserved({ section_id: section2.id, spot_id: spot.id });
    event.clearEvents();

    event.markSpotAsAvailable({ spot_id: spot.id });

    expect(spot.is_reserved).toBe(false);
    expect(
      event.allowReserveSpot({ section_id: section2.id, spot_id: spot.id }),
    ).toBe(true);

    const events = [...event.events];
    expect(events).toHaveLength(1);
    const released = events[0] as EventSpotReleased;
    expect(released).toBeInstanceOf(EventSpotReleased);
    expect(released.aggregate_id.equals(event.id)).toBe(true);
    expect(released.section_id.equals(section2.id)).toBe(true);
    expect(released.spot_id.equals(spot.id)).toBe(true);
  });

  test('não deve liberar um lugar que não está reservado', () => {
    const event = createPublishedEvent();
    const spot = event.sections.values()[0].spots.values()[0];

    expect(() => event.markSpotAsAvailable({ spot_id: spot.id })).toThrowError(
      'Spot is not reserved',
    );
    expect(event.events.size).toBe(0);
  });

  test('deve falhar ao liberar um lugar que não pertence ao evento', () => {
    const event = createPublishedEvent();

    expect(() =>
      event.markSpotAsAvailable({ spot_id: new EventSpotId() }),
    ).toThrowError('Spot not found');
    expect(event.events.size).toBe(0);
  });

  test('a seção está esgotada quando nenhum lugar dela está disponível', () => {
    const event = createPublishedEvent();
    const [section1, section2] = event.sections.values();

    expect(event.isSectionSoldOut(section2.id)).toBe(false);

    const spot = section2.spots.values()[0];
    event.markSpotAsReserved({ section_id: section2.id, spot_id: spot.id });

    expect(event.isSectionSoldOut(section2.id)).toBe(true);
    expect(event.isSectionSoldOut(section1.id)).toBe(false);
    // o contador não é mantido pelo fluxo de compra: o esgotamento é derivado
    expect(section2.total_spots_reserved).toBe(0);

    event.markSpotAsAvailable({ spot_id: spot.id });
    expect(event.isSectionSoldOut(section2.id)).toBe(false);
  });
});
