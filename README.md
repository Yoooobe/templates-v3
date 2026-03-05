# 📧 Templates V3 – 4Unik Transactional Emails

Templates de e-mail transacional para a plataforma **4Unik** (v3), integrados com [Postmark](https://postmarkapp.com).

## Visão Geral

Este repositório contém:

- **Templates HTML** responsivos para e-mails transacionais (Mustachio syntax)
- **API Client** Ruby para gerenciar templates no Postmark
- **Rake Tasks** para deploy, preview e validação de templates
- **Integração Rails** pronta para uso no app principal
- **Documentação** completa de variáveis, gatilhos e customizações

## Quick Start

### 1. Setup

```bash
git clone https://github.com/Yoooobe/templates-v3.git
cd templates-v3
bundle install
cp .env.example .env
# Edite .env com seu POSTMARK_API_TOKEN
```

### 2. Verificar Conexão

```bash
rake postmark:ping
```

### 3. Deploy Templates

```bash
# Preview (dry run)
rake templates:sync DRY_RUN=1

# Deploy real
rake templates:sync
```

### 4. Enviar Email de Teste

```bash
rake postmark:test[v3-welcome,seu-email@exemplo.com]
```

## Templates

| Alias | Nome | Gatilho |
|-------|------|---------|
| `v3-welcome` | Boas-vindas | Criação de conta |
| `v3-password-reset` | Reset de Senha | Solicitação de reset |
| `v3-order-confirmation` | Confirmação de Pedido | Pedido criado |
| `v3-order-status-update` | Status do Pedido | Mudança de status |
| `v3-invoice` | Nota Fiscal | Fatura gerada |

## Rake Tasks

| Comando | Descrição |
|---------|-----------|
| `rake templates:sync` | Deploy de todos os templates para o Postmark |
| `rake templates:sync DRY_RUN=1` | Preview sem alterar nada |
| `rake templates:sync_one[alias]` | Deploy de um template específico |
| `rake templates:status` | Status local vs remoto |
| `rake templates:preview[alias]` | Preview no browser |
| `rake templates:validate` | Validar sintaxe via API |
| `rake templates:list_remote` | Listar templates no Postmark |
| `rake postmark:test[alias,email]` | Enviar email de teste |
| `rake postmark:ping` | Testar conexão |
| `rake postmark:delete[alias]` | Deletar template |

## Integração Rails

Veja [rails_integration/README.md](rails_integration/README.md) para instruções completas.

Resumo rápido:

```ruby
# Gemfile
gem 'postmark-rails', '~> 0.22'

# No model:
class Order < ApplicationRecord
  include PostmarkTriggerable

  after_create -> {
    trigger_email(:order_created, to: user.email, model: { ... })
  }
end
```

## Estrutura

```
templates-v3/
├── config/
│   ├── postmark.yml          # Definições dos templates
│   └── triggers.yml          # Mapeamento eventos → templates
├── lib/
│   ├── postmark_client.rb    # API client
│   ├── template_manager.rb   # Sync manager
│   └── template_renderer.rb  # Preview renderer
├── templates/
│   ├── layouts/
│   │   └── base_layout.html  # Layout compartilhado
│   ├── welcome.html
│   ├── password_reset.html
│   ├── order_confirmation.html
│   ├── order_status_update.html
│   └── invoice.html
├── rails_integration/        # Arquivos para copiar no Rails app
├── data/
│   └── sample_models.json    # Dados de exemplo
├── tasks/                    # Rake tasks
└── docs/                     # Documentação detalhada
```

## Documentação

- [VARIABLES.md](docs/VARIABLES.md) – Todas as variáveis dos templates
- [TRIGGERS.md](docs/TRIGGERS.md) – Gatilhos e quando disparam
- [CUSTOMIZATION.md](docs/CUSTOMIZATION.md) – Como o tenant customiza os emails

## Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|:-----------:|
| `POSTMARK_API_TOKEN` | Token da API do Postmark Server | ✅ |
| `POSTMARK_SENDER` | Email do remetente verificado | ✅ |
| `PLATFORM_URL` | URL da plataforma | ❌ |

## Customização pelo Tenant

Cada email suporta personalização por tenant:

- **Logo** – Upload via painel (`tenant.logo_url`)
- **Cor da marca** – Hex color (`tenant.primary_color`)
- **Mensagem personalizada** – Texto livre (`custom_message`)
- **Dados de contato** – Email, telefone, site

## License

Private – © 2026 4Unik / Yoobe
