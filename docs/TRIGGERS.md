# Gatilhos (Triggers) – Templates V3

Mapeamento completo de eventos da aplicação para templates de e-mail transacional.

## Como Funciona

1. Um evento ocorre no Rails (ex: pedido criado)
2. O model ou controller chama `trigger_email(:event_name, ...)`
3. O concern `PostmarkTriggerable` busca o alias do template em `config/triggers.yml`
4. O `TransactionalMailer` envia o e-mail pelo Postmark usando o alias

## Eventos Disponíveis

### 🆕 `user_created` → Boas-vindas

| Campo | Valor |
|-------|-------|
| **Template** | `v3-welcome` |
| **Quando dispara** | Ao criar um novo usuário no tenant |
| **Dados obrigatórios** | `user.name`, `user.email`, `login_url` |
| **Dados opcionais** | `custom_message` |

```ruby
# Exemplo no Controller
after_action :send_welcome, only: :create

def send_welcome
  trigger_email(:user_created, to: @user.email, model: {
    tenant: tenant_data,
    user: { name: @user.name, email: @user.email },
    login_url: login_url
  })
end
```

---

### 🔐 `password_reset_requested` → Reset de Senha

| Campo | Valor |
|-------|-------|
| **Template** | `v3-password-reset` |
| **Quando dispara** | Ao solicitar redefinição de senha |
| **Dados obrigatórios** | `user.name`, `user.email`, `reset_url`, `expiration_hours` |

```ruby
# Exemplo
trigger_email(:password_reset_requested, to: user.email, model: {
  tenant: tenant_data,
  user: { name: user.name, email: user.email },
  reset_url: edit_password_url(token: token),
  expiration_hours: '24'
})
```

---

### ✅ `order_created` → Confirmação de Pedido

| Campo | Valor |
|-------|-------|
| **Template** | `v3-order-confirmation` |
| **Quando dispara** | Ao criar um pedido com sucesso |
| **Dados obrigatórios** | `user.*`, `order.*`, `products[]` |
| **Dados opcionais** | `order.shipping`, `order.discount`, `order.tracking_url`, `custom_message` |

```ruby
# Exemplo no Model
after_create :send_confirmation

def send_confirmation
  trigger_email(:order_created, to: user.email, model: order_template_data)
end
```

---

### 📋 `order_status_changed` → Atualização de Status

| Campo | Valor |
|-------|-------|
| **Template** | `v3-order-status-update` |
| **Quando dispara** | Ao alterar o status de um pedido |
| **Dados obrigatórios** | `user.*`, `order.number`, `order.date`, `new_status`, `status_message` |
| **Dados opcionais** | `order.tracking_url`, `action_url`, `custom_message` |

```ruby
# Exemplo no Model
after_update :notify_status_change, if: :saved_change_to_status?

def notify_status_change
  trigger_email(:order_status_changed, to: user.email, model: {
    tenant: tenant_data,
    user: { name: user.name },
    order: { number: number, date: created_at.strftime('%d/%m/%Y') },
    new_status: status,
    status_message: "Seu pedido está #{status.downcase}."
  })
end
```

---

### 📄 `invoice_generated` → Nota Fiscal

| Campo | Valor |
|-------|-------|
| **Template** | `v3-invoice` |
| **Quando dispara** | Ao emitir uma nota fiscal |
| **Dados obrigatórios** | `user.*`, `order.*`, `invoice.*`, `products[]` |
| **Dados opcionais** | `invoice.notes`, `custom_message` |

```ruby
# Exemplo
trigger_email(:invoice_generated, to: order.user.email, model: {
  tenant: tenant_data,
  user: { name: order.user.name },
  order: { number: order.number, total: format_currency(order.total) },
  invoice: { number: number, date: issued_at, due_date: due_date, pdf_url: pdf_url },
  products: order.items.map { |i| product_data(i) }
})
```

## Adicionando Novos Triggers

1. Adicione o evento em `config/triggers.yml`
2. Crie o template HTML/TXT em `templates/`
3. Registre em `config/postmark.yml`
4. Execute `rake templates:sync` para enviar ao Postmark
5. Use `trigger_email(:novo_evento, ...)` no Rails
