# frozen_string_literal: true

# =============================================================================
# TransactionalMailer – Sends emails using Postmark Templates
# =============================================================================
# Add this file to your Rails app at: app/mailers/transactional_mailer.rb
#
# Usage:
#   TransactionalMailer.welcome(user, tenant).deliver_later
#   TransactionalMailer.order_confirmation(order, tenant).deliver_later
#   TransactionalMailer.send_by_trigger(:order_created, to: user.email, model: data).deliver_later
# =============================================================================

class TransactionalMailer < ApplicationMailer
  # Include Postmark's templated mailer support
  # Requires: gem 'postmark-rails'
  include PostmarkRails::TemplatedMailerMixin

  default from: ENV.fetch('POSTMARK_SENDER', 'noreply@4unik.com.br')
  layout false # Templates are managed in Postmark

  # ─── Generic Trigger-Based Sending ────────────────────────────────────

  # Send email by trigger name (uses config/triggers.yml)
  #
  # @param trigger_name [Symbol, String] Event name from triggers.yml
  # @param to [String] Recipient email
  # @param model [Hash] Template model data
  # @param from [String] Override sender (optional)
  #
  # Example:
  #   TransactionalMailer.send_by_trigger(
  #     :order_created,
  #     to: 'user@example.com',
  #     model: { user: { name: 'João' }, order: { number: 'PED-001' }, ... }
  #   ).deliver_later
  #
  def send_by_trigger(trigger_name, to:, model:, from: nil)
    trigger = POSTMARK_TRIGGERS[trigger_name.to_s]
    raise "Unknown trigger: #{trigger_name}" unless trigger

    self.template_alias = trigger['template_alias']
    self.template_model = build_model(model)

    mail(
      to: to,
      from: from || default_params[:from],
      message_stream: 'outbound'
    )
  end

  # ─── Named Methods (Convenience) ──────────────────────────────────────

  # Welcome email for new users
  def welcome(user:, tenant:, login_url:)
    self.template_alias = 'v3-welcome'
    self.template_model = build_model(
      tenant: tenant_data(tenant),
      user: user_data(user),
      login_url: login_url
    )

    mail(to: user.email, message_stream: 'outbound')
  end

  # Password reset email
  def password_reset(user:, tenant:, reset_url:, expiration_hours: 24)
    self.template_alias = 'v3-password-reset'
    self.template_model = build_model(
      tenant: tenant_data(tenant),
      user: user_data(user),
      reset_url: reset_url,
      expiration_hours: expiration_hours.to_s
    )

    mail(to: user.email, message_stream: 'outbound')
  end

  # Order confirmation email
  def order_confirmation(order:, tenant:)
    self.template_alias = 'v3-order-confirmation'
    self.template_model = build_model(
      tenant: tenant_data(tenant),
      user: user_data(order.user),
      order: order_data(order),
      products: products_data(order.items),
      action_url: order_url(order)
    )

    mail(to: order.user.email, message_stream: 'outbound')
  end

  # Order status update email
  def order_status_update(order:, tenant:, new_status:, status_message:)
    self.template_alias = 'v3-order-status-update'
    self.template_model = build_model(
      tenant: tenant_data(tenant),
      user: user_data(order.user),
      order: order_data(order),
      new_status: new_status,
      status_message: status_message,
      action_url: order_url(order)
    )

    mail(to: order.user.email, message_stream: 'outbound')
  end

  # Invoice email
  def invoice(invoice_record:, tenant:)
    self.template_alias = 'v3-invoice'
    self.template_model = build_model(
      tenant: tenant_data(tenant),
      user: user_data(invoice_record.order.user),
      order: order_data(invoice_record.order),
      products: products_data(invoice_record.order.items),
      invoice: invoice_data(invoice_record)
    )

    mail(to: invoice_record.order.user.email, message_stream: 'outbound')
  end

  private

  # ─── Data Formatters ──────────────────────────────────────────────────
  # Adapt these methods to your model structure.
  # These are examples – modify to match your ActiveRecord models.

  def tenant_data(tenant)
    {
      name: tenant.name,
      logo_url: tenant.logo_url,
      support_email: tenant.support_email,
      website_url: tenant.website_url,
      primary_color: tenant.primary_color || '#FF6B35',
      phone: tenant.phone
    }.compact
  end

  def user_data(user)
    {
      name: user.name,
      email: user.email
    }
  end

  def order_data(order)
    {
      number: order.number,
      date: I18n.l(order.created_at, format: :short),
      status: order.status,
      total: format_currency(order.total),
      subtotal: format_currency(order.subtotal),
      shipping: order.shipping ? format_currency(order.shipping) : nil,
      discount: order.discount&.positive? ? format_currency(order.discount) : nil,
      payment_method: order.payment_method,
      shipping_address: order.shipping_address,
      tracking_url: order.tracking_url
    }.compact
  end

  def products_data(items)
    items.map do |item|
      {
        name: item.product_name,
        quantity: item.quantity,
        unit_price: format_currency(item.unit_price),
        total_price: format_currency(item.total_price),
        image_url: item.image_url,
        sku: item.sku
      }.compact
    end
  end

  def invoice_data(invoice)
    {
      number: invoice.number,
      date: I18n.l(invoice.issued_at, format: :short),
      due_date: I18n.l(invoice.due_date, format: :short),
      pdf_url: invoice.pdf_url,
      notes: invoice.notes
    }.compact
  end

  def build_model(data)
    data.merge(
      platform_url: ENV.fetch('PLATFORM_URL', 'https://4unik.yoobe.me'),
      current_year: Time.current.year.to_s
    )
  end

  def format_currency(amount)
    return nil unless amount
    "R$ #{format('%.2f', amount).gsub('.', ',')}"
  end

  def order_url(order)
    "#{ENV.fetch('PLATFORM_URL', 'https://4unik.yoobe.me')}/orders/#{order.number}"
  end
end
