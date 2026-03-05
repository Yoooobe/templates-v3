# frozen_string_literal: true

# =============================================================================
# Postmark Configuration Initializer
# =============================================================================
# Add this file to your Rails app at: config/initializers/postmark.rb
#
# Prerequisites:
#   1. Add 'postmark-rails' gem to your Gemfile
#   2. Set POSTMARK_API_TOKEN environment variable
#   3. Verify sender address in Postmark
# =============================================================================

Rails.application.configure do
  # Use Postmark as the delivery method
  config.action_mailer.delivery_method = :postmark
  config.action_mailer.postmark_settings = {
    api_token: ENV.fetch('POSTMARK_API_TOKEN')
  }

  # Default sender
  config.action_mailer.default_options = {
    from: ENV.fetch('POSTMARK_SENDER', 'noreply@4unik.com.br')
  }
end

# =============================================================================
# Load trigger mappings from config
# =============================================================================
POSTMARK_TRIGGERS = begin
  triggers_path = Rails.root.join('config', 'triggers.yml')
  if File.exist?(triggers_path)
    config = YAML.load_file(triggers_path)
    (config['triggers'] || {}).with_indifferent_access.freeze
  else
    Rails.logger.warn '[Postmark] triggers.yml not found at config/triggers.yml'
    {}.freeze
  end
end
