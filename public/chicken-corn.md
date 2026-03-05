# 🐔🌽 Chicken Corn – Templates V3 Integration Guide

> **Este documento contém toda a documentação para integrar os templates transacionais V3 no seu projeto Rails.**
> Cole este conteúdo no Copilot/Claude para dar contexto ao AI sobre o sistema de templates.

---

## 📋 Visão Geral

O sistema de templates V3 usa **Postmark** para envio de e-mails transacionais. Os templates são organizados por audiência:

| Audiência | Templates | Prefixo |
|-----------|-----------|---------|
| Gerais | 5 templates | `v3-` |
| Membro | 5 templates | `v3-member-` |
| Gestor | 8 templates | `v3-manager-` |

**Tecnologias:** Postmark API, Mustachio (Mustache-like), Layout Templates, Ruby on Rails

---

## 🔧 Configuração Inicial

### 1. Instalar Gem

```ruby
# Gemfile
gem 'postmark-rails', '~> 0.22'
```

### 2. Variáveis de Ambiente

```bash
# .env
POSTMARK_API_TOKEN=seu-token-do-server-v3
POSTMARK_SENDER=noreply@yoobe.me
POSTMARK_MESSAGE_STREAM=outbound
PLATFORM_URL=https://4unik.yoobe.me
```

### 3. Initializer Rails

```ruby
# config/initializers/postmark.rb
ActionMailer::Base.delivery_method = :postmark
ActionMailer::Base.postmark_settings = {
  api_token: ENV['POSTMARK_API_TOKEN']
}

# Carregar triggers
POSTMARK_TRIGGERS = YAML.load_file(
  Rails.root.join('config', 'triggers.yml')
)['triggers']
```

---

## 🎯 Configuração de Gatilhos (Triggers)

Cada evento da aplicação dispara um template específico. A configuração fica em `config/triggers.yml`:

### Mapeamento Evento → Template

```yaml
# config/triggers.yml
triggers:
  # Quando um membro recebe pontos
  member_points_added:
    template_alias: "v3-member-points-added"
    audience: "member"
    required_data: [user.name, user.email, points_added, points_balance]
    optional_data: [points_expiring, reason, campaign_name, store_url]
```

### Como Disparar um E-mail (Controller/Service)

```ruby
# Em qualquer controller ou service
class PointsService
  def add_points(user, amount, reason)
    # ... lógica de negócio ...

    # Disparar e-mail
    TransactionalMailer.send_trigger(
      'member_points_added',
      user.email,
      {
        'user' => { 'name' => user.name, 'email' => user.email },
        'points_added' => amount.to_s,
        'points_balance' => user.points_balance.to_s,
        'reason' => reason,
        'store_url' => "#{ENV['PLATFORM_URL']}/loja",
        'tenant' => current_tenant_data
      }
    )
  end
end
```

### TransactionalMailer Completo

```ruby
# app/mailers/transactional_mailer.rb
class TransactionalMailer < ApplicationMailer
  default from: ENV['POSTMARK_SENDER']

  # ── Método genérico para qualquer trigger ──
  def send_trigger(trigger_name, to_email, template_data)
    trigger = POSTMARK_TRIGGERS[trigger_name]
    raise "Trigger '#{trigger_name}' não encontrado" unless trigger

    # Adicionar dados do tenant automaticamente
    template_data['tenant'] ||= current_tenant_data
    template_data['current_year'] ||= Time.current.year.to_s
    template_data['platform_url'] ||= ENV['PLATFORM_URL']

    mail(
      to: to_email,
      postmark_template_alias: trigger['template_alias'],
      postmark_template_model: template_data
    )
  end

  # ── Métodos nomeados para cada trigger ──

  def member_onboarding_invite(user, tenant)
    send_trigger('member_onboarding_invite', user.email, {
      'user' => { 'name' => user.name, 'email' => user.email },
      'store_url' => "#{ENV['PLATFORM_URL']}/#{tenant.slug}/loja",
      'welcome_message' => tenant.welcome_message,
      'points_balance' => user.points_balance.to_s
    })
  end

  def member_points_added(user, points, reason)
    send_trigger('member_points_added', user.email, {
      'user' => { 'name' => user.name, 'email' => user.email },
      'points_added' => points.to_s,
      'points_balance' => user.points_balance.to_s,
      'reason' => reason,
      'store_url' => "#{ENV['PLATFORM_URL']}/loja"
    })
  end

  def member_points_spent(user, transaction, product)
    send_trigger('member_points_spent', user.email, {
      'user' => { 'name' => user.name, 'email' => user.email },
      'points_spent' => transaction.points.to_s,
      'points_balance' => user.points_balance.to_s,
      'product' => {
        'name' => product.name,
        'points_cost' => product.points_cost.to_s,
        'image_url' => product.image_url,
        'variant' => transaction.variant
      },
      'transaction' => {
        'id' => transaction.code,
        'date' => transaction.created_at.strftime('%d/%m/%Y às %H:%M')
      }
    })
  end

  def manager_low_stock(manager, products)
    send_trigger('manager_low_stock', manager.email, {
      'manager' => { 'name' => manager.name, 'email' => manager.email },
      'total_low_stock' => products.count.to_s,
      'products' => products.map { |p| {
        'name' => p.name,
        'sku' => p.sku,
        'current_stock' => p.stock.to_s,
        'min_stock' => p.min_stock.to_s,
        'is_critical' => p.stock <= (p.min_stock / 2)
      }},
      'inventory_url' => "#{ENV['PLATFORM_URL']}/admin/inventory"
    })
  end

  private

  def current_tenant_data
    tenant = Current.tenant # ou como você acessa o tenant atual
    {
      'name' => tenant.name,
      'logo_url' => tenant.logo_url,
      'primary_color' => tenant.primary_color || '#4F46E5',
      'support_email' => tenant.support_email,
      'website_url' => tenant.website_url
    }
  end
end
```

---

## 🖼️ Integração de Logo/Branding do Cliente

Cada template usa variáveis do `tenant` para personalizar o branding:

```mustache
<!-- No layout base (já configurado) -->
<img src="{{ tenant.logo_url }}" alt="{{ tenant.name }}" />
<span style="color: {{ tenant.primary_color }}">{{ tenant.name }}</span>
```

### Como configurar por tenant:

```ruby
# No model Tenant ou Company
class Tenant < ApplicationRecord
  # Campos necessários para branding nos e-mails:
  #   - name: String (nome da empresa)
  #   - logo_url: String (URL pública da logo, recomendado 180x40px)
  #   - primary_color: String (hex color, ex: "#4F46E5")
  #   - support_email: String
  #   - website_url: String

  def postmark_data
    {
      'name' => name,
      'logo_url' => logo_url || 'https://catalogo.yoobe.co/yoobe-logo-header.svg',
      'primary_color' => primary_color || '#4F46E5',
      'support_email' => support_email || 'suporte@yoobe.me',
      'website_url' => website_url || 'https://yoobe.me'
    }
  end
end
```

### Requisitos da Logo:
- **Formato:** PNG ou SVG (fundo transparente)
- **Tamanho recomendado:** 180px × 40px
- **Hospedagem:** URL pública (CDN, S3, ou Firebase Storage)

---

## 📦 Lista Completa de Templates & Variáveis

### Membro

| Template | Alias | Variáveis Obrigatórias |
|----------|-------|----------------------|
| Convite Onboarding | `v3-member-onboarding-invite` | `user.name`, `user.email`, `store_url` |
| Pontos Adicionados | `v3-member-points-added` | `user.name`, `user.email`, `points_added`, `points_balance` |
| Pontos Gastos | `v3-member-points-spent` | `user.name`, `user.email`, `points_spent`, `points_balance`, `product.name`, `product.points_cost`, `transaction.id`, `transaction.date` |
| Status da Entrega | `v3-member-order-status` | `user.name`, `user.email`, `order.number`, `order.status`, `product.name` |
| Convite Campanha | `v3-member-campaign-invite` | `user.name`, `user.email`, `campaign.name`, `store_url` |

### Gestor

| Template | Alias | Variáveis Obrigatórias |
|----------|-------|----------------------|
| Novo Usuário | `v3-manager-user-created` | `manager.name`, `manager.email`, `new_user.name`, `new_user.email`, `created_at` |
| Campanha Enviada | `v3-manager-campaign-sent` | `manager.name`, `manager.email`, `campaign.name`, `total_recipients`, `points_per_member`, `total_points`, `sent_at` |
| Campanha Iniciada | `v3-manager-campaign-started` | `manager.name`, `manager.email`, `campaign.name`, `campaign.start_date`, `campaign.end_date` |
| Campanha Encerrada | `v3-manager-campaign-ended` | `manager.name`, `manager.email`, `campaign.name`, `campaign.start_date`, `campaign.end_date`, `total_participants`, `total_redemptions`, `points_used`, `points_remaining`, `engagement_rate` |
| Presente Criado | `v3-manager-gift-created` | `manager.name`, `manager.email`, `gift.product_name`, `gift.recipient_name`, `gift.recipient_email`, `gift.date` |
| Status do Presente | `v3-manager-gift-status` | `manager.name`, `manager.email`, `gift.product_name`, `gift.recipient_name`, `gift.status`, `gift.order_number`, `gift.date` |
| Alteração CRUD | `v3-manager-crud-update` | `manager.name`, `manager.email`, `resource_type`, `resource_name`, `performed_by`, `performed_at` |
| Estoque Baixo | `v3-manager-low-stock` | `manager.name`, `manager.email`, `total_low_stock`, `products` |

---

## 🔗 Onde Colocar os Gatilhos no Rails

```ruby
# ── Em callbacks de Model ──
class User < ApplicationRecord
  after_create :notify_manager_new_user

  private

  def notify_manager_new_user
    tenant.managers.each do |manager|
      TransactionalMailer.send_trigger('manager_user_created', manager.email, {
        'manager' => { 'name' => manager.name },
        'new_user' => { 'name' => name, 'email' => email },
        'created_at' => created_at.strftime('%d/%m/%Y às %H:%M'),
        'total_members' => tenant.members.count.to_s,
        'admin_url' => "#{ENV['PLATFORM_URL']}/admin/members"
      }).deliver_later
    end
  end
end

# ── Em Services ──
class CampaignService
  def start_campaign(campaign)
    campaign.update!(status: 'active')

    # Notificar gestor
    TransactionalMailer.send_trigger('manager_campaign_started',
      campaign.manager.email, { ... }
    ).deliver_later

    # Convidar membros
    campaign.members.find_each do |member|
      TransactionalMailer.send_trigger('member_campaign_invite',
        member.email, { ... }
      ).deliver_later
    end
  end
end

# ── Em Controllers ──
class Admin::GiftsController < ApplicationController
  def create
    @gift = Gift.create!(gift_params)

    TransactionalMailer.send_trigger('manager_gift_created',
      current_user.email,
      { 'gift' => @gift.postmark_data, 'manager' => current_user.postmark_data }
    ).deliver_later

    redirect_to admin_gifts_path, notice: 'Presente criado!'
  end
end

# ── Scheduled Jobs (Estoque Baixo) ──
class LowStockCheckJob < ApplicationJob
  queue_as :default

  def perform
    Tenant.find_each do |tenant|
      low_stock = tenant.products.where('stock <= min_stock')
      next if low_stock.empty?

      tenant.managers.each do |manager|
        TransactionalMailer.send_trigger('manager_low_stock',
          manager.email,
          {
            'manager' => { 'name' => manager.name },
            'total_low_stock' => low_stock.count.to_s,
            'products' => low_stock.map(&:postmark_data),
            'inventory_url' => "#{ENV['PLATFORM_URL']}/admin/inventory"
          }
        ).deliver_later
      end
    end
  end
end
```

---

## 🤖 Prompt para Copilot / Claude

> Cole este prompt inteiro no Copilot para dar contexto sobre o sistema de templates:

```
Estou integrando templates de e-mail transacional da plataforma 4unik (Yoobe) V3 usando Postmark.

CONTEXTO DO SISTEMA:
- Plataforma multi-tenant de loyalty/rewards (pontos, campanhas, brindes)
- 2 tipos de usuários: "membro" (recebe pontos/brindes) e "gestor" (administra)
- E-mails são enviados via Postmark usando templates com alias (ex: "v3-member-points-added")
- O layout base usa variáveis de tenant para branding dinâmico: tenant.name, tenant.logo_url, tenant.primary_color
- Sintaxe de templates: Mustachio (Postmark) – {{ variavel }} para texto, {{#bloco}}...{{/bloco}} para condicionais, {{#each lista}}...{{/each}} para loops

TEMPLATES DISPONÍVEIS:
Membro: v3-member-onboarding-invite, v3-member-points-added, v3-member-points-spent, v3-member-order-status, v3-member-campaign-invite
Gestor: v3-manager-user-created, v3-manager-campaign-sent, v3-manager-campaign-started, v3-manager-campaign-ended, v3-manager-gift-created, v3-manager-gift-status, v3-manager-crud-update, v3-manager-low-stock

COMO ENVIAR E-MAIL:
TransactionalMailer.send_trigger('nome_do_trigger', email_destino, { hash_de_dados }).deliver_later

CONFIGURAÇÃO:
- Gem: postmark-rails
- ENV: POSTMARK_API_TOKEN, POSTMARK_SENDER, PLATFORM_URL
- Triggers mapeados em config/triggers.yml
- Cada trigger especifica template_alias e required_data/optional_data

IMPORTANTE:
- Sempre incluir dados do tenant (tenant.name, tenant.logo_url, tenant.primary_color) 
- Usar .deliver_later para envio assíncrono
- Formatar datas no padrão brasileiro (dd/mm/yyyy)
- Pontos são sempre strings formatadas (ex: "1.500")
```

---

## 📁 Estrutura de Arquivos

```
templates-v3/
├── config/
│   ├── postmark.yml        # Definição de todos os templates
│   └── triggers.yml        # Mapeamento evento → template
├── templates/
│   ├── layouts/
│   │   └── base_layout.html  # Layout base com branding dinâmico
│   ├── member/             # 5 templates de membro
│   └── manager/            # 8 templates de gestor
├── rails_integration/
│   ├── initializers/postmark.rb
│   ├── mailers/transactional_mailer.rb
│   └── concerns/postmark_triggerable.rb
├── docs/
│   ├── VARIABLES.md
│   ├── TRIGGERS.md
│   └── CUSTOMIZATION.md
└── data/
    └── sample_models.json  # Dados de exemplo para preview
```
