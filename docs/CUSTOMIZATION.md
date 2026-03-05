# Customização de Emails pelo Tenant – V3

Como os clientes (tenants) personalizam os emails transacionais através da plataforma.

## Campos Personalizáveis

### 🎨 Identidade Visual

| Campo | Variável | Onde Aparece | Como Customizar |
|-------|----------|-------------|-----------------|
| Logo | `tenant.logo_url` | Header de todos os emails | Upload de imagem no painel do tenant |
| Cor primária | `tenant.primary_color` | Botões, bordas, destaques | Seletor de cor no painel |
| Nome da empresa | `tenant.name` | Header, footer, assuntos | Campo de texto no cadastro |

### 📝 Conteúdo Customizável

| Campo | Variável | Descrição |
|-------|----------|-----------|
| Mensagem personalizada | `custom_message` | Texto livre adicionado ao corpo do email |
| Email de suporte | `tenant.support_email` | Exibido no footer |
| Telefone | `tenant.phone` | Exibido no footer |
| URL do site | `tenant.website_url` | Link no footer |

## Fluxo de Customização

```
┌─────────────────────┐
│  Tenant faz login   │
│  na plataforma      │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Acessa "Config"    │
│  → "Emails"         │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Edita campos:      │
│  • Logo (upload)    │
│  • Cor primária     │
│  • Mensagem custom  │
│  • Dados de contato │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Salva no banco     │
│  (tabela tenants)   │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  No envio do email, │
│  dados do tenant    │
│  são injetados no   │
│  TemplateModel      │
└─────────────────────┘
```

## Implementação no Rails

### Model Tenant

```ruby
class Tenant < ApplicationRecord
  # Campos necessários na tabela:
  # - name:           string
  # - logo_url:       string  (URL pública da logo)
  # - primary_color:  string  (hex, ex: "#FF6B35")
  # - support_email:  string
  # - phone:          string
  # - website_url:    string
  # - custom_email_message: text  (mensagem personalizada)
  
  def email_template_data
    {
      name: name,
      logo_url: logo_url,
      primary_color: primary_color || '#FF6B35',
      support_email: support_email,
      phone: phone,
      website_url: website_url
    }.compact
  end
end
```

### Injetando no TemplateModel

```ruby
# Em qualquer ponto de envio:
model = {
  tenant: current_tenant.email_template_data,
  custom_message: current_tenant.custom_email_message,
  # ... outros dados
}
```

## Variável `custom_message`

A variável `custom_message` permite ao tenant adicionar texto livre que aparece como um bloco destacado em todos os emails:

- Se `custom_message` estiver **vazio ou nil** → o bloco **não aparece**
- Se `custom_message` tiver **conteúdo** → aparece como uma caixa com ícone 📝

Isso é implementado via Mustachio:
```
{{#custom_message}}
  <div class="info-box">
    <p>📝 Mensagem do fornecedor:</p>
    <p>{{ custom_message }}</p>
  </div>
{{/custom_message}}
```

## Próximos Passos (Futuro)

Funcionalidades planejadas para evolução:

1. **Editor visual de templates** - WYSIWYG no painel do tenant
2. **Personalização por template** - mensagens diferentes por tipo de email
3. **A/B testing** - testar variações de assunto/corpo
4. **Templates multi-idioma** - suporte pt-BR, en-US, es
5. **Preview em tempo real** - visualizar alterações antes de salvar
