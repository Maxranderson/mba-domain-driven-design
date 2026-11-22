# MBA Full Cycle - Domain Driven Design

Este repositório contém o código-fonte e material didático do curso de Domain Driven Design do MBA Full Cycle.

O projeto é feito com Nestjs, mas o conteúdo é independente de linguagem ou framework.

## Pré-requisitos

- Node.js 18+
- Docker

## Executar o projeto

Suba as aplicações MySQL, RabbitMQ e Redis:

```bash
docker-compose up -d
```

Instale as dependências do Node.js:

```bash
npm install
```

Use o arquivo `api.http` como referência para fazer as requisições HTTP. Este arquivo funciona com a extensão [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) do VSCode.

## Feature: cancelamento de pedido e lista de espera

Quando um cliente cancela um pedido, o lugar volta à venda e o primeiro cliente da lista de espera da seção é avisado. O comando só cancela o pedido. A liberação do lugar e a notificação da fila são reações a eventos de domínio:

```
POST /events/:event_id/orders/:order_id/cancel       (comando: cancelar pedido)
POST /events/:event_id/sections/:section_id/waiting-list   (comando: entrar na fila) body: { customer_id }
GET  /events/:event_id/sections/:section_id/waiting-list   (consulta da fila)
```

- Event storming: [docs/event-storming.png](docs/event-storming.png) (editável em [docs/event-storming.excalidraw](docs/event-storming.excalidraw))
- Linguagem ubíqua: [docs/linguagem-ubiqua.md](docs/linguagem-ubiqua.md)
- O teste do fluxo completo, executado em processo, está em `apps/mba-ddd-venda-ingresso/src/@core/events/application/order-cancellation.flow.spec.ts`.

Para criar as tabelas novas (`waiting_list`, `waiting_list_entry`) no banco da aplicação, rode `npx mikro-orm schema:fresh --run`. Esse comando recria o banco inteiro.

### Por que a lista de espera é um agregado separado do Event

O `Event` já é um agregado grande: ele carrega todas as seções e todos os lugares de forma eager. A regra do curso é manter os agregados pequenos e só colocar dentro da fronteira aquilo que precisa ser consistente na mesma transação. A lista de espera não tem nenhuma invariante que dependa dos lugares no mesmo instante. "O cliente não entra duas vezes" e "a notificação vai para o primeiro pendente" só dependem das próprias entradas. Já "a seção está esgotada" é uma pré-condição verificada no application service, e "lugar liberado → notificar" é uma consistência eventual, que a política resolve reagindo ao `EventSpotReleased`. Se a lista ficasse dentro do `Event`, cada entrada na fila travaria e regravaria o evento inteiro, competindo com as compras pelo mesmo agregado. Além disso, o ciclo de vida da fila (crescer, notificar) é diferente do ciclo de vida do evento (publicar, configurar seções). Por isso a `WaitingList` é uma raiz própria, por seção (`event_id` + `section_id`), que referencia o evento e a seção apenas por ID. Não há motivo aqui para quebrar a regra: nenhuma invariante exige consistência transacional entre os dois agregados.

### Limitações encontradas no mecanismo de eventos (não alterado)

O mecanismo base (`DomainEventManager`, `ApplicationService`, `UnitOfWorkMikroOrm`, `IntegrationEventsPublisher`) foi usado como está. Na prática, ele tem estes comportamentos:

1. **Agregados alterados em handlers não são publicados automaticamente.** O `ApplicationService.finish()` captura a lista de agregados (`getAggregateRoots()`) antes de publicar os eventos. O que os handlers carregam e alteram depois não entra nessa lista. Por isso cada handler publica os eventos do agregado que alterou (`domainEventManager.publish`, e o segundo handler também `publishForIntegrationEvent`), seguindo o caminho indicado nos comentários do `MyHandlerHandler`.
2. **As reações rodam antes do commit e na mesma unidade de trabalho.** Os handlers são executados dentro do `publish()`, antes do `uow.commit()`. Por isso o cancelamento, a liberação do lugar, a remoção da trava e a notificação são gravados num único flush. Se uma reação falhar (por exemplo, `Spot is not reserved`), o cancelamento também não é persistido.
3. **O evento de integração da política é enfileirado antes do commit.** Como o segundo handler publica o evento de integração de dentro do `publish()`, a mensagem vai para a fila Bull antes do flush. Se o commit falhar depois disso, o e-mail é avisado de algo que não foi gravado. A solução seria um outbox, que está fora do escopo.
4. **O fluxo de compra existente não publica eventos.** O `OrderService.create` usa o Unit of Work diretamente. O pedido cancelado que a compensação de pagamento cria agora também carrega o `event_spot_id`, mas esse `OrderCancelled` não é publicado e não dispara a liberação. O comportamento continua igual ao de antes.

## Professor

<a href="https://github.com/argentinaluiz">
    <img src="https://avatars.githubusercontent.com/u/4926329?v=4?s=100" width="100px;" alt=""/>
    <br />
    <sub>
        <b>Luiz Carlos</b>
    </sub>
</a>
