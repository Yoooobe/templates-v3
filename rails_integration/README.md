# Rails Integration – Postmark Templates V3

## Instalação Rápida

### 1. Adicione a gem ao Gemfile do Rails

```ruby
# Gemfile
gem 'postmark-rails', '~> 0.22'
```

```bash
bundle install
```

### 2. Configure a variável de ambiente

```bash
# .env ou credentials
POSTMARK_API_TOKEN=seu-token-aqui
POSTMARK_SENDER=noreply@4unik.com.br
PLATFORM_URL=https://4unik.yoobe.me
```

### 3. Copie os arquivos de integração

```bash
# Initializer
cp rails_integration/initializers/postmark.rb config/initializers/postmark.rb

# Copie triggers.yml para config/
cp config/triggers.yml SEU_RAILS_APP/config/triggers.yml

# Mailer
cp rails_integration/mailers/transactional_mailer.rb app/mailers/transactional_mailer.rb

# Concern
cp rails_integration/concerns/postmark_triggerable.rb app/models/concerns/postmark_triggerable.rb
```

### 4. Use no seu Model

```ruby
class Order < ApplicationRecord
  include PostmarkTriggerable

  belongs_to :user
  belongs_to :tenant
  has_many :items

  after_create :send_confirmation_email
  after_update :send_status_update_email, if: :saved_change_to_status?

  private

  def send_confirmation_email
    trigger_email(:order_created, to: user.email, model: {
      tenant: {
        name: tenant.name,
        logo_url: tenant.logo_url,
        support_email: tenant.support_email,
        website_url: tenant.website_url,
        primary_color: tenant.primary_color
      },
      user: { name: user.name, email: user.email },
      order: {
        number: number,
        date: created_at.strftime('%d/%m/%Y'),
        total: "R$ #{format('%.2f', total).gsub('.', ',')}",
        subtotal: "R$ #{format('%.2f', subtotal).gsub('.', ',')}",
        payment_method: payment_method,
        shipping_address: shipping_address
      },
      products: items.map { |i|
        {
          name: i.product.name,
          quantity: i.quantity,
          unit_price: "R$ #{format('%.2f', i.unit_price).gsub('.', ',')}",
          total_price: "R$ #{format('%.2f', i.total_price).gsub('.', ',')}",
          sku: i.product.sku
        }
      }
    })
  end

  def send_status_update_email
    trigger_email(:order_status_changed, to: user.email, model: {
      tenant: {
        name: tenant.name,
        logo_url: tenant.logo_url,
        support_email: tenant.support_email,
        website_url: tenant.website_url
      },
      user: { name: user.name, email: user.email },
      order: { number: number, date: created_at.strftime('%d/%m/%Y') },
      new_status: status,
      status_message: status_description
    })
  end
end
```

### 5. Uso Direto com o Mailer

```ruby
# Envio direto (sem concern)
TransactionalMailer.welcome(
  user: current_user,
  tenant: current_tenant,
  login_url: root_url
).deliver_later

# Envio genérico por trigger
TransactionalMailer.send_by_trigger(
  :password_reset_requested,
  to: user.email,
  model: {
    tenant: tenant_hash,
    user: { name: user.name, email: user.email },
    reset_url: edit_password_url(token: token),
    expiration_hours: '24'
  }
).deliver_later
```

## Arquivos

| Arquivo | Destino no Rails | Descrição |
|---------|-----------------|-----------|
| `initializers/postmark.rb` | `config/initializers/` | Configuração do Postmark |
| `mailers/transactional_mailer.rb` | `app/mailers/` | Mailer com métodos nomeados |
| `concerns/postmark_triggerable.rb` | `app/models/concerns/` | Concern para disparos automáticos |
| `../config/triggers.yml` | `config/` | Mapeamento de eventos → templates |
