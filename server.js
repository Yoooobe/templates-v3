// =============================================================================
// Templates V3 – Editor Server (Enhanced)
// =============================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('https');

const app = express();
const PORT = 3333;
const ROOT = __dirname;
const DESIGN_CONFIG_PATH = path.join(ROOT, 'config', 'design.json');
const UPLOADS_DIR = path.join(ROOT, 'public', 'uploads');

// Load env vars from .env
function loadEnv(filePath) {
  try {
    var envFile = fs.readFileSync(filePath, 'utf-8');
    envFile.split('\n').forEach(function(line) {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      var eq = line.indexOf('=');
      if (eq > 0) {
        var key = line.substring(0, eq).trim();
        var val = line.substring(eq + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    });
    return true;
  } catch(e) { return false; }
}
// Try multiple locations
loadEnv(path.join(ROOT, '.env')) || loadEnv(path.join(ROOT, 'config', '.env'));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(ROOT, 'public')));
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════
// Postmark API Helper
// ═══════════════════════════════════════════════════════════
function postmarkRequest(method, endpoint, body) {
  return new Promise(function(resolve, reject) {
    var token = process.env.POSTMARK_API_TOKEN;
    if (!token || token === 'your-server-api-token-here') {
      return reject(new Error('POSTMARK_API_TOKEN not configured. Add it to .env'));
    }
    var data = body ? JSON.stringify(body) : null;
    var opts = {
      hostname: 'api.postmarkapp.com',
      path: endpoint,
      method: method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token
      }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    var req = http.request(opts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var body = Buffer.concat(chunks).toString();
        try { body = JSON.parse(body); } catch(e) {}
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error(JSON.stringify(body)));
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════
// YAML Parser (minimal)
// ═══════════════════════════════════════════════════════════
function parsePostmarkYml() {
  var ymlPath = path.join(ROOT, 'config', 'postmark.yml');
  if (!fs.existsSync(ymlPath)) return {};
  var content = fs.readFileSync(ymlPath, 'utf-8');
  var templates = {};
  var current = null;
  content.split('\n').forEach(function(line) {
    var m;
    if ((m = line.match(/^  (v3[\w-]+):/))) {
      current = m[1]; templates[current] = { alias: current };
    } else if (current && (m = line.match(/^\s+name:\s*"(.+)"$/))) {
      templates[current].name = m[1];
    } else if (current && (m = line.match(/^\s+type:\s*"(.+)"$/))) {
      templates[current].type = m[1];
    } else if (current && (m = line.match(/^\s+html_file:\s*"(.+)"$/))) {
      templates[current].html_file = m[1];
    } else if (current && (m = line.match(/^\s+text_file:\s*"(.+)"$/))) {
      templates[current].text_file = m[1];
    } else if (current && (m = line.match(/^\s+subject:\s*"(.+)"$/))) {
      templates[current].subject = m[1];
    } else if (current && (m = line.match(/^\s+layout:\s*"(.+)"$/))) {
      templates[current].layout = m[1];
    } else if (line.match(/^\s*#/) || line.trim() === '') {
      // skip
    }
  });
  return templates;
}

// ─── API: List all templates ────────────────────────────────────────────
app.get('/api/templates', function(req, res) {
  var templatesDir = path.join(ROOT, 'templates');
  var templates = [];
  function scan(dir, prefix) {
    prefix = prefix || '';
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (entry.isDirectory()) {
        scan(path.join(dir, entry.name), prefix ? prefix + '/' + entry.name : entry.name);
      } else if (entry.name.endsWith('.html')) {
        var relPath = prefix ? prefix + '/' + entry.name : entry.name;
        var baseName = entry.name.replace('.html', '');
        var category = 'general';
        if (prefix.indexOf('member') !== -1) category = 'member';
        else if (prefix.indexOf('manager') !== -1) category = 'manager';
        else if (prefix.indexOf('layouts') !== -1) category = 'layout';
        templates.push({ id: relPath, name: baseName, category: category, path: relPath, file: 'templates/' + relPath });
      }
    }
  }
  scan(templatesDir);
  templates.sort(function(a, b) {
    var order = { layout: 0, general: 1, member: 2, manager: 3 };
    return (order[a.category] || 9) - (order[b.category] || 9) || a.name.localeCompare(b.name);
  });
  res.json(templates);
});

// ─── API: Get template ──────────────────────────────────────────────────
app.get('/api/template', function(req, res) {
  var tplPath = req.query.path;
  if (!tplPath) return res.status(400).json({ error: 'Missing path' });
  var safePath = path.normalize(tplPath).replace(/^(\.\.(\/|\\|$))+/, '');
  var filePath = path.join(ROOT, 'templates', safePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.json({ path: safePath, content: fs.readFileSync(filePath, 'utf-8') });
});

// ─── API: Save template ─────────────────────────────────────────────────
app.put('/api/template', function(req, res) {
  var tplPath = req.query.path;
  if (!tplPath) return res.status(400).json({ error: 'Missing path' });
  var safePath = path.normalize(tplPath).replace(/^(\.\.(\/|\\|$))+/, '');
  var filePath = path.join(ROOT, 'templates', safePath);
  var dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, req.body.content, 'utf-8');
  res.json({ success: true, path: safePath });
});

// ─── API: Get layout ────────────────────────────────────────────────────
app.get('/api/layout', function(req, res) {
  var layoutPath = path.join(ROOT, 'templates', 'layouts', 'base_layout.html');
  if (!fs.existsSync(layoutPath)) return res.status(404).json({ error: 'Layout not found' });
  res.json({ content: fs.readFileSync(layoutPath, 'utf-8') });
});

// ─── API: Sample data ───────────────────────────────────────────────────
app.get('/api/sample-data', function(req, res) {
  var dataPath = path.join(ROOT, 'data', 'sample_models.json');
  if (!fs.existsSync(dataPath)) return res.status(404).json({});
  res.json(JSON.parse(fs.readFileSync(dataPath, 'utf-8')));
});

// ─── API: Chicken Corn docs ─────────────────────────────────────────────
app.get('/api/chicken-corn', function(req, res) {
  var docPath = path.join(ROOT, 'public', 'chicken-corn.md');
  if (!fs.existsSync(docPath)) return res.status(404).json({ error: 'Not found' });
  res.json({ content: fs.readFileSync(docPath, 'utf-8') });
});

// ─── API: Design Get/Save ───────────────────────────────────────────────
app.get('/api/design', function(req, res) {
  if (!fs.existsSync(DESIGN_CONFIG_PATH)) {
    return res.json({
      colors: { primary: '#F29F40', secondary: '#4F46E5', gradientStart: '#6366F1', gradientEnd: '#F29F40', background: '#FFFFFF', backgroundAlt: '#F9FAFB', textPrimary: '#11181C', textMuted: '#71717A', success: '#22C55E', warning: '#F29F40', danger: '#EF4444' },
      fonts: { heading: 'Poppins', body: 'Poppins', code: 'JetBrains Mono' },
      images: { logo: 'https://catalogo.yoobe.co/yoobe-logo-header.svg', logoWidth: '180', logoHeight: '40', favicon: '' },
      borderRadius: { cards: '12', buttons: '12', badges: '9999' }
    });
  }
  res.json(JSON.parse(fs.readFileSync(DESIGN_CONFIG_PATH, 'utf-8')));
});

app.put('/api/design', function(req, res) {
  fs.writeFileSync(DESIGN_CONFIG_PATH, JSON.stringify(req.body, null, 2), 'utf-8');
  res.json({ success: true });
});

// ─── API: Apply design to all templates and sync to Postmark ────────────
app.post('/api/design/apply-and-sync', async function(req, res) {
  try {
    // Save design first
    if (req.body.design) {
      fs.writeFileSync(DESIGN_CONFIG_PATH, JSON.stringify(req.body.design, null, 2), 'utf-8');
    }
    // Now sync all templates to Postmark (they read files on-demand)
    var ymlTemplates = parsePostmarkYml();
    var results = [];
    var aliases = Object.keys(ymlTemplates);
    aliases.sort(function(a, b) {
      var ta = ymlTemplates[a].type || 'Standard'; var tb = ymlTemplates[b].type || 'Standard';
      return (ta === 'Layout' ? 0 : 1) - (tb === 'Layout' ? 0 : 1);
    });
    for (var i = 0; i < aliases.length; i++) {
      var alias = aliases[i]; var tpl = ymlTemplates[alias];
      try {
        var htmlPath = path.join(ROOT, tpl.html_file);
        if (!fs.existsSync(htmlPath)) { results.push({ alias: alias, error: 'File not found' }); continue; }
        var htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        var exists = false;
        try { await postmarkRequest('GET', '/templates/' + alias); exists = true; } catch(e) {}
        var body = { Name: tpl.name, Alias: alias, HtmlBody: htmlContent, TemplateType: tpl.type || 'Standard' };
        if (tpl.subject) body.Subject = tpl.subject;
        if (tpl.layout) body.LayoutTemplate = tpl.layout;
        if (exists) await postmarkRequest('PUT', '/templates/' + alias, body);
        else await postmarkRequest('POST', '/templates', body);
        results.push({ alias: alias, success: true, action: exists ? 'updated' : 'created' });
      } catch(err) { results.push({ alias: alias, error: err.message }); }
    }
    res.json({ results: results });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── API: Get final rendered HTML (with layout + design tokens) ─────────
app.get('/api/template/final-html', function(req, res) {
  var tplPath = req.query.path;
  if (!tplPath) return res.status(400).json({ error: 'Missing path' });
  var safePath = path.normalize(tplPath).replace(/^(\.\.(\\|\/|$))+/, '');
  var filePath = path.join(ROOT, 'templates', safePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  var html = fs.readFileSync(filePath, 'utf-8');
  // Wrap in layout if not layout itself
  var layoutPath = path.join(ROOT, 'templates', 'layouts', 'base_layout.html');
  if (!safePath.includes('layouts/') && fs.existsSync(layoutPath)) {
    var layout = fs.readFileSync(layoutPath, 'utf-8');
    html = layout.replace('{{{@content}}}', html);
  }
  res.json({ html: html });
});

// ─── API: Get per-template Postmark status ──────────────────────────────
app.get('/api/postmark/templates', async function(req, res) {
  try {
    var data = await postmarkRequest('GET', '/templates?count=100&offset=0&TemplateType=All');
    var remote = {};
    (data.Templates || []).forEach(function(t) {
      remote[t.Alias || t.Name] = {
        id: t.TemplateId,
        name: t.Name,
        alias: t.Alias,
        active: t.Active,
        type: t.TemplateType
      };
    });
    // Map local templates to Postmark status
    var ymlTemplates = parsePostmarkYml();
    var status = {};
    for (var alias in ymlTemplates) {
      status[alias] = {
        local: true,
        postmark: !!remote[alias],
        postmarkId: remote[alias] ? remote[alias].id : null,
        name: ymlTemplates[alias].name
      };
    }
    res.json({ connected: true, status: status, total: data.TotalCount || 0 });
  } catch(err) { res.json({ connected: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// Postmark Sync Endpoints
// ═══════════════════════════════════════════════════════════

// List templates on Postmark
app.get('/api/postmark/status', async function(req, res) {
  try {
    var data = await postmarkRequest('GET', '/templates?count=100&offset=0&TemplateType=All');
    var remote = {};
    (data.Templates || []).forEach(function(t) { remote[t.Alias || t.Name] = t; });
    res.json({ connected: true, templates: remote, total: data.TotalCount || 0 });
  } catch(err) { res.json({ connected: false, error: err.message }); }
});

// Sync a single template
app.post('/api/postmark/sync', async function(req, res) {
  try {
    var alias = req.body.alias;
    var ymlTemplates = parsePostmarkYml();
    var tpl = ymlTemplates[alias];
    if (!tpl) return res.status(404).json({ error: 'Template alias not found in postmark.yml: ' + alias });

    var htmlPath = path.join(ROOT, tpl.html_file);
    if (!fs.existsSync(htmlPath)) return res.status(404).json({ error: 'HTML file not found: ' + tpl.html_file });
    var htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    var textContent = '';
    if (tpl.text_file) {
      var textPath = path.join(ROOT, tpl.text_file);
      if (fs.existsSync(textPath)) textContent = fs.readFileSync(textPath, 'utf-8');
    }

    // Check if exists on Postmark
    var exists = false;
    try {
      await postmarkRequest('GET', '/templates/' + alias);
      exists = true;
    } catch(e) { /* doesn't exist */ }

    var body = {
      Name: tpl.name,
      Alias: alias,
      HtmlBody: htmlContent,
      TextBody: textContent || undefined,
      TemplateType: tpl.type || 'Standard'
    };
    if (tpl.subject) body.Subject = tpl.subject;
    if (tpl.layout) body.LayoutTemplate = tpl.layout;

    var result;
    if (exists) {
      result = await postmarkRequest('PUT', '/templates/' + alias, body);
    } else {
      result = await postmarkRequest('POST', '/templates', body);
    }

    res.json({ success: true, action: exists ? 'updated' : 'created', template: result });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Sync ALL templates
app.post('/api/postmark/sync-all', async function(req, res) {
  try {
    var ymlTemplates = parsePostmarkYml();
    var results = [];
    var aliases = Object.keys(ymlTemplates);

    // Sort: layouts first
    aliases.sort(function(a, b) {
      var ta = ymlTemplates[a].type || 'Standard';
      var tb = ymlTemplates[b].type || 'Standard';
      return (ta === 'Layout' ? 0 : 1) - (tb === 'Layout' ? 0 : 1);
    });

    for (var i = 0; i < aliases.length; i++) {
      var alias = aliases[i];
      var tpl = ymlTemplates[alias];
      try {
        var htmlPath = path.join(ROOT, tpl.html_file);
        if (!fs.existsSync(htmlPath)) { results.push({ alias: alias, error: 'File not found' }); continue; }
        var htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        var textContent = '';
        if (tpl.text_file) { var tp = path.join(ROOT, tpl.text_file); if (fs.existsSync(tp)) textContent = fs.readFileSync(tp, 'utf-8'); }

        var exists = false;
        try { await postmarkRequest('GET', '/templates/' + alias); exists = true; } catch(e) {}

        var body = { Name: tpl.name, Alias: alias, HtmlBody: htmlContent, TextBody: textContent || undefined, TemplateType: tpl.type || 'Standard' };
        if (tpl.subject) body.Subject = tpl.subject;
        if (tpl.layout) body.LayoutTemplate = tpl.layout;

        var result;
        if (exists) result = await postmarkRequest('PUT', '/templates/' + alias, body);
        else result = await postmarkRequest('POST', '/templates', body);

        results.push({ alias: alias, success: true, action: exists ? 'updated' : 'created' });
      } catch(err) { results.push({ alias: alias, error: err.message }); }
    }
    res.json({ results: results });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// Image Upload
// ═══════════════════════════════════════════════════════════
app.post('/api/upload', function(req, res) {
  try {
    var data = req.body.data; // base64
    var filename = req.body.filename || ('upload-' + Date.now() + '.png');
    var buf = Buffer.from(data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    var safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    var filePath = path.join(UPLOADS_DIR, safeName);
    fs.writeFileSync(filePath, buf);
    res.json({ success: true, url: '/uploads/' + safeName });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── API: Save + Sync single template ───────────────────────────────────
app.post('/api/template/save-and-sync', async function(req, res) {
  try {
    var tplPath = req.body.path;
    var content = req.body.content;
    var alias = req.body.alias;
    if (!tplPath || !content) return res.status(400).json({ error: 'Missing path or content' });
    var safePath = path.normalize(tplPath).replace(/^(\.\.(\\|\/|$))+/, '');
    var filePath = path.join(ROOT, 'templates', safePath);
    var dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    var syncResult = null;
    if (alias) {
      var ymlTemplates = parsePostmarkYml();
      var tpl = ymlTemplates[alias];
      if (tpl) {
        var exists = false;
        try { await postmarkRequest('GET', '/templates/' + alias); exists = true; } catch(e) {}
        var body = { Name: tpl.name, Alias: alias, HtmlBody: content, TemplateType: tpl.type || 'Standard' };
        if (tpl.subject) body.Subject = tpl.subject;
        if (tpl.layout) body.LayoutTemplate = tpl.layout;
        if (exists) await postmarkRequest('PUT', '/templates/' + alias, body);
        else await postmarkRequest('POST', '/templates', body);
        syncResult = { success: true, action: exists ? 'updated' : 'created' };
      }
    }
    res.json({ saved: true, sync: syncResult });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── API: Icons ─────────────────────────────────────────────────────────
app.get('/api/icons', function(req, res) {
  var iconsPath = path.join(ROOT, 'public', 'icons.json');
  if (!fs.existsSync(iconsPath)) return res.json([]);
  res.json(JSON.parse(fs.readFileSync(iconsPath, 'utf-8')));
});

// ─── Start ──────────────────────────────────────────────────────────────
app.listen(PORT, function() {
  console.log('');
  console.log('  🎨 Templates V3 Editor (Enhanced)');
  console.log('  ──────────────────────────────────');
  console.log('  → http://localhost:' + PORT);
  console.log('  Postmark: ' + (process.env.POSTMARK_API_TOKEN && process.env.POSTMARK_API_TOKEN !== 'your-server-api-token-here' ? '✅ Connected' : '⚠️  Set POSTMARK_API_TOKEN in .env'));
  console.log('');
});
