// =============================================================================
// Templates V3 – Editor Server
// =============================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3333;
const ROOT = __dirname;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(ROOT, 'public')));

// ─── API: List all templates ────────────────────────────────────────────
app.get('/api/templates', (req, res) => {
  const templatesDir = path.join(ROOT, 'templates');
  const templates = [];

  function scan(dir, prefix) {
    prefix = prefix || '';
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        scan(path.join(dir, entry.name), prefix ? prefix + '/' + entry.name : entry.name);
      } else if (entry.name.endsWith('.html')) {
        const relPath = prefix ? prefix + '/' + entry.name : entry.name;
        const baseName = entry.name.replace('.html', '');
        let category = 'general';
        if (prefix.indexOf('member') !== -1) category = 'member';
        else if (prefix.indexOf('manager') !== -1) category = 'manager';
        else if (prefix.indexOf('layouts') !== -1) category = 'layout';

        templates.push({
          id: relPath,
          name: baseName,
          category: category,
          path: relPath,
          file: 'templates/' + relPath
        });
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
  if (!tplPath) return res.status(400).json({ error: 'Missing path query param' });

  // Prevent path traversal
  var safePath = path.normalize(tplPath).replace(/^(\.\.(\/|\\|$))+/, '');
  var filePath = path.join(ROOT, 'templates', safePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });

  var content = fs.readFileSync(filePath, 'utf-8');
  res.json({ path: safePath, content: content });
});

// ─── API: Save template content ─────────────────────────────────────────
app.put('/api/template', function(req, res) {
  var tplPath = req.query.path;
  if (!tplPath) return res.status(400).json({ error: 'Missing path query param' });

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
  var content = fs.readFileSync(layoutPath, 'utf-8');
  res.json({ content: content });
});

// ─── API: Get sample data ───────────────────────────────────────────────
app.get('/api/sample-data', function(req, res) {
  var dataPath = path.join(ROOT, 'data', 'sample_models.json');
  if (!fs.existsSync(dataPath)) return res.status(404).json({ error: 'Sample data not found' });
  var content = fs.readFileSync(dataPath, 'utf-8');
  res.json(JSON.parse(content));
});

// ─── API: Get config ────────────────────────────────────────────────────
app.get('/api/config', function(req, res) {
  var configPath = path.join(ROOT, 'config', 'postmark.yml');
  if (!fs.existsSync(configPath)) return res.json({});
  var content = fs.readFileSync(configPath, 'utf-8');
  res.json({ content: content });
});

// ─── Start ──────────────────────────────────────────────────────────────
app.listen(PORT, function() {
  console.log('');
  console.log('  🎨 Templates V3 Editor');
  console.log('  ──────────────────────');
  console.log('  → http://localhost:' + PORT);
  console.log('');
});
