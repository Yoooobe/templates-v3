import { db, collection, getDocs, doc, setDoc, getDoc } from './firebase-config.js';

let clients = [];
let currentUser = null;

let templates = window.__TEMPLATES_DATA__ || [];
let layoutHtml = window.__LAYOUT_HTML__ || "<!-- CONTENT -->";
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
const textInputsContainer = document.getElementById('text-inputs-container');
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
  loginScreen.style.display = 'flex';
  appContainer.style.display = 'none';
}

async function showApp() {
  loginScreen.style.display = 'none';
  appContainer.style.display = 'flex';
  companyNameDisplay.textContent = currentUser.companyName;
  
  if (currentUser.pmToken) {
    btnSyncPm.style.display = 'block';
  } else {
    btnSyncPm.style.display = 'none';
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
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// --- Login Logic ---
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const userStr = document.getElementById('login-user').value.trim();
  const passStr = document.getElementById('login-pass').value.trim();

  const user = clients.find(c => c.username === userStr && c.password === passStr);
  if (user) {
    sessionStorage.setItem('v3_current_client', user.username);
    loginError.style.display = 'none';
    login(user);
  } else {
    loginError.textContent = 'Usuário ou senha inválidos. Fale com seu administrador.';
    loginError.style.display = 'block';
  }
});

function login(user) {
  currentUser = user;
  showApp();
}

function logout() {
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
  emptyState.style.display = 'none';
  previewFrame.style.display = 'block';
  editorControls.style.display = 'flex';

  // Load custom HTML if previously saved by this client, otherwise use base HTML
  const alias = getTemplateAlias(tpl);
  const baseHtml = tpl.html;
  const rawHtmlToEdit = currentCustomData[alias] || baseHtml;

  setupEditor(rawHtmlToEdit);
}

// --- Editor Logic ---
function setupEditor(html) {
  // Parse HTML
  const parser = new DOMParser();
  currentDoc = parser.parseFromString(html, 'text/html');
  
  // Find Text Nodes that we can edit
  editableNodes = [];
  textInputsContainer.innerHTML = '';

  // We look for block elements and spans that contain direct text
  const textElements = currentDoc.querySelectorAll('p, h1, h2, h3, h4, span, div, td, a');
  
  let fieldIndex = 0;
  textElements.forEach(el => {
    // Only process elements that contain direct text and don't contain other complex block elements
    // Simplification: Check child nodes for text nodes with actual content
    let hasDirectText = false;
    let textContent = '';
    
    // Check if element has only text and maybe a <br> or <b>
    if (el.children.length === 0 || el.innerText) {
      const text = el.textContent.trim();
      // Skip very short text or pure symbols
      if (text.length > 2 && isValidEditableText(text)) {
        // Build input
        buildTextInput(el, text, fieldIndex);
        fieldIndex++;
      }
    }
  });

  if (fieldIndex === 0) {
    textInputsContainer.innerHTML = '<p class="section-desc">Nenhum texto editável encontrado neste template.</p>';
  }

  // Find images
  setupImageEditor();

  updatePreview();
}

// Avoid editing style tags, script tags, or strings that are 100% variables
function isValidEditableText(text) {
  if (text.startsWith('{{') && text.endsWith('}}') && !text.includes(' ') && text.length < 20) return false;
  return true;
}

function buildTextInput(element, initialText, index) {
  // Create wrapper
  const group = document.createElement('div');
  group.className = 'text-input-group';
  
  const label = document.createElement('label');
  label.textContent = `Bloco de Texto ${index + 1}`;
  
  const textarea = document.createElement('textarea');
  textarea.value = initialText;

  // Check if it contains Handlebars variables
  if (initialText.includes('{{') && initialText.includes('}}')) {
    label.innerHTML += ' <span style="color:#ef4444;" title="Contém variáveis dinâmicas">⚠️</span>';
    textarea.placeholder = "Atenção: Mantenha as chaves {{ }} intactas.";
  }

  textarea.addEventListener('input', (e) => {
    element.textContent = e.target.value; // Simplistic approach: replaces all innerHTML with text
    updatePreview();
  });

  group.appendChild(label);
  group.appendChild(textarea);
  textInputsContainer.appendChild(group);
}

// --- Image Editor ---
const imgInput = document.getElementById('image-upload');
const imgThumbnail = document.getElementById('image-preview-thumbnail');
const btnRemoveImg = document.getElementById('btn-remove-img');
let firstImageEl = null;
let originalImageSrc = '';

function setupImageEditor() {
  // Find the first main image (exclude obvious logos if possible by checking src)
  const images = Array.from(currentDoc.querySelectorAll('img'));
  firstImageEl = images.find(img => !img.src.includes('logo'));
  
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
      imgThumbnail.style.display = 'block';
      btnRemoveImg.style.display = 'inline-block';
    } else if (originalImageSrc) {
      imgThumbnail.style.backgroundImage = `url('${originalImageSrc}')`;
      imgThumbnail.style.display = 'block';
      btnRemoveImg.style.display = 'inline-block';
    }
  } else {
    document.querySelector('.image-upload-box').style.display = 'none';
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
      imgThumbnail.style.display = 'block';
      btnRemoveImg.style.display = 'inline-block';
      updatePreview();
    };
    reader.readAsDataURL(file);
  }
});

window.removeImage = function() {
  if (firstImageEl) {
    firstImageEl.src = 'https://via.placeholder.com/600x200?text=Imagem+Removida';
    imgThumbnail.style.display = 'none';
    btnRemoveImg.style.display = 'none';
    imgInput.value = '';
    updatePreview();
  }
}


// --- Preview Render ---
function updatePreview() {
  if (!currentDoc || !currentTemplate) return;
  
  // Extract body HTML from the parser
  const modifiedHtml = currentDoc.body.innerHTML;
  
  // Wrap in layout
  const finalHtml = layoutHtml.replace('<!-- CONTENT -->', modifiedHtml);

  // Render to iframe
  const doc = previewFrame.contentWindow.document;
  doc.open();
  doc.write(finalHtml);
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
  
  const modifiedHtml = currentDoc.body.innerHTML;
  const alias = getTemplateAlias(currentTemplate);
  
  const btn = document.querySelector('.btn-primary[onclick="saveTemplateToClient()"]');
  if (btn) btn.textContent = '💾 Salvando...';

  currentCustomData[alias] = modifiedHtml;
  await saveClientData();
  
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
