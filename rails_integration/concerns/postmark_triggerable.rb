# frozen_string_literal: true

# =============================================================================
# PostmarkTriggerable – Concern for Triggering Emails on Model Events
# =============================================================================
# Include this concern in any ActiveRecord model that should trigger
# transactional emails based on lifecycle events.
#
# Add this file to your Rails app at: app/models/concerns/postmark_triggerable.rb
#
# Usage:
#   class Order < ApplicationRecord
#     include PostmarkTriggerable
#
#     after_create :send_order_confirmation
#     after_update :send_status_update, if: :saved_change_to_status?
#
#     private
#
#     def send_order_confirmation
#       trigger_email(:order_created, to: user.email, model: template_model)
#     end
#
#     def send_status_update
#       trigger_email(:order_status_changed, to: user.email, model: status_model)
#     end
#   end
# =============================================================================

module PostmarkTriggerable
  extend ActiveSupport::Concern

  included do
    # Ensure POSTMARK_TRIGGERS is available
    unless defined?(POSTMARK_TRIGGERS)
      raise 'POSTMARK_TRIGGERS not defined. Ensure config/initializers/postmark.rb is loaded.'
    end
  end

  # ─── Instance Methods ─────────────────────────────────────────────────

  # Trigger a transactional email based on an event name.
  # Looks up the template alias from config/triggers.yml and uses
  # TransactionalMailer to send the email asynchronously.
  #
  # @param event_name [Symbol, String] Event name from triggers.yml
  #   (e.g., :user_created, :order_created, :order_status_changed)
  # @param to [String] Recipient email address
  # @param model [Hash] Template model data (Mustachio variables)
  # @param from [String, nil] Override sender address (optional)
  #
  # @example From an Order model:
  #   trigger_email(:order_created, to: user.email, model: {
  #     tenant: { name: tenant.name, logo_url: tenant.logo_url, ... },
  #     user: { name: user.name, email: user.email },
  #     order: { number: number, date: created_at.strftime('%d/%m/%Y'), ... },
  #     products: items.map { |i| { name: i.name, quantity: i.qty, ... } }
  #   })
  #
  def trigger_email(event_name, to:, model:, from: nil)
    trigger = POSTMARK_TRIGGERS[event_name.to_s]

    unless trigger
      Rails.logger.error "[PostmarkTriggerable] Unknown trigger: #{event_name}"
      return
    end

    # Validate required fields
    missing = validate_required_fields(trigger, model)
    if missing.any?
      Rails.logger.warn "[PostmarkTriggerable] Missing required fields for #{event_name}: #{missing.join(', ')}"
    end

    # Enqueue email delivery
    TransactionalMailer.send_by_trigger(
      event_name,
      to: to,
      model: enrich_model(model),
      from: from
    ).deliver_later

    Rails.logger.info "[PostmarkTriggerable] Triggered #{event_name} → #{trigger['template_alias']} to #{to}"
  rescue StandardError => e
    Rails.logger.error "[PostmarkTriggerable] Failed to trigger #{event_name}: #{e.message}"
    # Don't raise – email failures shouldn't break the main flow
  end

  private

  # Enrich model with global variables
  def enrich_model(model)
    model.merge(
      platform_url: ENV.fetch('PLATFORM_URL', 'https://4unik.yoobe.me'),
      current_year: Time.current.year.to_s
    )
  end

  # Validate that required fields from triggers.yml are present in the model
  def validate_required_fields(trigger, model)
    required = trigger['required_data'] || []
    missing = []

    required.each do |field|
      parts = field.split('.')
      value = model

      parts.each do |part|
        if value.is_a?(Hash)
          value = value[part] || value[part.to_sym]
        else
          value = nil
        end
        break if value.nil?
      end

      missing << field if value.nil?
    end

    missing
  end
end
