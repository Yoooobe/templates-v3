# frozen_string_literal: true

require 'yaml'
require_relative 'postmark_client'

# =============================================================================
# TemplateManager – Synchronizes local templates with Postmark
# =============================================================================
# Reads template definitions from config/postmark.yml, loads HTML/Text content
# from the templates/ directory, and creates or updates them on Postmark.
#
# Usage:
#   manager = TemplateManager.new
#   manager.sync_all                    # Deploy all templates
#   manager.sync_all(dry_run: true)     # Preview without deploying
#   manager.sync_one('v3-welcome')      # Deploy a single template
#   manager.status                      # Show sync status
# =============================================================================
class TemplateManager
  attr_reader :client, :config

  def initialize(api_token: nil)
    @client = PostmarkClient.new(api_token)
    @config = load_config
    @project_root = File.expand_path('..', __dir__)
  end

  # ─── Sync Operations ───────────────────────────────────────────────────

  # Sync all templates to Postmark
  # @param dry_run [Boolean] If true, only show what would happen
  def sync_all(dry_run: false)
    templates = @config['templates'] || {}
    
    # Sort: Layouts first, then Standard templates
    sorted = templates.sort_by { |_, cfg| cfg['type'] == 'Layout' ? 0 : 1 }
    
    puts "\n📧 Syncing #{sorted.length} templates to Postmark...\n"
    puts "⚠️  DRY RUN – no changes will be made\n" if dry_run
    puts '─' * 60

    results = { created: [], updated: [], skipped: [], errors: [] }

    sorted.each do |alias_name, template_config|
      result = sync_template(alias_name, template_config, dry_run: dry_run)
      results[result] << alias_name
    end

    print_summary(results)
    results
  end

  # Sync a single template by alias
  # @param alias_name [String] Template alias
  # @param dry_run [Boolean] If true, only show what would happen
  def sync_one(alias_name, dry_run: false)
    template_config = (@config['templates'] || {})[alias_name]
    raise "Template '#{alias_name}' not found in config/postmark.yml" unless template_config

    puts "\n📧 Syncing template: #{alias_name}\n"
    puts "⚠️  DRY RUN – no changes will be made\n" if dry_run
    puts '─' * 60

    sync_template(alias_name, template_config, dry_run: dry_run)
  end

  # Show status of all templates (local vs remote)
  def status
    templates = @config['templates'] || {}
    remote_templates = fetch_remote_templates

    puts "\n📊 Template Status\n"
    puts '─' * 70
    puts format('  %-25s %-12s %-12s %s', 'ALIAS', 'LOCAL', 'REMOTE', 'STATUS')
    puts '─' * 70

    templates.each do |alias_name, template_config|
      local_exists = file_exists?(template_config['html_file'])
      remote = remote_templates[alias_name]
      
      status = if !local_exists
                 '❌ Missing local file'
               elsif remote
                 '✅ Synced'
               else
                 '🔶 Not deployed'
               end

      puts format('  %-25s %-12s %-12s %s', 
                   alias_name, 
                   local_exists ? '✅' : '❌',
                   remote ? '✅' : '❌',
                   status)
    end
    puts '─' * 70
    puts
  end

  private

  def load_config
    config_path = File.join(@project_root || File.expand_path('..', __dir__), 'config', 'postmark.yml')
    raise "Config not found: #{config_path}" unless File.exist?(config_path)
    
    YAML.load_file(config_path)
  end

  def sync_template(alias_name, template_config, dry_run: false)
    html_body = load_file(template_config['html_file'])
    text_body = load_file(template_config['text_file']) rescue ''
    
    unless html_body
      puts "  ⏭️  #{alias_name} – HTML file not found (#{template_config['html_file']})"
      return :skipped
    end

    # Check if template already exists on Postmark
    existing = begin
      @client.get_template(alias_name)
    rescue PostmarkClient::ApiError => e
      nil if e.status_code == 422 || e.error_code == 1101
    end

    if existing
      action = '🔄 Updating'
      unless dry_run
        @client.update_template(
          alias_name,
          name: template_config['name'],
          subject: template_config['subject'],
          html_body: html_body,
          text_body: text_body,
          layout_template: template_config['layout']
        )
      end
      puts "  #{action}: #{alias_name} (#{template_config['name']})"
      :updated
    else
      action = '✨ Creating'
      unless dry_run
        @client.create_template(
          name: template_config['name'],
          alias_name: alias_name,
          subject: template_config['subject'],
          html_body: html_body,
          text_body: text_body,
          template_type: template_config['type'] || 'Standard',
          layout_template: template_config['type'] == 'Standard' ? template_config['layout'] : nil
        )
      end
      puts "  #{action}: #{alias_name} (#{template_config['name']})"
      :created
    end
  rescue StandardError => e
    puts "  ❌ Error syncing #{alias_name}: #{e.message}"
    :errors
  end

  def load_file(relative_path)
    return nil unless relative_path
    
    full_path = File.join(@project_root, relative_path)
    return nil unless File.exist?(full_path)
    
    File.read(full_path)
  end

  def file_exists?(relative_path)
    return false unless relative_path
    
    full_path = File.join(@project_root, relative_path)
    File.exist?(full_path)
  end

  def fetch_remote_templates
    result = @client.list_templates(count: 500)
    templates = result['Templates'] || []
    templates.each_with_object({}) do |t, hash|
      hash[t['Alias']] = t if t['Alias']
    end
  rescue PostmarkClient::ApiError
    {}
  end

  def print_summary(results)
    puts "\n📋 Summary:"
    puts "  ✨ Created: #{results[:created].length}"
    puts "  🔄 Updated: #{results[:updated].length}"
    puts "  ⏭️  Skipped: #{results[:skipped].length}"
    puts "  ❌ Errors:  #{results[:errors].length}"
    
    if results[:errors].any?
      puts "\n  Failed templates:"
      results[:errors].each { |a| puts "    - #{a}" }
    end
    puts
  end
end
