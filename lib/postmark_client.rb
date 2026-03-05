# frozen_string_literal: true

require 'net/http'
require 'uri'
require 'json'

# =============================================================================
# PostmarkClient – Wrapper for Postmark Templates REST API
# =============================================================================
# Handles all communication with the Postmark API for template management
# and email sending. Uses the Server API Token for authentication.
#
# Usage:
#   client = PostmarkClient.new(ENV['POSTMARK_API_TOKEN'])
#   client.list_templates
#   client.create_template(name: "Welcome", alias: "v3-welcome", ...)
#   client.send_with_template(alias: "v3-welcome", to: "user@example.com", model: {...})
# =============================================================================
class PostmarkClient
  API_BASE = 'https://api.postmarkapp.com'

  class ApiError < StandardError
    attr_reader :error_code, :status_code

    def initialize(message, error_code: nil, status_code: nil)
      @error_code = error_code
      @status_code = status_code
      super("Postmark API Error [#{status_code}] (#{error_code}): #{message}")
    end
  end

  # @param api_token [String] Postmark Server API Token
  def initialize(api_token = nil)
    @api_token = api_token || ENV['POSTMARK_API_TOKEN']
    raise ArgumentError, 'POSTMARK_API_TOKEN is required' if @api_token.nil? || @api_token.empty?
  end

  # ─── Template CRUD ──────────────────────────────────────────────────────

  # List all templates on the server
  # @param count [Integer] Number of templates to return (max 500)
  # @param offset [Integer] Offset for pagination
  # @param template_type [String] "Standard" or "Layout"
  # @return [Hash] { TotalCount, Templates[] }
  def list_templates(count: 100, offset: 0, template_type: nil)
    params = { count: count, offset: offset }
    params[:templateType] = template_type if template_type
    get('/templates', params)
  end

  # Get a single template by ID or alias
  # @param id_or_alias [String, Integer] Template ID or alias
  # @return [Hash] Template details
  def get_template(id_or_alias)
    get("/templates/#{id_or_alias}")
  end

  # Create a new template
  # @param name [String] Template name
  # @param alias_name [String] Template alias (identifier)
  # @param subject [String] Subject line (with Mustachio variables)
  # @param html_body [String] HTML body content
  # @param text_body [String] Plain text body content
  # @param template_type [String] "Standard" or "Layout"
  # @param layout_template [String, nil] Layout alias to use (for Standard templates)
  # @return [Hash] Created template { TemplateId, Name, Active, Alias, TemplateType }
  def create_template(name:, alias_name:, subject: nil, html_body:, text_body: '', template_type: 'Standard', layout_template: nil)
    body = {
      Name: name,
      Alias: alias_name,
      HtmlBody: html_body,
      TextBody: text_body,
      TemplateType: template_type
    }
    body[:Subject] = subject if subject && template_type == 'Standard'
    body[:LayoutTemplate] = layout_template if layout_template && template_type == 'Standard'

    post('/templates', body)
  end

  # Update an existing template
  # @param id_or_alias [String, Integer] Template ID or alias
  # @param options [Hash] Fields to update (Name, Subject, HtmlBody, TextBody, LayoutTemplate)
  # @return [Hash] Updated template details
  def update_template(id_or_alias, **options)
    body = {}
    body[:Name] = options[:name] if options[:name]
    body[:Subject] = options[:subject] if options[:subject]
    body[:HtmlBody] = options[:html_body] if options[:html_body]
    body[:TextBody] = options[:text_body] if options[:text_body]
    body[:LayoutTemplate] = options[:layout_template] if options.key?(:layout_template)

    put("/templates/#{id_or_alias}", body)
  end

  # Delete a template
  # @param id_or_alias [String, Integer] Template ID or alias
  # @return [Hash] Deletion confirmation
  def delete_template(id_or_alias)
    delete("/templates/#{id_or_alias}")
  end

  # Validate a template's content
  # @param subject [String] Subject with Mustachio syntax
  # @param html_body [String] HTML body with Mustachio syntax
  # @param text_body [String] Text body with Mustachio syntax
  # @param test_render_model [Hash] Sample data to test rendering
  # @param template_type [String] "Standard" or "Layout"
  # @param layout_template [String, nil] Layout alias
  # @return [Hash] Validation result with SuggestedTemplateModel
  def validate_template(subject: nil, html_body: nil, text_body: nil, test_render_model: nil, template_type: 'Standard', layout_template: nil)
    body = {
      TemplateType: template_type
    }
    body[:Subject] = subject if subject
    body[:HtmlBody] = html_body if html_body
    body[:TextBody] = text_body if text_body
    body[:TestRenderModel] = test_render_model if test_render_model
    body[:LayoutTemplate] = layout_template if layout_template

    post('/templates/validate', body)
  end

  # ─── Email Sending ─────────────────────────────────────────────────────

  # Send a single email using a template
  # @param template_alias [String] Template alias
  # @param to [String] Recipient email
  # @param model [Hash] Template model data (variables)
  # @param from [String] Sender email (defaults to env)
  # @param tag [String, nil] Email tag for categorization
  # @param message_stream [String] Message stream ID
  # @param metadata [Hash, nil] Custom metadata key/value pairs
  # @return [Hash] Send result { To, SubmittedAt, MessageID }
  def send_with_template(template_alias:, to:, model:, from: nil, tag: nil, message_stream: 'outbound', metadata: nil)
    body = {
      TemplateAlias: template_alias,
      TemplateModel: model,
      From: from || ENV['POSTMARK_SENDER'],
      To: to,
      MessageStream: message_stream,
      TrackOpens: true,
      TrackLinks: 'HtmlAndText',
      InlineCss: true
    }
    body[:Tag] = tag if tag
    body[:Metadata] = metadata if metadata

    post('/email/withTemplate', body)
  end

  # Send batch emails using templates
  # @param messages [Array<Hash>] Array of message objects, each with TemplateAlias, To, TemplateModel, etc.
  # @return [Array<Hash>] Array of send results
  def send_batch_with_templates(messages)
    body = { Messages: messages.map { |msg| format_template_message(msg) } }
    post('/email/batchWithTemplates', body)
  end

  private

  def format_template_message(msg)
    {
      TemplateAlias: msg[:template_alias],
      TemplateModel: msg[:model],
      From: msg[:from] || ENV['POSTMARK_SENDER'],
      To: msg[:to],
      MessageStream: msg[:message_stream] || 'outbound',
      TrackOpens: true,
      TrackLinks: 'HtmlAndText',
      InlineCss: true
    }.tap do |m|
      m[:Tag] = msg[:tag] if msg[:tag]
      m[:Metadata] = msg[:metadata] if msg[:metadata]
    end
  end

  # ─── HTTP Methods ──────────────────────────────────────────────────────

  def get(path, params = {})
    uri = build_uri(path, params)
    request = Net::HTTP::Get.new(uri)
    execute_request(uri, request)
  end

  def post(path, body)
    uri = build_uri(path)
    request = Net::HTTP::Post.new(uri)
    request.body = body.to_json
    execute_request(uri, request)
  end

  def put(path, body)
    uri = build_uri(path)
    request = Net::HTTP::Put.new(uri)
    request.body = body.to_json
    execute_request(uri, request)
  end

  def delete(path)
    uri = build_uri(path)
    request = Net::HTTP::Delete.new(uri)
    execute_request(uri, request)
  end

  def build_uri(path, params = {})
    uri = URI.parse("#{API_BASE}#{path}")
    uri.query = URI.encode_www_form(params) unless params.empty?
    uri
  end

  def execute_request(uri, request)
    request['Accept'] = 'application/json'
    request['Content-Type'] = 'application/json'
    request['X-Postmark-Server-Token'] = @api_token

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 10
    http.read_timeout = 30

    response = http.request(request)
    parse_response(response)
  end

  def parse_response(response)
    body = response.body ? JSON.parse(response.body) : {}

    case response.code.to_i
    when 200..299
      body
    when 401
      raise ApiError.new('Unauthorized – check your API token', error_code: body['ErrorCode'], status_code: 401)
    when 422
      raise ApiError.new(body['Message'] || 'Validation error', error_code: body['ErrorCode'], status_code: 422)
    when 429
      raise ApiError.new('Rate limited – too many requests', error_code: body['ErrorCode'], status_code: 429)
    else
      raise ApiError.new(body['Message'] || "HTTP #{response.code}", error_code: body['ErrorCode'], status_code: response.code.to_i)
    end
  end
end
