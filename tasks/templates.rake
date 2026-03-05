# frozen_string_literal: true

require 'fileutils'
require_relative '../lib/template_manager'
require_relative '../lib/template_renderer'

namespace :templates do
  desc 'Sync all templates to Postmark (use DRY_RUN=1 for preview)'
  task :sync do
    dry_run = ENV['DRY_RUN'] == '1' || ENV['DRY_RUN'] == 'true'
    manager = TemplateManager.new
    manager.sync_all(dry_run: dry_run)
  end

  desc 'Sync a single template by alias (e.g., rake templates:sync_one[v3-welcome])'
  task :sync_one, [:alias_name] do |_t, args|
    raise 'Usage: rake templates:sync_one[alias_name]' unless args[:alias_name]
    
    dry_run = ENV['DRY_RUN'] == '1' || ENV['DRY_RUN'] == 'true'
    manager = TemplateManager.new
    manager.sync_one(args[:alias_name], dry_run: dry_run)
  end

  desc 'Show sync status of all templates (local vs remote)'
  task :status do
    manager = TemplateManager.new
    manager.status
  end

  desc 'Preview a template locally in browser (e.g., rake templates:preview[v3-welcome])'
  task :preview, [:alias_name] do |_t, args|
    require 'yaml'
    renderer = TemplateRenderer.new

    if args[:alias_name]
      renderer.preview_in_browser(args[:alias_name])
    else
      puts "\n📄 Rendering all templates for preview...\n"
      renderer.render_all
    end
  end

  desc 'Validate all templates against Postmark API'
  task :validate do
    require 'yaml'
    require 'json'

    project_root = File.expand_path('../..', __FILE__)
    config = YAML.load_file(File.join(project_root, 'config', 'postmark.yml'))
    client = PostmarkClient.new
    sample_data = JSON.parse(File.read(File.join(project_root, 'data', 'sample_models.json')))

    templates = config['templates'] || {}
    puts "\n🔍 Validating #{templates.length} templates...\n"
    puts '─' * 60

    errors = []
    templates.each do |alias_name, template_config|
      html_file = File.join(project_root, template_config['html_file'])
      text_file = template_config['text_file'] ? File.join(project_root, template_config['text_file']) : nil

      unless File.exist?(html_file)
        puts "  ⏭️  #{alias_name} – HTML file not found, skipping"
        next
      end

      html_body = File.read(html_file)
      text_body = text_file && File.exist?(text_file) ? File.read(text_file) : nil

      begin
        result = client.validate_template(
          subject: template_config['subject'],
          html_body: html_body,
          text_body: text_body,
          test_render_model: sample_data,
          template_type: template_config['type'] || 'Standard',
          layout_template: template_config['type'] == 'Standard' ? template_config['layout'] : nil
        )

        content_valid = result.dig('HtmlBody', 'ContentIsValid')
        subject_valid = result.dig('Subject', 'ContentIsValid')

        if content_valid && (subject_valid || template_config['type'] == 'Layout')
          puts "  ✅ #{alias_name}"
          
          # Show suggested model if available
          suggested = result['SuggestedTemplateModel']
          if suggested && ENV['VERBOSE'] == '1'
            puts "     Suggested model: #{JSON.pretty_generate(suggested)}"
          end
        else
          puts "  ❌ #{alias_name} – Validation failed"
          errors << { alias: alias_name, result: result }
          
          # Show validation errors
          %w[HtmlBody TextBody Subject].each do |part|
            part_result = result[part]
            next unless part_result && !part_result['ContentIsValid']
            
            validation_errors = part_result['ValidationErrors'] || []
            validation_errors.each do |err|
              puts "     #{part}: #{err['Message']}"
            end
          end
        end
      rescue PostmarkClient::ApiError => e
        puts "  ❌ #{alias_name} – API Error: #{e.message}"
        errors << { alias: alias_name, error: e.message }
      end
    end

    puts '─' * 60
    if errors.empty?
      puts "✅ All templates are valid!\n\n"
    else
      puts "❌ #{errors.length} template(s) have errors.\n\n"
      exit 1
    end
  end

  desc 'List all templates on Postmark server'
  task :list_remote do
    client = PostmarkClient.new
    result = client.list_templates(count: 500)
    templates = result['Templates'] || []

    puts "\n📋 Templates on Postmark Server (#{templates.length} total)\n"
    puts '─' * 70
    puts format('  %-5s %-25s %-25s %-10s', 'ID', 'ALIAS', 'NAME', 'ACTIVE')
    puts '─' * 70

    templates.each do |t|
      puts format('  %-5s %-25s %-25s %-10s',
                   t['TemplateId'],
                   t['Alias'] || '-',
                   t['Name'],
                   t['Active'] ? '✅' : '❌')
    end
    puts
  end
end
