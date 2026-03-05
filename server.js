// =============================================================================
// Templates V3 – Editor Server
// =============================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3333;
const ROOT = __dirname;
const DESIGN_CONFIG_PATH = path.join(ROOT, 'config', 'design.json');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(ROOT, 'public')));

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

// ─── API: Get template content ──────────────────────────────────────────
app.get('/api/template', function(req, res) {
  var tplPath = req.query.path;
  if (!tplPath) return res.status(400).json({ error: 'Missing path' });
  var safePath = path.normalize(tplPath).replace(/^(\.\.(\/|\\|$))+/, '');
  var filePath = path.join(ROOT, 'templates', safePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.json({ path: safePath, content: fs.readFileSync(filePath, 'utf-8') });
});

// ─── API: Save template content ─────────────────────────────────────────
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

// ─── API: Get sample data ───────────────────────────────────────────────
app.get('/api/sample-data', function(req, res) {
  var dataPath = path.join(ROOT, 'data', 'sample_models.json');
  if (!fs.existsSync(dataPath)) return res.status(404).json({});
  res.json(JSON.parse(fs.readFileSync(dataPath, 'utf-8')));
});

// ─── API: Get Chicken Corn docs ─────────────────────────────────────────
app.get('/api/chicken-corn', function(req, res) {
  var docPath = path.join(ROOT, 'public', 'chicken-corn.md');
  if (!fs.existsSync(docPath)) return res.status(404).json({ error: 'Not found' });
  res.json({ content: fs.readFileSync(docPath, 'utf-8') });
});

// ─── API: Get design config ─────────────────────────────────────────────
app.get('/api/design', function(req, res) {
  if (!fs.existsSync(DESIGN_CONFIG_PATH)) {
    return res.json({
      colors: {
        primary: '#F29F40',
        secondary: '#4F46E5',
        gradientStart: '#6366F1',
        gradientEnd: '#F29F40',
        background: '#FFFFFF',
        backgroundAlt: '#F9FAFB',
        textPrimary: '#11181C',
        textMuted: '#71717A',
        success: '#22C55E',
        warning: '#F29F40',
        danger: '#EF4444'
      },
      fonts: {
        heading: 'Poppins',
        body: 'Poppins',
        code: 'JetBrains Mono'
      },
      images: {
        logo: 'https://catalogo.yoobe.co/yoobe-logo-header.svg',
        logoWidth: '180',
        logoHeight: '40',
        favicon: ''
      },
      borderRadius: {
        cards: '12',
        buttons: '12',
        badges: '9999'
      }
    });
  }
  res.json(JSON.parse(fs.readFileSync(DESIGN_CONFIG_PATH, 'utf-8')));
});

// ─── API: Save design config ────────────────────────────────────────────
app.put('/api/design', function(req, res) {
  fs.writeFileSync(DESIGN_CONFIG_PATH, JSON.stringify(req.body, null, 2), 'utf-8');
  res.json({ success: true });
});

// ─── Start ──────────────────────────────────────────────────────────────
app.listen(PORT, function() {
  console.log('');
  console.log('  🎨 Templates V3 Editor');
  console.log('  ──────────────────────');
  console.log('  → http://localhost:' + PORT);
  console.log('');
});
