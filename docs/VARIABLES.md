# Variáveis Dinâmicas dos Templates – V3

Referência completa de todas as variáveis Mustachio (`{{ variavel }}`) usadas nos templates transacionais.

## Variáveis Globais (Layout)

Disponíveis em **todos** os templates via layout base.

| Variável | Tipo | Obrigatória | Descrição |
|----------|------|:-----------:|-----------|
| `tenant.name` | string | ✅ | Nome da empresa (tenant) |
| `tenant.logo_url` | string | ❌ | URL da logo. Se ausente, mostra o nome como texto |
| `tenant.support_email` | string | ❌ | Email de suporte (exibido no footer) |
| `tenant.website_url` | string | ❌ | URL do site do tenant |
| `tenant.primary_color` | string | ❌ | Cor primária da marca (hex). Default: `#FF6B35` |
| `tenant.phone` | string | ❌ | Telefone de contato |
| `platform_url` | string | ✅ | URL da plataforma (`https://4unik.yoobe.me`) |
| `current_year` | string | ✅ | Ano corrente (preenchido automaticamente) |
| `custom_message` | string | ❌ | Texto livre customizado pelo tenant |

## v3-welcome (Boas-vindas)

| Variável | Tipo | Obrigatória | Descrição |
|----------|------|:-----------:|-----------|
| `user.name` | string | ✅ | Nome do usuário |
| `user.email` | string | ✅ | Email do usuário |
| `login_url` | string | ✅ | URL para login |

## v3-password-reset (Reset de Senha)

| Variável | Tipo | Obrigatória | Descrição |
|----------|------|:-----------:|-----------|
| `user.name` | string | ✅ | Nome do usuário |
| `user.email` | string | ✅ | Email do usuário |
| `reset_url` | string | ✅ | URL do link de reset com token |
| `expiration_hours` | string | ✅ | Horas até expirar (ex: "24") |

## v3-order-confirmation (Confirmação de Pedido)

| Variável | Tipo | Obrigatória | Descrição |
|----------|------|:-----------:|-----------|
| `user.name` | string | ✅ | Nome do cliente |
| `user.email` | string | ✅ | Email do cliente |
| `order.number` | string | ✅ | Número do pedido |
| `order.date` | string | ✅ | Data do pedido (formato: "dd/mm/aaaa") |
| `order.total` | string | ✅ | Valor total formatado (ex: "R$ 1.250,00") |
| `order.subtotal` | string | ✅ | Subtotal formatado |
| `order.shipping` | string | ❌ | Valor do frete formatado |
| `order.discount` | string | ❌ | Valor do desconto formatado |
| `order.payment_method` | string | ✅ | Método de pagamento |
| `order.shipping_address` | string | ✅ | Endereço de entrega completo |
| `order.tracking_url` | string | ❌ | URL de rastreamento |
| `products` | array | ✅ | Lista de produtos (ver abaixo) |
| `action_url` | string | ❌ | URL para detalhes do pedido |

### Objeto `products[]`

| Variável | Tipo | Obrigatória | Descrição |
|----------|------|:-----------:|-----------|
| `name` | string | ✅ | Nome do produto |
| `quantity` | number | ✅ | Quantidade |
| `unit_price` | string | ✅ | Preço unitário formatado |
| `total_price` | string | ✅ | Preço total formatado |
| `image_url` | string | ❌ | URL da imagem do produto |
| `sku` | string | ❌ | Código SKU |

## v3-order-status-update (Atualização de Status)

| Variável | Tipo | Obrigatória | Descrição |
|----------|------|:-----------:|-----------|
| `user.name` | string | ✅ | Nome do cliente |
| `order.number` | string | ✅ | Número do pedido |
| `order.date` | string | ✅ | Data do pedido |
| `new_status` | string | ✅ | Novo status (ex: "Em Produção", "Enviado") |
| `status_message` | string | ✅ | Mensagem descritiva da mudança |
| `order.tracking_url` | string | ❌ | URL de rastreamento |
| `action_url` | string | ❌ | URL para detalhes do pedido |

## v3-invoice (Nota Fiscal)

| Variável | Tipo | Obrigatória | Descrição |
|----------|------|:-----------:|-----------|
| `user.name` | string | ✅ | Nome do cliente |
| `order.number` | string | ✅ | Número do pedido |
| `order.total` | string | ✅ | Valor total |
| `invoice.number` | string | ✅ | Número da nota fiscal |
| `invoice.date` | string | ✅ | Data de emissão |
| `invoice.due_date` | string | ✅ | Data de vencimento |
| `invoice.pdf_url` | string | ✅ | URL para download do PDF |
| `invoice.notes` | string | ❌ | Observações da fatura |
| `products` | array | ✅ | Lista de produtos (mesmo formato acima) |
