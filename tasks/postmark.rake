# frozen_string_literal: true

require_relative '../lib/postmark_client'

namespace :postmark do
  desc 'Send a test email using a template (e.g., rake postmark:test[v3-welcome,user@email.com])'
  task :test, [:alias_name, :to_email] do |_t, args|
    raise 'Usage: rake postmark:test[alias_name,to_email]' unless args[:alias_name] && args[:to_email]

    require 'json'
    project_root = File.expand_path('../..', __FILE__)
    sample_data = JSON.parse(File.read(File.join(project_root, 'data', 'sample_models.json')))

    client = PostmarkClient.new

    puts "\n📧 Sending test email..."
    puts "  Template: #{args[:alias_name]}"
    puts "  To: #{args[:to_email]}"
    puts

    result = client.send_with_template(
      template_alias: args[:alias_name],
      to: args[:to_email],
      model: sample_data,
      tag: 'test'
    )

    puts "  ✅ Email sent successfully!"
    puts "  Message ID: #{result['MessageID']}"
    puts "  Submitted at: #{result['SubmittedAt']}"
    puts
  end

  desc 'Check Postmark server connectivity'
  task :ping do
    client = PostmarkClient.new
    result = client.list_templates(count: 1)
    puts "\n✅ Postmark connection successful!"
    puts "  Total templates: #{result['TotalCount']}\n\n"
  rescue PostmarkClient::ApiError => e
    puts "\n❌ Postmark connection failed: #{e.message}\n\n"
    exit 1
  end

  desc 'Delete a template from Postmark (e.g., rake postmark:delete[v3-welcome])'
  task :delete, [:alias_name] do |_t, args|
    raise 'Usage: rake postmark:delete[alias_name]' unless args[:alias_name]

    client = PostmarkClient.new

    puts "\n🗑️  Deleting template: #{args[:alias_name]}"
    
    begin
      client.delete_template(args[:alias_name])
      puts "  ✅ Template deleted successfully!\n\n"
    rescue PostmarkClient::ApiError => e
      puts "  ❌ Error: #{e.message}\n\n"
      exit 1
    end
  end
end
