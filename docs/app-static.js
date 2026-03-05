// ═══════════════════════════════════════════════════════════
// Templates V3 – App JavaScript (v2 Enhanced)
// ═══════════════════════════════════════════════════════════

let templates = [], currentTemplate = null, layoutHtml = '', sampleData = {};
let isDirty = false, currentView = 'split', currentPage = 'editor';
let designConfig = {}, chickenCornMd = '', iconsData = [];
let editorMode = 'code'; // 'code' or 'wysiwyg'
let postmarkTemplates = {}; // alias -> {local, postmark, postmarkId}
let tinymceReady = false;

// ═══════════════════════════════════════════════════════════
// Boot
// ═══════════════════════════════════════════════════════════
async function init() {
  const [tpl, layout, data, design, docs, icons] = await Promise.all([
    fetch('/api/templates').then(r => r.json()),
    fetch('/api/layout').then(r => r.json()),
    fetch('/api/sample-data').then(r => r.json()),
    fetch('/api/design').then(r => r.json()),
    fetch('/api/chicken-corn').then(r => r.json()),
    fetch('/api/icons').then(r => r.json()).catch(() => [])
  ]);
  templates = tpl; layoutHtml = layout.content; sampleData = data;
  designConfig = design; chickenCornMd = docs.content; iconsData = icons;
  document.getElementById('template-count').textContent = '📋 ' + templates.length + ' templates';
  renderSidebar();
  loadDesignUI();
  renderDocs();
  renderIcons();
  checkPostmarkStatus();
}

// ═══════════════════════════════════════════════════════════
// Page Navigation
// ═══════════════════════════════════════════════════════════
function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.header-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  document.getElementById('sidebar').style.display = page === 'editor' ? '' : 'none';
  document.querySelector('.app').style.gridTemplateColumns = page === 'editor' ? '280px 1fr' : '1fr';
  if (page === 'design') updateDesignPreview();
}

// ═══════════════════════════════════════════════════════════
// Sidebar with Postmark Status
// ═══════════════════════════════════════════════════════════
function getTemplateAlias(tpl) {
  var prefix = 'v3-';
  if (tpl.category === 'member') prefix = 'v3-member-';
  else if (tpl.category === 'manager') prefix = 'v3-manager-';
  else if (tpl.category === 'layout') return 'v3-base-layout';
  return prefix + tpl.name.replace(/_/g, '-');
}

function renderSidebar() {
  var sidebar = document.getElementById('sidebar');
  var groups = { layout: { title: '🎨 Layout', items: [] }, general: { title: '📧 Gerais', items: [] }, member: { title: '👤 Membro', items: [] }, manager: { title: '👔 Gestor', items: [] } };
  var icons = { 'base_layout': '🎨', 'welcome': '🎉', 'password_reset': '🔐', 'order_confirmation': '✅', 'order_status_update': '📋', 'invoice': '📄', 'onboarding_invite': '🎁', 'points_added': '⭐', 'points_spent': '💸', 'order_status': '📦', 'campaign_invite': '🎉', 'user_created': '👤', 'campaign_sent': '📤', 'campaign_started': '🚀', 'campaign_ended': '🏁', 'gift_created': '🎁', 'gift_status': '📋', 'crud_update': '🔔', 'low_stock': '⚠️' };
  templates.forEach(t => { if (groups[t.category]) groups[t.category].items.push(t); });
  var html = '';
  for (var key in groups) {
    var group = groups[key]; if (group.items.length === 0) continue;
    html += '<div class="sidebar-group"><div class="sidebar-group-title">' + group.title + '</div>';
    group.items.forEach(t => {
      var icon = icons[t.name] || '📄';
      var badge = key !== 'general' ? '<span class="cat-badge ' + key + '">' + key + '</span>' : '';
      var label = t.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      var alias = getTemplateAlias(t);
      var pm = postmarkTemplates[alias];
      var syncClass = pm ? (pm.postmark ? 'synced' : 'local-only') : 'unknown';
      var syncTitle = pm ? (pm.postmark ? 'Synced (ID: ' + pm.postmarkId + ')' : 'Local only – not on Postmark') : 'Checking...';
      html += '<div class="sidebar-item" data-id="' + t.id + '" onclick="selectTemplate(\'' + t.id + '\')"><span class="icon">' + icon + '</span><span class="label">' + label + '</span>' + badge + '<span class="sync-dot ' + syncClass + '" title="' + syncTitle + '"></span></div>';
    });
    html += '</div>';
  }
  sidebar.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════
// Template Editor
// ═══════════════════════════════════════════════════════════
async function selectTemplate(id) {
  if (isDirty && currentTemplate && !confirm('Alterações não salvas. Continuar?')) return;
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  var sel = document.querySelector('.sidebar-item[data-id="' + id + '"]');
  if (sel) sel.classList.add('active');
  var res = await fetch('/api/template?path=' + encodeURIComponent(id));
  var data = await res.json();
  currentTemplate = templates.find(t => t.id === id);
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('editor-panel').style.display = 'flex';
  document.getElementById('preview-panel').style.display = 'flex';
  applyView();
  var editor = document.getElementById('code-editor');
  editor.value = data.content;
  document.getElementById('editor-filename').textContent = id;

  // Show Postmark alias info
  var alias = getTemplateAlias(currentTemplate);
  var pm = postmarkTemplates[alias];
  var statusHtml = '<span class="pm-alias">' + alias + '</span>';
  if (pm && pm.postmark) statusHtml += '<span class="pm-synced">✅ Postmark #' + pm.postmarkId + '</span>';
  else statusHtml += '<span class="pm-not-synced">⚠️ Não sincronizado</span>';
  document.getElementById('template-pm-status').innerHTML = statusHtml;

  // Update WYSIWYG if active
  if (editorMode === 'wysiwyg' && tinymce && tinymce.get('wysiwyg-editor')) {
    tinymce.get('wysiwyg-editor').setContent(data.content);
  }

  isDirty = false; updateSaveStatus('');
  refreshPreview();
}

function getEditorContent() {
  if (editorMode === 'wysiwyg' && tinymce && tinymce.get('wysiwyg-editor')) {
    return tinymce.get('wysiwyg-editor').getContent();
  }
  return document.getElementById('code-editor').value;
}

function refreshPreview() {
  if (!currentTemplate) return;
  var html = getEditorContent();
  html = injectDesignTokens(html);
  if (currentTemplate.category !== 'layout') html = injectDesignTokens(layoutHtml).replace('{{{ @content }}}', html).replace('{{{@content}}}', html);
  html = substituteVars(html, sampleData);
  var iframe = document.getElementById('preview-frame');
  iframe.srcdoc = html;
  iframe.onload = function() { try { var b = iframe.contentDocument.body; if (b) iframe.style.height = Math.max(400, b.scrollHeight + 40) + 'px'; } catch(e){} };
}

function injectDesignTokens(html) {
  var c = designConfig.colors || {};
  var f = designConfig.fonts || {};
  var replacements = {
    '#F29F40': c.primary || '#F29F40',
    '#4F46E5': c.secondary || '#4F46E5',
    '#6366F1': c.gradientStart || '#6366F1',
    '#FFFFFF': c.background || '#FFFFFF',
    '#F9FAFB': c.backgroundAlt || '#F9FAFB',
    '#11181C': c.textPrimary || '#11181C',
    '#71717A': c.textMuted || '#71717A',
    '#22C55E': c.success || '#22C55E',
    '#EF4444': c.danger || '#EF4444'
  };
  for (var orig in replacements) {
    if (replacements[orig] !== orig) html = html.split(orig).join(replacements[orig]);
  }
  if (f.heading && f.heading !== 'Poppins') {
    html = html.replace(/font-family:\s*'Poppins'/g, "font-family: '" + f.heading + "'");
  }
  return html;
}

async function saveTemplate() {
  if (!currentTemplate) return;
  updateSaveStatus('saving');
  try {
    var content = getEditorContent();
    if (editorMode === 'wysiwyg') document.getElementById('code-editor').value = content;
    var res = await fetch('/api/template?path=' + encodeURIComponent(currentTemplate.id), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content })
    });
    if (!res.ok) throw new Error('Save failed');
    isDirty = false; updateSaveStatus('saved');
    showToast('✅ Template salvo!');
    refreshPreview();
  } catch(err) { updateSaveStatus(''); showToast('❌ Erro: ' + err.message, 'error'); }
}

async function saveAndSync() {
  if (!currentTemplate) return;
  updateSaveStatus('saving');
  var alias = getTemplateAlias(currentTemplate);
  showToast('💾☁️ Salvando e sincronizando ' + alias + '...', 'info');
  try {
    var content = getEditorContent();
    if (editorMode === 'wysiwyg') document.getElementById('code-editor').value = content;
    var res = await fetch('/api/template/save-and-sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentTemplate.id, content: content, alias: alias })
    });
    var data = await res.json();
    if (data.saved) {
      isDirty = false; updateSaveStatus('saved');
      if (data.sync && data.sync.success) {
        showToast('✅ Salvo + Postmark ' + data.sync.action + '!');
        // Update local status
        if (!postmarkTemplates[alias]) postmarkTemplates[alias] = { local: true };
        postmarkTemplates[alias].postmark = true;
        renderSidebar();
        // Re-select current
        var sel = document.querySelector('.sidebar-item[data-id="' + currentTemplate.id + '"]');
        if (sel) sel.classList.add('active');
      } else {
        showToast('✅ Salvo (Sync: ' + (data.sync ? 'erro' : 'sem alias') + ')', 'info');
      }
      refreshPreview();
    } else throw new Error(data.error || 'Failed');
  } catch(err) { updateSaveStatus(''); showToast('❌ ' + err.message, 'error'); }
}

function setView(view) {
  currentView = view;
  document.querySelectorAll('.toolbar-tab[data-view]').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  applyView();
}
function applyView() {
  var content = document.getElementById('content');
  content.className = 'content ' + currentView;
  if (currentTemplate) {
    document.getElementById('editor-panel').style.display = currentView === 'preview-only' ? 'none' : 'flex';
    document.getElementById('preview-panel').style.display = currentView === 'editor-only' ? 'none' : 'flex';
  }
}
function setDevice(device) {
  document.getElementById('preview-frame').className = device !== 'desktop' ? device : '';
  document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}

// ═══════════════════════════════════════════════════════════
// Copy HTML Widgets
// ═══════════════════════════════════════════════════════════
function copyRawHtml() {
  if (!currentTemplate) { showToast('Selecione um template', 'error'); return; }
  var html = getEditorContent();
  navigator.clipboard.writeText(html).then(() => showToast('📋 HTML bruto copiado!'));
}

async function copyFinalHtml() {
  if (!currentTemplate) { showToast('Selecione um template', 'error'); return; }
  try {
    var res = await fetch('/api/template/final-html?path=' + encodeURIComponent(currentTemplate.id));
    var data = await res.json();
    navigator.clipboard.writeText(data.html).then(() => showToast('📋 HTML final (com layout) copiado!'));
  } catch(e) { showToast('❌ Erro ao copiar', 'error'); }
}

// ═══════════════════════════════════════════════════════════
// Editor Mode Toggle (Code / WYSIWYG)
// ═══════════════════════════════════════════════════════════
function setEditorMode(mode) {
  editorMode = mode;
  document.querySelectorAll('.mode-toggle button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  var codeEl = document.getElementById('code-editor');
  var wysiwygWrap = document.getElementById('wysiwyg-wrap');

  if (mode === 'wysiwyg') {
    codeEl.style.display = 'none';
    wysiwygWrap.style.display = 'block';
    initTinyMCE(codeEl.value);
  } else {
    if (tinymce && tinymce.get('wysiwyg-editor')) {
      codeEl.value = tinymce.get('wysiwyg-editor').getContent();
      tinymce.get('wysiwyg-editor').destroy();
    }
    codeEl.style.display = 'block';
    wysiwygWrap.style.display = 'none';
    refreshPreview();
  }
}

function initTinyMCE(content) {
  var existing = document.getElementById('wysiwyg-editor');
  if (!existing) {
    var ta = document.createElement('textarea');
    ta.id = 'wysiwyg-editor';
    document.getElementById('wysiwyg-wrap').appendChild(ta);
  }
  if (tinymce && tinymce.get('wysiwyg-editor')) tinymce.get('wysiwyg-editor').destroy();

  tinymce.init({
    selector: '#wysiwyg-editor',
    height: '100%',
    menubar: false,
    plugins: 'lists link image table code fullscreen visualblocks',
    toolbar: 'undo redo | blocks fontfamily fontsize | bold italic underline forecolor backcolor | alignleft aligncenter alignright | bullist numlist | link image table | gameicons | code fullscreen',
    content_style: "body { font-family: 'Poppins', sans-serif; font-size: 14px; padding: 16px; }",
    skin: 'oxide-dark',
    content_css: 'dark',
    image_title: true,
    automatic_uploads: false,
    file_picker_types: 'image',
    images_upload_handler: function(blobInfo) {
      return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() {
          fetch('/api/upload', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: reader.result, filename: blobInfo.filename() })
          }).then(r => r.json()).then(d => {
            if (d.url) resolve(d.url); else reject('Upload failed');
          }).catch(reject);
        };
        reader.readAsDataURL(blobInfo.blob());
      });
    },
    setup: function(editor) {
      editor.ui.registry.addButton('gameicons', {
        icon: 'emoji',
        tooltip: '🎮 Ícones de Gamificação',
        onAction: function() { toggleIcons(); }
      });
      editor.on('change keyup', function() {
        isDirty = true;
        clearTimeout(window._pt);
        window._pt = setTimeout(function() {
          document.getElementById('code-editor').value = editor.getContent();
          refreshPreview();
        }, 500);
      });
    },
    init_instance_callback: function(editor) {
      editor.setContent(content || '');
      tinymceReady = true;
    }
  });
}

// ═══════════════════════════════════════════════════════════
// Icons Panel
// ═══════════════════════════════════════════════════════════
function toggleIcons() {
  document.getElementById('icons-panel').classList.toggle('open');
}

function renderIcons() {
  var panel = document.getElementById('icons-grid-container');
  if (!panel) return;
  var html = '';
  iconsData.forEach(cat => {
    html += '<div class="icon-category-title">' + cat.category + '</div><div class="icon-grid">';
    cat.icons.forEach(icon => {
      html += '<div class="icon-item" title="' + icon.name + '" onclick="insertIcon(this)" data-svg="' + encodeURIComponent(icon.svg) + '">' + icon.svg + '</div>';
    });
    html += '</div>';
  });
  panel.innerHTML = html;
}

function filterIcons(query) {
  var panel = document.getElementById('icons-grid-container');
  if (!query) { renderIcons(); return; }
  query = query.toLowerCase();
  var html = '';
  iconsData.forEach(cat => {
    var filtered = cat.icons.filter(i => i.name.toLowerCase().includes(query) || cat.category.toLowerCase().includes(query));
    if (filtered.length === 0) return;
    html += '<div class="icon-category-title">' + cat.category + '</div><div class="icon-grid">';
    filtered.forEach(icon => {
      html += '<div class="icon-item" title="' + icon.name + '" onclick="insertIcon(this)" data-svg="' + encodeURIComponent(icon.svg) + '">' + icon.svg + '</div>';
    });
    html += '</div>';
  });
  panel.innerHTML = html || '<p style="color:#52525B;font-size:13px;padding:12px;">Nenhum ícone encontrado</p>';
}

function insertIcon(el) {
  var svg = decodeURIComponent(el.dataset.svg);
  var color = (designConfig.colors || {}).primary || '#F29F40';
  svg = svg.replace(/currentColor/g, color);
  var imgTag = '<img src="data:image/svg+xml;base64,' + btoa(svg) + '" width="32" height="32" style="display:inline-block;vertical-align:middle;" alt="icon">';

  if (editorMode === 'wysiwyg' && tinymce && tinymce.get('wysiwyg-editor')) {
    tinymce.get('wysiwyg-editor').insertContent(imgTag);
  } else {
    var editor = document.getElementById('code-editor');
    var pos = editor.selectionStart;
    editor.value = editor.value.substring(0, pos) + imgTag + editor.value.substring(editor.selectionEnd);
    editor.selectionStart = editor.selectionEnd = pos + imgTag.length;
    isDirty = true;
    refreshPreview();
  }
  showToast('🎮 Ícone inserido!', 'info');
}

// ═══════════════════════════════════════════════════════════
// Postmark Sync & Status
// ═══════════════════════════════════════════════════════════
async function checkPostmarkStatus() {
  try {
    var res = await fetch('/api/postmark/templates');
    var data = await res.json();
    if (data.connected) {
      postmarkTemplates = data.status || {};
      var synced = Object.values(postmarkTemplates).filter(t => t.postmark).length;
      var total = Object.keys(postmarkTemplates).length;
      document.getElementById('postmark-status').innerHTML = '☁️ Postmark <span class="pm-count">' + synced + '/' + total + '</span> ✅';
      document.getElementById('postmark-status').title = synced + ' de ' + total + ' templates no Postmark';
      renderSidebar();
    } else {
      document.getElementById('postmark-status').textContent = '☁️ Postmark ⚠️';
      document.getElementById('postmark-status').title = 'Não conectado: ' + (data.error || '');
    }
  } catch(e) {
    document.getElementById('postmark-status').textContent = '☁️ Postmark ❌';
  }
}

async function syncCurrentTemplate() {
  if (!currentTemplate) { showToast('Selecione um template primeiro', 'error'); return; }
  var alias = getTemplateAlias(currentTemplate);
  showToast('☁️ Sincronizando ' + alias + '...', 'info');
  try {
    await saveTemplate();
    var res = await fetch('/api/postmark/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: alias })
    });
    var data = await res.json();
    if (data.success) {
      showToast('✅ ' + alias + ' ' + data.action + ' no Postmark!');
      checkPostmarkStatus();
    } else {
      showToast('❌ Erro: ' + (data.error || 'Unknown'), 'error');
    }
  } catch(err) { showToast('❌ ' + err.message, 'error'); }
}

async function syncAllTemplates() {
  var badge = document.getElementById('postmark-status');
  badge.innerHTML = '☁️ <span class="syncing-text">Syncing...</span>';
  badge.classList.add('syncing');
  showToast('☁️ Sincronizando todos os templates...', 'info');

  try {
    var res = await fetch('/api/postmark/sync-all', { method: 'POST' });
    var data = await res.json();
    var results = data.results || [];
    var ok = results.filter(r => r.success).length;
    var fail = results.filter(r => r.error).length;

    var modal = document.getElementById('sync-modal');
    var html = '<div class="sync-summary"><span class="sync-ok">✅ ' + ok + ' sincronizados</span>';
    if (fail > 0) html += '<span class="sync-fail">❌ ' + fail + ' erros</span>';
    html += '</div>';
    results.forEach(r => {
      html += '<div class="modal-item"><span class="status">' + (r.success ? '✅' : '❌') + '</span><span class="name">' + r.alias + '</span><span class="action">' + (r.action || r.error || '') + '</span></div>';
    });
    document.getElementById('sync-results').innerHTML = html;
    modal.classList.add('show');

    badge.classList.remove('syncing');
    checkPostmarkStatus();
    showToast('☁️ Sync completo: ' + ok + ' ✅ / ' + fail + ' ❌');
  } catch(err) {
    badge.textContent = '☁️ Postmark ❌';
    badge.classList.remove('syncing');
    showToast('❌ ' + err.message, 'error');
  }
}

function closeSyncModal() {
  document.getElementById('sync-modal').classList.remove('show');
}

// ═══════════════════════════════════════════════════════════
// Design System
// ═══════════════════════════════════════════════════════════
function loadDesignUI() {
  var colors = designConfig.colors || {};
  for (var key in colors) {
    var input = document.getElementById('clr-' + key);
    var swatch = document.getElementById('sw-' + key);
    if (input) input.value = colors[key];
    if (swatch) swatch.style.background = colors[key];
  }
  var fonts = designConfig.fonts || {};
  if (fonts.heading) document.getElementById('font-heading').value = fonts.heading;
  if (fonts.body) document.getElementById('font-body').value = fonts.body;
  var images = designConfig.images || {};
  if (images.logo) document.getElementById('img-logo').value = images.logo;
  if (images.logoWidth) document.getElementById('img-logoWidth').value = images.logoWidth;
  if (images.logoHeight) document.getElementById('img-logoHeight').value = images.logoHeight;
  var br = designConfig.borderRadius || {};
  if (br.cards) document.getElementById('br-cards').value = br.cards;
  if (br.buttons) document.getElementById('br-buttons').value = br.buttons;
  if (br.badges) document.getElementById('br-badges').value = br.badges;
}

function pickColor(key) { document.getElementById('cp-' + key).click(); }
function colorPicked(key) {
  var val = document.getElementById('cp-' + key).value;
  document.getElementById('clr-' + key).value = val;
  document.getElementById('sw-' + key).style.background = val;
  updateDesign();
}
function updateDesign() {
  var colorKeys = ['primary','secondary','gradientStart','gradientEnd','background','backgroundAlt','textPrimary','textMuted','success','danger'];
  var colors = {};
  colorKeys.forEach(k => {
    var el = document.getElementById('clr-' + k);
    if (el) { colors[k] = el.value; var sw = document.getElementById('sw-' + k); if (sw) sw.style.background = el.value; }
  });
  designConfig = {
    colors: colors,
    fonts: { heading: document.getElementById('font-heading').value, body: document.getElementById('font-body').value },
    images: { logo: document.getElementById('img-logo').value, logoWidth: document.getElementById('img-logoWidth').value, logoHeight: document.getElementById('img-logoHeight').value },
    borderRadius: { cards: document.getElementById('br-cards').value, buttons: document.getElementById('br-buttons').value, badges: document.getElementById('br-badges').value }
  };
  updateDesignPreview();
  if (currentTemplate) refreshPreview();
}

function updateDesignPreview() {
  var c = designConfig.colors || {};
  var f = designConfig.fonts || {};
  var img = designConfig.images || {};
  var br = designConfig.borderRadius || {};
  var card = document.getElementById('design-preview-card');
  card.innerHTML = '<div style="background:linear-gradient(135deg,' + (c.gradientStart||'#6366F1') + ',' + (c.gradientEnd||'#F29F40') + ');padding:28px;text-align:center;">'
    + (img.logo ? '<img src="' + img.logo + '" width="' + (img.logoWidth||180) + '" height="' + (img.logoHeight||40) + '" style="margin-bottom:8px;">' : '')
    + '<p style="font-family:\'' + (f.heading||'Poppins') + '\',sans-serif;color:#FFF;font-weight:700;font-size:16px;margin:0;">Preview do Design</p></div>'
    + '<div style="padding:28px;font-family:\'' + (f.body||'Poppins') + '\',sans-serif;">'
    + '<h2 style="color:' + (c.textPrimary||'#11181C') + ';font-size:20px;margin:0 0 8px;">⭐ Pontos Adicionados!</h2>'
    + '<p style="color:' + (c.textMuted||'#71717A') + ';font-size:14px;margin:0 0 20px;">Olá, <strong style="color:' + (c.textPrimary||'#11181C') + '">Maria Silva</strong>! Você recebeu pontos.</p>'
    + '<div style="display:flex;gap:12px;margin:20px 0;">'
    + '<div style="flex:1;background:' + (c.backgroundAlt||'#F9FAFB') + ';border-radius:' + (br.cards||12) + 'px;padding:16px;text-align:center;"><p style="font-size:24px;font-weight:700;color:' + (c.success||'#22C55E') + ';margin:0;">+500</p><p style="font-size:11px;color:' + (c.textMuted||'#71717A') + ';margin:4px 0 0;">Adicionados</p></div>'
    + '<div style="flex:1;background:' + (c.backgroundAlt||'#F9FAFB') + ';border-radius:' + (br.cards||12) + 'px;padding:16px;text-align:center;"><p style="font-size:24px;font-weight:700;color:' + (c.secondary||'#4F46E5') + ';margin:0;">3.750</p><p style="font-size:11px;color:' + (c.textMuted||'#71717A') + ';margin:4px 0 0;">Saldo Total</p></div>'
    + '<div style="flex:1;background:' + (c.backgroundAlt||'#F9FAFB') + ';border-radius:' + (br.cards||12) + 'px;padding:16px;text-align:center;"><p style="font-size:24px;font-weight:700;color:' + (c.primary||'#F29F40') + ';margin:0;">200</p><p style="font-size:11px;color:' + (c.textMuted||'#71717A') + ';margin:4px 0 0;">Expiram</p></div></div>'
    + '<div style="text-align:center;margin:24px 0;"><a href="#" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,' + (c.secondary||'#4F46E5') + ',' + (c.gradientStart||'#6366F1') + ');color:#FFF;text-decoration:none;border-radius:' + (br.buttons||12) + 'px;font-weight:600;font-size:14px;">🛍️ Usar Meus Pontos</a></div>'
    + '<div style="background:' + (c.backgroundAlt||'#F9FAFB') + ';border-left:4px solid ' + (c.secondary||'#4F46E5') + ';padding:14px 18px;border-radius:0 ' + (br.cards||12) + 'px ' + (br.cards||12) + 'px 0;"><p style="font-size:13px;color:' + (c.textMuted||'#71717A') + ';margin:0;">📋 Motivo: <strong style="color:' + (c.textPrimary||'#11181C') + '">Campanha Dia das Mulheres</strong></p></div>'
    + '<hr style="border:none;border-top:1px solid #F1F5F9;margin:20px 0;">'
    + '<p style="text-align:center;font-size:12px;color:' + (c.textMuted||'#71717A') + ';">TechCorp Brasil · suporte@techcorp.com.br</p></div>';
}

async function saveDesign() {
  try {
    var res = await fetch('/api/design', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(designConfig) });
    if (!res.ok) throw new Error('Save failed');
    showToast('✅ Design System salvo! Aplicado em tempo real a todos os templates.');
    if (currentTemplate) refreshPreview();
  } catch(err) { showToast('❌ Erro: ' + err.message, 'error'); }
}

async function saveDesignAndSync() {
  showToast('🎨☁️ Salvando design e sincronizando com Postmark...', 'info');
  var btn = document.querySelector('.design-sync-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '🔄 Sincronizando...'; }
  try {
    var res = await fetch('/api/design/apply-and-sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ design: designConfig })
    });
    var data = await res.json();
    var results = data.results || [];
    var ok = results.filter(r => r.success).length;
    var fail = results.filter(r => r.error).length;
    showToast('✅ Design salvo + ' + ok + ' templates sincronizados no Postmark!');
    checkPostmarkStatus();
  } catch(err) { showToast('❌ ' + err.message, 'error'); }
  if (btn) { btn.disabled = false; btn.innerHTML = '☁️ Salvar Design + Sync Postmark'; }
}

// ═══════════════════════════════════════════════════════════
// Chicken Corn
// ═══════════════════════════════════════════════════════════
function renderDocs() {
  var mdEl = document.getElementById('md-content');
  if (typeof marked !== 'undefined') mdEl.innerHTML = marked.parse(chickenCornMd);
  else mdEl.innerHTML = '<pre style="white-space:pre-wrap;color:#A1A1AA;">' + chickenCornMd + '</pre>';
}
function scrollDocTo(heading) {
  var docContent = document.getElementById('doc-content');
  var slug = heading.toLowerCase().replace(/[^a-zà-ú0-9]+/g, '-').replace(/(^-|-$)/g, '');
  var headings = docContent.querySelectorAll('h1, h2, h3');
  for (var i = 0; i < headings.length; i++) {
    var hSlug = headings[i].textContent.toLowerCase().replace(/[^a-zà-ú0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (hSlug.indexOf(slug) !== -1) { headings[i].scrollIntoView({ behavior: 'smooth', block: 'start' }); break; }
  }
  document.querySelectorAll('.doc-nav-item').forEach(el => el.classList.remove('active'));
  event.target.classList.add('active');
  return false;
}
function downloadDoc() {
  var blob = new Blob([chickenCornMd], { type: 'text/markdown' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'chicken-corn-integration-guide.md'; a.click();
  showToast('📥 Download iniciado!');
}
function copyPrompt() {
  var s = chickenCornMd.indexOf('```\nEstou integrando'), e = chickenCornMd.indexOf('```\n\n---', s);
  if (s === -1) { copyAllDoc(); return; }
  navigator.clipboard.writeText(chickenCornMd.substring(s + 4, e)).then(() => showToast('📋 Prompt copiado!'));
}
function copyAllDoc() { navigator.clipboard.writeText(chickenCornMd).then(() => showToast('📄 Documentação copiada!')); }

// ═══════════════════════════════════════════════════════════
// Variable Substitution
// ═══════════════════════════════════════════════════════════
function substituteVars(html, data, depth) {
  depth = depth || 0;
  if (depth > 5) return html;
  html = html.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (m, k, inner) => {
    var arr = data[k]; if (!Array.isArray(arr)) return '';
    return arr.map(item => substituteVars(inner, Object.assign({}, data, item), depth+1)).join('');
  });
  html = html.replace(/\{\{#(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (m, k, inner) => getVal(data, k) ? substituteVars(inner, data, depth+1) : '');
  html = html.replace(/\{\{\^(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (m, k, inner) => !getVal(data, k) ? substituteVars(inner, data, depth+1) : '');
  html = html.replace(/\{\{\{\s*(\w+(?:\.\w+)*)\s*\}\}\}/g, (m, k) => { var v = getVal(data, k); return v !== undefined ? String(v) : m; });
  html = html.replace(/\{\{\s*(\w+(?:\.\w+)*)\s*\}\}/g, (m, k) => { var v = getVal(data, k); return v !== undefined ? String(v) : m; });
  return html;
}
function getVal(obj, path) { return path.split('.').reduce((o, k) => o && o[k] !== undefined ? o[k] : undefined, obj); }

// ═══════════════════════════════════════════════════════════
// Utils
// ═══════════════════════════════════════════════════════════
function updateSaveStatus(s) {
  var el = document.getElementById('save-status'); el.className = 'save-status ' + s;
  if (s === 'saving') el.textContent = '⏳ Salvando...'; else if (s === 'saved') el.textContent = '✅ Salvo'; else el.textContent = '';
}
function showToast(msg, type) {
  var t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast show' + (type === 'error' ? ' error' : type === 'info' ? ' info' : '');
  setTimeout(() => t.className = 'toast', 3000);
}

// Keyboard
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (currentPage === 'design') saveDesign(); else saveTemplate(); } });
document.getElementById('code-editor').addEventListener('input', function() {
  isDirty = true; updateSaveStatus(''); clearTimeout(window._pt); window._pt = setTimeout(refreshPreview, 500);
});
document.getElementById('code-editor').addEventListener('keydown', function(e) {
  if (e.key === 'Tab') { e.preventDefault(); var s = e.target.selectionStart, en = e.target.selectionEnd; e.target.value = e.target.value.substring(0,s) + '  ' + e.target.value.substring(en); e.target.selectionStart = e.target.selectionEnd = s + 2; }
});

init();
