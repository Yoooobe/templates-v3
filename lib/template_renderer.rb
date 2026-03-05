# frozen_string_literal: true

require 'json'

# =============================================================================
# TemplateRenderer – Local Preview of Postmark Templates
# =============================================================================
# Renders templates locally using sample data for preview purposes.
# Performs basic Mustachio-like variable substitution (not full engine).
#
# Usage:
#   renderer = TemplateRenderer.new
#   html = renderer.render('v3-order-confirmation')
#   renderer.preview_in_browser('v3-welcome')
# =============================================================================
class TemplateRenderer
  def initialize
    @project_root = File.expand_path('..', __dir__)
    @config = load_config
    @sample_data = load_sample_data
  end

  # Render a template with sample data
  # @param alias_name [String] Template alias
  # @param custom_data [Hash] Override sample data
  # @return [String] Rendered HTML
  def render(alias_name, custom_data: nil)
    template_config = (@config['templates'] || {})[alias_name]
    raise "Template '#{alias_name}' not found in config" unless template_config

    html_body = load_file(template_config['html_file'])
    raise "HTML file not found: #{template_config['html_file']}" unless html_body

    # If it uses a layout, wrap in layout
    layout_alias = template_config['layout']
    if layout_alias && template_config['type'] == 'Standard'
      layout_config = (@config['templates'] || {})[layout_alias]
      if layout_config
        layout_html = load_file(layout_config['html_file'])
        if layout_html
          html_body = layout_html.gsub('{{{ @content }}}', html_body)
        end
      end
    end

    # Apply sample data with basic Mustachio substitution
    data = custom_data || @sample_data
    rendered = substitute_variables(html_body, data)
    rendered
  end

  # Render and open in browser
  # @param alias_name [String] Template alias
  def preview_in_browser(alias_name)
    html = render(alias_name)
    
    output_dir = File.join(@project_root, 'tmp', 'preview')
    FileUtils.mkdir_p(output_dir)
    
    output_file = File.join(output_dir, "#{alias_name}.html")
    File.write(output_file, html)

    puts "📄 Preview saved to: #{output_file}"
    
    # Try to open in browser
    system("open '#{output_file}'") || system("xdg-open '#{output_file}'")
  end

  # Render all templates and save to preview directory
  def render_all
    output_dir = File.join(@project_root, 'tmp', 'preview')
    FileUtils.mkdir_p(output_dir)

    templates = @config['templates'] || {}
    templates.each do |alias_name, template_config|
      next if template_config['type'] == 'Layout'
      
      begin
        html = render(alias_name)
        output_file = File.join(output_dir, "#{alias_name}.html")
        File.write(output_file, html)
        puts "  ✅ #{alias_name} → #{output_file}"
      rescue StandardError => e
        puts "  ❌ #{alias_name}: #{e.message}"
      end
    end

    puts "\n📂 All previews saved to: #{output_dir}"
  end

  private

  def load_config
    config_path = File.join(@project_root, 'config', 'postmark.yml')
    YAML.load_file(config_path)
  end

  def load_sample_data
    data_path = File.join(@project_root, 'data', 'sample_models.json')
    return {} unless File.exist?(data_path)
    
    JSON.parse(File.read(data_path))
  end

  def load_file(relative_path)
    return nil unless relative_path
    
    full_path = File.join(@project_root, relative_path)
    return nil unless File.exist?(full_path)
    
    File.read(full_path)
  end

  # Basic Mustachio-like variable substitution for preview
  # Note: This is a simplified version for local preview only.
  # The actual rendering is done by Postmark's Mustachio engine.
  def substitute_variables(html, data, prefix: '')
    result = html.dup

    data.each do |key, value|
      full_key = prefix.empty? ? key : "#{prefix}.#{key}"

      case value
      when Hash
        result = substitute_variables(result, value, prefix: full_key)
      when Array
        # Handle {{#each items}} ... {{/each}} blocks
        each_pattern = /\{\{#each\s+#{Regexp.escape(key)}\}\}(.*?)\{\{\/each\}\}/m
        result.gsub!(each_pattern) do
          block_content = Regexp.last_match(1)
          value.map do |item|
            if item.is_a?(Hash)
              substitute_variables(block_content, item)
            else
              block_content.gsub(/\{\{\s*\.\s*\}\}/, item.to_s)
            end
          end.join
        end
      else
        # Replace {{ variable }} and {{{ variable }}} (triple for unescaped)
        result.gsub!(/\{\{\{?\s*#{Regexp.escape(full_key)}\s*\}\}\}?/, value.to_s)
        # Also replace without prefix if we're in a scoped context
        result.gsub!(/\{\{\{?\s*#{Regexp.escape(key)}\s*\}\}\}?/, value.to_s) unless prefix.empty?
      end
    end

    # Clean up any remaining unreplaced variables
    # result.gsub!(/\{\{\{?\s*[a-zA-Z0-9_.\/]+\s*\}\}\}?/, '')

    result
  end
end
