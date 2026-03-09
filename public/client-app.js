import { db, collection, getDocs, doc, setDoc, getDoc } from './firebase-config.js';

let clients = [];
let currentUser = null;

let templates = window.__TEMPLATES_DATA__ || [];
let layoutHtml = (window.__LAYOUT_HTML__ || "<!-- CONTENT -->").replace('{{{@content}}}', '<!-- CONTENT -->');
let currentTemplate = null;
let currentCustomData = {}; // Stores modifications per template: { 'v3-welcome': '<html>...', ... }

let currentDoc = null; // DOMParser document of the current template
let editableNodes = []; // Array of { node, initialText, originalHtml }

// --- DOM Elements ---
const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const templateList = document.getElementById('template-list');
const previewFrame = document.getElementById('preview-frame');
const previewTitle = document.getElementById('preview-title');
const emptyState = document.getElementById('empty-state');
const editorControls = document.getElementById('editor-controls');
const companyNameDisplay = document.getElementById('company-name-display');
const btnSyncPm = document.getElementById('btn-sync-pm');

// --- Initialization ---
async function init() {
  try {
    const querySnapshot = await getDocs(collection(db, "clients"));
    querySnapshot.forEach((document) => {
      clients.push({ id: document.id, ...document.data() });
    });
  } catch (error) {
    console.error("Erro ao carregar clientes", error);
    showToast("Erro ao conectar com o banco de dados.");
  }

  const sessionUser = sessionStorage.getItem('v3_current_client');
  if (sessionUser) {
    const user = clients.find(c => c.username === sessionUser);
    if (user) {
      login(user); // login then calls showApp which is async
      return;
    }
  }
  showLogin();
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  appContainer.classList.add('hidden');
}

async function showApp() {
  loginScreen.classList.add('hidden');
  appContainer.classList.remove('hidden');
  companyNameDisplay.textContent = currentUser.companyName;
  
  if (currentUser.pmToken) {
    btnSyncPm.classList.remove('hidden');
  } else {
    btnSyncPm.classList.add('hidden');
  }

  const defaultHtml = document.getElementById('template-list').innerHTML;
  document.getElementById('template-list').innerHTML = '<div style="padding: 20px; color: #64748b;">⏳ Carregando templates salvos...</div>';

  await loadClientData();
  renderTemplateList();
}

async function loadClientData() {
  try {
    const docRef = doc(db, "client_templates", currentUser.id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      currentCustomData = docSnap.data();
    } else {
      currentCustomData = {};
    }
  } catch (error) {
    console.error("Erro ao carregar templates salvos", error);
    currentCustomData = {};
  }
}

async function saveClientData() {
  try {
    await setDoc(doc(db, "client_templates", currentUser.id), currentCustomData);
    showToast('Alterações salvas com sucesso no banco de dados!');
  } catch (error) {
    console.error("Erro ao salvar templates", error);
    showToast('Erro ao salvar as edições.');
  }
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => { toast.classList.add('hidden'); }, 3000);
}

// --- Login Logic ---
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const userStr = document.getElementById('login-user').value.trim();
  const passStr = document.getElementById('login-pass').value.trim();

  const user = clients.find(c => c.username === userStr && c.password === passStr);
  if (user) {
    sessionStorage.setItem('v3_current_client', user.username);
    loginError.classList.add('hidden');
    login(user);
  } else {
    loginError.textContent = 'Usuário ou senha inválidos. Fale com seu administrador.';
    loginError.classList.remove('hidden');
  }
});

function login(user) {
  currentUser = user;
  showApp();
}

window.logout = function() {
  sessionStorage.removeItem('v3_current_client');
  currentUser = null;
  currentTemplate = null;
  currentDoc = null;
  showLogin();
}

// --- Sidebar Logic ---
function renderTemplateList() {
  templateList.innerHTML = '';
  // Exclude layouts and components if any
  const visibleTemplates = templates.filter(t => t.category !== 'layout');

  visibleTemplates.forEach(tpl => {
    const div = document.createElement('div');
    div.className = 'template-item';
    div.innerHTML = `
      <span class="template-icon">${getCategoryIcon(tpl.category)}</span>
      <span class="template-name">${tpl.name}</span>
    `;
    div.addEventListener('click', () => selectTemplate(tpl, div));
    templateList.appendChild(div);
  });
}

function getCategoryIcon(cat) {
  if (cat === 'member') return '👤';
  if (cat === 'manager') return '👔';
  if (cat === 'admin') return '⚙️';
  return '📄';
}

function getTemplateAlias(tpl) {
  let p = tpl.category === 'member' ? 'v3-member-' : tpl.category === 'manager' ? 'v3-manager-' : 'v3-';
  return p + tpl.name.replace(/_/g, '-');
}

function selectTemplate(tpl, element) {
  document.querySelectorAll('.template-item').forEach(el => el.classList.remove('active'));
  if (element) element.classList.add('active');

  currentTemplate = tpl;
  previewTitle.textContent = tpl.name;
  emptyState.classList.add('hidden');
  previewFrame.classList.remove('hidden');
  editorControls.classList.remove('hidden');

  // Load custom HTML if previously saved by this client, otherwise use base HTML
  const alias = getTemplateAlias(tpl);
  const baseHtml = tpl.content; // It's .content, not .html
  const rawHtmlToEdit = currentCustomData[alias] || baseHtml;

  setupEditor(rawHtmlToEdit);
}

// --- Editor Logic ---
function setupEditor(html) {
  // Parse HTML
  const parser = new DOMParser();
  currentDoc = parser.parseFromString(html, 'text/html');

  function findEditableBlocks(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'PATH'].includes(node.tagName)) return;

    const inlineTags = ['A', 'B', 'STRONG', 'I', 'EM', 'SPAN', 'BR', 'IMG', 'FONT', 'U', 'S', 'STRIKE', 'SUP', 'SUB'];
    let hasBlockChild = false;
    for (let i = 0; i < node.children.length; i++) {
        if (!inlineTags.includes(node.children[i].tagName)) {
            hasBlockChild = true;
            break;
        }
    }

    if (hasBlockChild) {
        for (let i = 0; i < node.children.length; i++) {
            findEditableBlocks(node.children[i]);
        }
    } else {
        let pureText = node.textContent.trim();
        if (pureText.length > 0) {
            if (isValidEditableText(pureText)) {
                const allowedTags = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'SPAN', 'DIV'];
                // Never make logic-heavy transactional tables or links directly editable
                if (allowedTags.includes(node.tagName)) {
                   makeNodeEditable(node);
                } else if (node.tagName !== 'STYLE' && node.tagName !== 'SCRIPT') {
                   node.classList.add('v3-not-editable');
                }
            } else if (node.tagName !== 'STYLE' && node.tagName !== 'SCRIPT') {
               node.classList.add('v3-not-editable');
            }
        }
    }
  }

  findEditableBlocks(currentDoc.body);

  // Find images
  setupImageEditor();

  updatePreview();
}

// Avoid editing style tags, script tags, or strings that are 100% variables
function isValidEditableText(text) {
  if (text.includes('{{#') || text.includes('{{/') || text.includes('{{^')) return false; // Contains logic blocks = do not edit

  if (text.includes('{{') && text.includes('}}')) return true; // Allow variable blocks

  const withoutVars = text.replace(/{{[^}]+}}/g, '').trim();
  const alphanumeric = withoutVars.replace(/[^a-zA-Z0-9]/g, '');
  if (alphanumeric.length < 3 && !text.includes('{{')) return false;
  
  if (text.includes('background-color') || text.includes('font-weight') || text.includes('font-family')) return false;
  return true;
}

function makeNodeEditable(node) {
  // Use text node replacement to prevent HTML attribute corruption
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  
  textNodes.forEach(textNode => {
    if (textNode.nodeValue.includes('{{')) {
      const matchRegex = /({{\s*[^}]+\s*}})/g;
      const fragments = textNode.nodeValue.split(matchRegex);
      
      if (fragments.length > 1) {
        const parent = textNode.parentNode;
        fragments.forEach(frag => {
          if (frag.match(/^{{\s*([^}]+)\s*}}$/)) {
            let varName = frag.replace(/[{}]/g, '').trim().split('.').pop();
            let evaluatedText = '';
            try {
              const template = Handlebars.compile(frag);
              evaluatedText = template(window.__SAMPLE_DATA__);
            } catch (e) {
              evaluatedText = varName;
            }
            if (!evaluatedText || evaluatedText.trim() === '') {
               evaluatedText = `[ ${varName} ]`;
            }
            
            const span = document.createElement('span');
            span.setAttribute('contenteditable', 'false');
            span.className = 'readonly-variable';
            // Escaping the Handlebars brackets so they survive Handlebars layout compilation!
            span.setAttribute('data-original-var', `\\${frag}`); 
            span.style.cssText = "user-select:none;pointer-events:none;display:inline-block;vertical-align:baseline;background-color:#e2e8f0;color:#64748b;padding:0px 4px;border-radius:4px;font-family:sans-serif;font-size:12px;font-weight:600;margin:0 4px;opacity:0.6;";
            span.textContent = evaluatedText;
            parent.insertBefore(span, textNode);
          } else if (frag.length > 0) {
            parent.insertBefore(document.createTextNode(frag), textNode);
          }
        });
        parent.removeChild(textNode);
      }
    }
  });

  node.setAttribute('contenteditable', 'true');
  node.classList.add('v3-editable-node');
}

// --- Image Editor ---
const imgInput = document.getElementById('image-upload');
const imgThumbnail = document.getElementById('image-preview-thumbnail');
const btnRemoveImg = document.getElementById('btn-remove-img');
let firstImageEl = null;
let originalImageSrc = '';

function setupImageEditor() {
  // Target the logo explicitly, or fallback to the first image in the document
  const images = Array.from(currentDoc.querySelectorAll('img'));
  firstImageEl = images.find(img => img.src && img.src.includes('logo'));
  
  if (!firstImageEl && images.length > 0) {
    firstImageEl = images[0]; // Fallback to first
  }

  imgInput.value = '';
  
  if (firstImageEl) {
    originalImageSrc = firstImageEl.src;
    document.querySelector('.image-upload-box').style.display = 'block';
    
    if (originalImageSrc && !originalImageSrc.startsWith('http')) {
      // It might be a base64 or placeholder
      imgThumbnail.style.backgroundImage = `url('${originalImageSrc}')`;
      imgThumbnail.classList.remove('hidden');
      btnRemoveImg.classList.remove('hidden');
    } else if (originalImageSrc) {
      imgThumbnail.style.backgroundImage = `url('${originalImageSrc}')`;
      imgThumbnail.classList.remove('hidden');
      btnRemoveImg.classList.remove('hidden');
    }
  } else {
    document.querySelector('.image-upload-box').classList.add('hidden');
  }
}

imgInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file && firstImageEl) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      firstImageEl.src = base64;
      imgThumbnail.style.backgroundImage = `url('${base64}')`;
      imgThumbnail.classList.remove('hidden');
      btnRemoveImg.classList.remove('hidden');
      updatePreview();
    };
    reader.readAsDataURL(file);
  }
});

window.removeImage = function() {
  if (firstImageEl) {
    firstImageEl.src = 'https://via.placeholder.com/600x200?text=Imagem+Removida';
    imgThumbnail.classList.add('hidden');
    btnRemoveImg.classList.add('hidden');
    imgInput.value = '';
    updatePreview();
  }
}


// --- Preview Render ---
function updatePreview() {
  if (!currentDoc || !currentTemplate) return;
  
  // Extract body HTML from the parser
  const modifiedHtml = currentDoc.body.innerHTML;
  
  // Wrap in layout and identifiable div
  const wrappedContent = `<div id="v3-template-content">${modifiedHtml}</div>`;
  const plainHtml = layoutHtml.replace('<!-- CONTENT -->', wrappedContent);

  // Compile the ENTIRE layout + content through Handlebars so the layout header/footer look real
  let finalHtml = plainHtml;
  try {
     const template = Handlebars.compile(plainHtml);
     finalHtml = template(window.__SAMPLE_DATA__);
  } catch (e) {
     console.error("Handlebars compilation failed", e);
  }

  // Render to iframe
  const doc = previewFrame.contentWindow.document;
  doc.open();
  doc.write(finalHtml);
  
  // Inject editor styles into iframe
  const style = doc.createElement('style');
  style.innerHTML = `
    .v3-not-editable {
      opacity: 0.5 !important;
      filter: grayscale(80%);
      transition: opacity 0.2s;
    }
    .v3-editable-node {
      outline: 2px dashed rgba(79, 70, 229, 0.4);
      background-color: rgba(79, 70, 229, 0.05);
      border-radius: 4px;
      transition: all 0.2s;
      position: relative;
    }
    .v3-editable-node:hover {
      outline: 2px solid #4f46e5;
      background-color: rgba(79, 70, 229, 0.12);
      cursor: text;
    }
    .v3-editable-node:focus {
      outline: 2px solid #4f46e5;
      background-color: #fff;
    }
  `;
  doc.head.appendChild(style);
  
  doc.close();
}

window.setDevice = function(mode) {
  document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
  event.currentTarget.classList.add('active');
  if (mode === 'mobile') {
    previewFrame.classList.add('mobile');
  } else {
    previewFrame.classList.remove('mobile');
  }
}

// --- Save & Sync ---
window.saveTemplateToClient = async function() {
  if (!currentDoc || !currentTemplate) return;
  
  const btn = document.querySelector('.btn-primary[onclick="saveTemplateToClient()"]');
  if (btn) btn.textContent = '💾 Salvando...';

  // Read from the iframe directly to capture inline edits
  const doc = previewFrame.contentWindow.document;
  const contentWrapper = doc.getElementById('v3-template-content');
  
  if (!contentWrapper) {
    if (btn) btn.textContent = '💾 Salvar Alterações';
    return;
  }
  
  // Clone to strip editor attributes
  const cloned = contentWrapper.cloneNode(true);
  
  // Remove contenteditable
  const editables = cloned.querySelectorAll('.v3-editable-node');
  editables.forEach(el => {
     el.removeAttribute('contenteditable');
     el.classList.remove('v3-editable-node');
     if (el.classList.length === 0) el.removeAttribute('class');
  });
  
  // Restore variables
  const vars = cloned.querySelectorAll('.readonly-variable');
  vars.forEach(v => {
     const originalVar = v.getAttribute('data-original-var');
     if (originalVar) {
       v.replaceWith(originalVar);
     } else {
       v.replaceWith(v.textContent);
     }
  });

  const modifiedHtml = cloned.innerHTML;
  const alias = getTemplateAlias(currentTemplate);

  currentCustomData[alias] = modifiedHtml;
  await saveClientData();
  
  // Sync changes back to currentDoc in case they keep editing without reloading
  currentDoc.body.innerHTML = modifiedHtml;
  setupEditor(modifiedHtml); // Re-apply editable attributes for further editing
  
  if (btn) btn.textContent = '💾 Salvar Alterações';
}

window.syncToPostmark = async function() {
  if (!currentUser.pmToken) {
    alert("Nenhum token do Postmark configurado para sua conta.");
    return;
  }
  
  const btn = document.getElementById('btn-sync-pm');
  btn.textContent = '☁️ Enviando...';
  btn.disabled = true;

  try {
    const pmTemplates = await getPostmarkTemplates(currentUser.pmToken);
    
    // Save locally first
    await window.saveTemplateToClient();
    
    const alias = getTemplateAlias(currentTemplate);
    const finalHtml = layoutHtml.replace('<!-- CONTENT -->', currentCustomData[alias]);
    const name = `[${currentUser.companyName}] ${currentTemplate.name}`;
    const subject = "Mensagem da plataforma"; // default subject
    
    await pushTemplateToPostmark(currentUser.pmToken, alias, name, subject, finalHtml, pmTemplates);
    
    showToast('Template sincronizado com o Postmark!');
  } catch(e) {
    alert("Erro na sincronização: " + e.message);
  } finally {
    btn.textContent = '☁️ Enviar Postmark';
    btn.disabled = false;
  }
}

async function getPostmarkTemplates(token) {
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const url = isLocal 
    ? "https://api.postmarkapp.com/templates"
    : "https://corsproxy.io/?" + encodeURIComponent("https://api.postmarkapp.com/templates");

  const r = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "X-Postmark-Server-Token": token
    }
  });
  if (!r.ok) throw new Error("Falha ao buscar templates do Postmark");
  const data = await r.json();
  const map = {};
  data.Templates.forEach(t => map[t.Alias] = t.TemplateId);
  return map;
}

async function pushTemplateToPostmark(token, alias, name, subject, htmlBody, pmTemplatesMap) {
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const existingId = pmTemplatesMap[alias];
  
  let method = existingId ? "PUT" : "POST";
  let endpoint = existingId ? `/templates/${existingId}` : "/templates";
  
  const url = isLocal 
    ? "https://api.postmarkapp.com" + endpoint
    : "https://corsproxy.io/?" + encodeURIComponent("https://api.postmarkapp.com" + endpoint);

  const body = {
    Name: name,
    Alias: alias,
    Subject: subject,
    HtmlBody: htmlBody,
    TemplateType: "Standard"
  };

  const r = await fetch(url, {
    method,
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token
    },
    body: JSON.stringify(body)
  });

  const resData = await r.json();
  if (!r.ok) throw new Error(resData.Message || "Erro ao salvar no Postmark");
  return resData;
}

// Boot
init();
