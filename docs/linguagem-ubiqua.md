# Linguagem ubíqua — Lista de espera

Glossário da feature de cancelamento de pedido e lista de espera. A coluna **No código** indica o nome usado no modelo; termos e código devem continuar correspondendo.

| Termo | Definição | No código |
| --- | --- | --- |
| **Pedido** | Compra de um lugar por um cliente, com valor e status (pendente, pago, cancelado). | `Order`, `OrderStatus` |
| **Cancelamento do pedido** | Comando do cliente que muda o pedido para cancelado. Um pedido já cancelado não pode ser cancelado de novo. Cancelar não libera o lugar diretamente: a liberação é uma reação. | `OrderService.cancel`, `Order.cancel`, `OrderCancelled` |
| **Lugar** | Assento de uma seção de um evento; pode estar reservado ou disponível. | `EventSpot` |
| **Trava de reserva** | Registro que impede que dois clientes reservem o mesmo lugar. É removida quando o lugar é liberado. | `SpotReservation` |
| **Liberação de lugar** | Devolução de um lugar reservado à disponibilidade, feita pelo próprio evento, que encontra a seção dona do lugar. Só um lugar reservado pode ser liberado. | `Event.markSpotAsAvailable`, `EventSection.markSpotAsAvailable`, `EventSpot.markAsAvailable`, `EventSpotReleased` |
| **Seção esgotada** | Seção em que nenhum lugar está disponível para reserva. É derivada da disponibilidade dos lugares, nunca do contador `total_spots_reserved`. Um evento não publicado não está esgotado: ele ainda não está à venda. | `Event.isSectionSoldOut`, `EventSection.isSoldOut` |
| **Lista de espera** | Fila de clientes interessados em uma seção esgotada. Existe uma por seção, identificada por evento + seção. | `WaitingList` |
| **Entrada** | Posição de um cliente na lista de espera, com ordem de chegada e status. | `WaitingListEntry`, `position` |
| **Entrar na fila** | Comando do cliente para entrar na lista de espera de uma seção esgotada. Um mesmo cliente não pode entrar de novo enquanto tiver uma entrada pendente. | `WaitingListService.join`, `WaitingList.join`, `CustomerJoinedWaitingList` |
| **Entrada pendente** | Entrada que ainda aguarda um lugar. | `WaitingListEntryStatus.PENDING` |
| **Notificação** | Promoção da primeira entrada pendente da fila a notificada, oferecendo a ela o lugar liberado. Sem entrada pendente, nada acontece. | `WaitingList.notifyFirstPending`, `WaitingListEntry.notify`, `WaitingListEntryStatus.NOTIFIED` |
| **Oferta de lugar** | Fato de um lugar liberado ter sido oferecido a um cliente da fila. Apenas avisa: não reserva o lugar, não dá prioridade e não expira. | `SpotOfferedToWaitingCustomer` |
| **Política de notificação da fila** | Regra "quando um lugar for liberado, notificar o primeiro da fila da seção". | `NotifyWaitingListOnSpotReleasedHandler` |
| **Política de liberação de lugar** | Regra "quando um pedido for cancelado, liberar o lugar e remover a trava de reserva". | `ReleaseSpotOnOrderCancelledHandler` |
| **Aviso ao cliente** | Reação do contexto de e-mails à oferta de lugar, publicada como evento de integração. Por enquanto, o aviso é só um log estruturado. | `SpotOfferedToWaitingCustomerIntegrationEvent`, `ConsumerService.handleSpotOfferedToWaitingCustomer` |
