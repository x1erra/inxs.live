// LeaseCreate — Main Application (with all features integrated)
import { provinces, provinceList } from './provinces/index.js';
import { generateLease } from './generator.js';
import { checkClause, renderClauseWarnings } from './clause-checker.js';
import { SignaturePad, createSignatureSection } from './signature-pad.js';
import { renderRightsSidebar } from './rights-sidebar.js';
import { generateTimeline } from './timeline.js';
import { setLanguage, getLanguage, t } from './i18n.js';
import { saveDraft, loadDraft, deleteDraft, getDraftList, renderDraftManager, startAutoSave, hasAutoSave, getAutoSave } from './drafts.js';
import { renderTemplateSelector, getTemplate } from './templates.js';
import { renderImportSection, parseLeaseText, hasLeaseScanData, getLeaseScanData } from './leasescan-import.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let currentProvince = null;
let selectedSchedules = [];
let sigPadLandlord = null;
let sigPadTenant = null;

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  // Core features — must work
  populateProvinceDropdown();
  setupEventListeners();
  showStep(1);

  // Enhanced features — wrapped so a failure in one doesn't break the rest
  const safeInit = (name, fn) => {
    try { fn(); } catch (e) { console.warn(`[LeaseCreate] ${name} init failed:`, e); }
  };

  safeInit('ClauseChecker', setupClauseChecker);
  safeInit('Drafts', setupDrafts);
  safeInit('Templates', setupTemplates);
  safeInit('Import', setupImport);
  safeInit('AutoSave', () => startAutoSave(collectFormData));

  // Check for auto-save recovery
  try {
    if (hasAutoSave()) {
      const banner = document.createElement('div');
      banner.className = 'autosave-banner';
      banner.innerHTML = `
        <span>You have an unsaved draft from a previous session.</span>
        <button class="btn btn-sm btn-primary" id="btn-restore-autosave">Restore</button>
        <button class="btn btn-sm btn-secondary" id="btn-dismiss-autosave">Dismiss</button>
      `;
      $('main .container').prepend(banner);

      $('#btn-restore-autosave')?.addEventListener('click', () => {
        const data = getAutoSave();
        if (data) applyFormData(data);
        banner.remove();
      });
      $('#btn-dismiss-autosave')?.addEventListener('click', () => banner.remove());
    }
  } catch (e) { console.warn('[LeaseCreate] AutoSave recovery failed:', e); }
});


// ── Province Dropdown ──
function populateProvinceDropdown() {
  const select = $('#province');
  provinceList.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.code;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
}


// ── Steps Navigation ──
function showStep(step) {
  $$('.form-step').forEach(s => s.classList.remove('active'));
  $(`.form-step[data-step="${step}"]`).classList.add('active');

  $$('.step-indicator .step').forEach((s, i) => {
    s.classList.toggle('active', i + 1 === step);
    s.classList.toggle('completed', i + 1 < step);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextStep(current) {
  if (!validateStep(current)) return;
  if (current === 1) {
    onProvinceSelected();
  }
  if (current === 4) {
    buildScheduleSelector();
  }
  if (current === 5) {
    generatePreview();
  }
  showStep(current + 1);
}

function prevStep(current) {
  showStep(current - 1);
}


// ── Province Selection ──
function onProvinceSelected() {
  const code = $('#province').value;
  currentProvince = provinces[code];
  if (!currentProvince) return;

  // Show province info banner
  const info = $('#province-info');
  info.innerHTML = `
    <strong>${currentProvince.name}</strong> — ${currentProvince.legislationShort}
    ${currentProvince.standardLeaseRequired ? `<br><span class="info-warning">This province requires the official <strong>${currentProvince.standardLeaseForm}</strong>. This tool generates a supplemental agreement.</span>` : ''}
    <br>Regulator: ${currentProvince.regulator}
    <br>Deposit rules: ${currentProvince.rentRules.maxDeposit}
  `;
  info.hidden = false;

  // Update deposit fields
  updateDepositFields();

  // Update rights sidebar
  updateRightsSidebar();

  // Switch to French if Quebec selected
  if (code === 'QC' && getLanguage() !== 'fr') {
    showLanguagePrompt();
  }
}

function showLanguagePrompt() {
  const existing = $('#lang-prompt');
  if (existing) existing.remove();

  const prompt = document.createElement('div');
  prompt.id = 'lang-prompt';
  prompt.className = 'lang-prompt';
  prompt.innerHTML = `
    <span>Quebec selected — switch to French?</span>
    <button class="btn btn-sm btn-primary" id="btn-lang-fr">Oui, en francais</button>
    <button class="btn btn-sm btn-secondary" id="btn-lang-en">No, keep English</button>
  `;
  $('#province-info').after(prompt);

  $('#btn-lang-fr').addEventListener('click', () => {
    setLanguage('fr');
    const langBtn = $('#lang-switch');
    if (langBtn) langBtn.textContent = 'EN';
    prompt.remove();
  });
  $('#btn-lang-en').addEventListener('click', () => prompt.remove());
}

function updateDepositFields() {
  if (!currentProvince) return;

  const depositSection = $('#deposit-fields');
  let html = '';

  if (currentProvince.code === 'ON') {
    html = `
      <div class="form-group">
        <label for="lastMonthDeposit">Last Month's Rent Deposit ($)</label>
        <input type="number" id="lastMonthDeposit" step="0.01" placeholder="Same as rent amount">
        <span class="field-help">Ontario only allows a last month's rent deposit (RTA s.106)</span>
      </div>
    `;
  } else if (currentProvince.code === 'QC') {
    html = `<p class="form-notice">Security deposits are <strong>prohibited</strong> in Quebec. Only first month's rent may be collected.</p>`;
  } else {
    html = `
      <div class="form-group">
        <label for="securityDeposit">Security Deposit ($)</label>
        <input type="number" id="securityDeposit" step="0.01" placeholder="0.00">
        <span class="field-help">Maximum: ${currentProvince.rentRules.maxDeposit}</span>
      </div>
    `;
    if (currentProvince.code === 'BC') {
      html += `
        <div class="form-group">
          <label for="petDeposit">Pet Damage Deposit ($)</label>
          <input type="number" id="petDeposit" step="0.01" placeholder="0.00">
          <span class="field-help">Max half month's rent, separate from security deposit</span>
        </div>
      `;
    }
  }

  depositSection.innerHTML = html;

  const petNotice = $('#pet-notice');
  if (currentProvince.code === 'ON') {
    petNotice.textContent = 'Note: No-pet clauses are void and unenforceable in Ontario (RTA s.14)';
    petNotice.hidden = false;
  } else {
    petNotice.hidden = true;
  }
}


// ── Feature 5: Rights Sidebar ──
function updateRightsSidebar() {
  if (!currentProvince) return;
  const sidebar = $('#rights-sidebar');
  sidebar.innerHTML = renderRightsSidebar(currentProvince.code);
  sidebar.classList.add('has-content');
}


// ── Feature 1: Clause Checker ──
function setupClauseChecker() {
  const textarea = $('#additionalTerms');
  const resultsEl = $('#clause-check-results');
  let debounce = null;

  textarea.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (!currentProvince) return;
      const warnings = checkClause(textarea.value, currentProvince.code);
      resultsEl.innerHTML = renderClauseWarnings(warnings);
      resultsEl.hidden = warnings.length === 0;
    }, 400);
  });
}


// ── Feature 9: Drafts ──
function setupDrafts() {
  const container = $('#drafts-container');
  container.innerHTML = renderDraftManager();

  // Save button
  container.addEventListener('click', (e) => {
    if (e.target.id === 'btn-save-draft') {
      const nameInput = $('#draftName');
      const name = nameInput.value.trim() || `Draft ${new Date().toLocaleDateString()}`;
      saveDraft(name, collectFormData());
      nameInput.value = '';
      container.innerHTML = renderDraftManager();
      showToast('Draft saved!');
    }

    if (e.target.classList.contains('draft-load')) {
      const name = e.target.dataset.draft;
      const data = loadDraft(name);
      if (data) {
        applyFormData(data);
        showToast(`Loaded: ${name}`);
      }
    }

    if (e.target.classList.contains('draft-delete')) {
      const name = e.target.dataset.draft;
      deleteDraft(name);
      container.innerHTML = renderDraftManager();
      showToast('Draft deleted');
    }
  });
}


// ── Feature 10: Templates ──
function setupTemplates() {
  const container = $('#template-container');
  container.innerHTML = renderTemplateSelector();

  container.addEventListener('click', (e) => {
    const card = e.target.closest('.template-card');
    if (!card) return;

    const template = getTemplate(card.dataset.template);
    if (!template) return;

    applyFormData(template.data);
    showToast(`Template applied: ${template.name}`);
  });
}


// ── Feature 6: LeaseScan Import ──
function setupImport() {
  const container = $('#import-container');
  container.innerHTML = renderImportSection();

  // Import from LeaseScan localStorage
  $('#btn-import-leasescan')?.addEventListener('click', () => {
    const data = getLeaseScanData();
    if (data && data.text) {
      const parsed = parseLeaseText(data.text);
      applyFormData(parsed);
      showToast('Imported from LeaseScan');
    }
  });

  // File upload
  $('#import-file')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseLeaseText(reader.result);
      applyFormData(parsed);
      showToast('Imported from file');
    };
    reader.readAsText(file);
  });

  // Paste text
  $('#btn-import-paste')?.addEventListener('click', () => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Paste Lease Text</h3>
        <p>Paste the text of an existing lease below. We'll extract key fields automatically.</p>
        <textarea id="import-paste-text" rows="12" placeholder="Paste your lease text here..."></textarea>
        <div class="modal-actions">
          <button class="btn btn-primary" id="btn-import-paste-go">Import</button>
          <button class="btn btn-secondary" id="btn-import-paste-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    $('#btn-import-paste-go').addEventListener('click', () => {
      const text = $('#import-paste-text').value;
      if (text) {
        const parsed = parseLeaseText(text);
        applyFormData(parsed);
        showToast('Imported from pasted text');
      }
      modal.remove();
    });

    $('#btn-import-paste-cancel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  });
}


// ── Schedule Selector ──
function buildScheduleSelector() {
  if (!currentProvince) return;
  const container = $('#schedule-list');
  container.innerHTML = '';

  currentProvince.schedules.forEach(s => {
    const div = document.createElement('div');
    div.className = 'schedule-option';
    div.innerHTML = `
      <label>
        <input type="checkbox" value="${s.id}" data-name="${s.name}" data-desc="${s.description}">
        <div class="schedule-info">
          <strong>${s.name}</strong>
          <span>${s.description}</span>
        </div>
      </label>
    `;
    container.appendChild(div);
  });
}


// ── Form Data Collection ──
function collectFormData() {
  const utilities = {};
  $$('.utility-toggle').forEach(el => {
    utilities[el.dataset.utility] = el.checked ? 'included' : 'tenant';
  });

  return {
    province: $('#province').value,
    landlordName: $('#landlordName').value.trim(),
    landlordAddress: $('#landlordAddress').value.trim(),
    landlordPhone: $('#landlordPhone').value.trim(),
    landlordEmail: $('#landlordEmail').value.trim(),
    tenantName: $('#tenantName').value.trim(),
    tenantPhone: $('#tenantPhone').value.trim(),
    tenantEmail: $('#tenantEmail').value.trim(),
    additionalTenants: $('#additionalTenants').value.trim(),
    unitAddress: $('#unitAddress').value.trim(),
    unitNumber: $('#unitNumber').value.trim(),
    city: $('#city').value.trim(),
    postalCode: $('#postalCode').value.trim(),
    unitType: $('#unitType').value,
    isFurnished: $('#isFurnished').checked,
    parkingIncluded: $('#parkingIncluded').checked,
    parkingDetails: $('#parkingDetails')?.value.trim() || '',
    storageIncluded: $('#storageIncluded').checked,
    termType: $('input[name="termType"]:checked')?.value || 'fixed',
    startDate: $('#startDate').value,
    endDate: $('#endDate').value,
    rentAmount: $('#rentAmount').value,
    rentDueDay: $('#rentDueDay').value || '1st',
    paymentMethod: $('#paymentMethod').value,
    lastMonthDeposit: $('#lastMonthDeposit')?.value || '',
    securityDeposit: $('#securityDeposit')?.value || '',
    petDeposit: $('#petDeposit')?.value || '',
    utilities,
    smokingAllowed: $('#smokingAllowed').checked,
    petsAllowed: $('#petsAllowed').checked,
    guestPolicy: $('#guestPolicy').value.trim(),
    noisePolicy: $('#noisePolicy').value.trim(),
    tenantInsuranceRequired: $('#tenantInsurance').checked,
    maintenanceNotes: $('#maintenanceNotes').value.trim(),
    additionalTerms: $('#additionalTerms').value.trim(),
  };
}

// ── Apply form data (from template, draft, or import) ──
function applyFormData(data) {
  if (!data) return;

  if (data.province) {
    $('#province').value = data.province;
    currentProvince = provinces[data.province];
    if (currentProvince) onProvinceSelected();
  }

  const textFields = [
    'landlordName', 'landlordAddress', 'landlordPhone', 'landlordEmail',
    'tenantName', 'tenantPhone', 'tenantEmail', 'additionalTenants',
    'unitAddress', 'unitNumber', 'city', 'postalCode',
    'startDate', 'endDate', 'rentAmount',
    'guestPolicy', 'noisePolicy', 'maintenanceNotes', 'additionalTerms',
    'parkingDetails',
  ];
  textFields.forEach(field => {
    const el = $(`#${field}`);
    if (el && data[field] !== undefined) el.value = data[field];
  });

  const selectFields = ['unitType', 'rentDueDay', 'paymentMethod'];
  selectFields.forEach(field => {
    const el = $(`#${field}`);
    if (el && data[field]) el.value = data[field];
  });

  const checkFields = ['isFurnished', 'parkingIncluded', 'storageIncluded', 'smokingAllowed', 'petsAllowed'];
  checkFields.forEach(field => {
    const el = $(`#${field}`);
    if (el && data[field] !== undefined) el.checked = !!data[field];
  });

  if (data.tenantInsuranceRequired !== undefined) {
    $('#tenantInsurance').checked = data.tenantInsuranceRequired;
  }

  if (data.termType) {
    const radio = $(`input[name="termType"][value="${data.termType}"]`);
    if (radio) {
      radio.checked = true;
      $('#endDateGroup').style.display = data.termType === 'fixed' ? '' : 'none';
    }
  }

  if (data.utilities) {
    $$('.utility-toggle').forEach(el => {
      const key = el.dataset.utility;
      if (data.utilities[key] !== undefined) {
        el.checked = data.utilities[key] === 'included';
      }
    });
  }

  // Deposit fields (may need province selected first)
  setTimeout(() => {
    if (data.lastMonthDeposit) {
      const el = $('#lastMonthDeposit');
      if (el) el.value = data.lastMonthDeposit;
    }
    if (data.securityDeposit) {
      const el = $('#securityDeposit');
      if (el) el.value = data.securityDeposit;
    }
    if (data.petDeposit) {
      const el = $('#petDeposit');
      if (el) el.value = data.petDeposit;
    }
  }, 100);
}


// ── Preview ──
function generatePreview() {
  selectedSchedules = [];
  $$('#schedule-list input[type="checkbox"]:checked').forEach(cb => {
    const pSchedule = currentProvince.schedules.find(s => s.id === cb.value);
    if (pSchedule) selectedSchedules.push(pSchedule);
  });

  const formData = collectFormData();
  const leaseHtml = generateLease(formData, selectedSchedules);

  // Feature 7: Timeline
  const timelineHtml = currentProvince ? generateTimeline(formData, currentProvince) : '';

  // Feature 3: Signature section
  const sigHtml = createSignatureSection();

  $('#lease-preview').innerHTML = timelineHtml + leaseHtml + sigHtml;

  // Init signature pads
  setTimeout(() => {
    const landlordCanvas = $('#sig-landlord');
    const tenantCanvas = $('#sig-tenant');
    if (landlordCanvas) sigPadLandlord = new SignaturePad(landlordCanvas);
    if (tenantCanvas) sigPadTenant = new SignaturePad(tenantCanvas);

    // Clear buttons
    $$('[data-clear]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.clear;
        if (id === 'sig-landlord' && sigPadLandlord) sigPadLandlord.clear();
        if (id === 'sig-tenant' && sigPadTenant) sigPadTenant.clear();
      });
    });
  }, 100);
}


// ── PDF Export ──
async function exportPDF() {
  const preview = $('#lease-preview');

  // Replace canvas signatures with images for print
  let printContent = preview.innerHTML;

  if (sigPadLandlord && !sigPadLandlord.isEmpty()) {
    const img = sigPadLandlord.toDataURL();
    printContent = printContent.replace(
      /<canvas id="sig-landlord"[^>]*><\/canvas>/,
      `<img src="${img}" style="width:100%;height:120px;object-fit:contain;" alt="Landlord Signature">`
    );
  }
  if (sigPadTenant && !sigPadTenant.isEmpty()) {
    const img = sigPadTenant.toDataURL();
    printContent = printContent.replace(
      /<canvas id="sig-tenant"[^>]*><\/canvas>/,
      `<img src="${img}" style="width:100%;height:120px;object-fit:contain;" alt="Tenant Signature">`
    );
  }

  // Also embed typed signatures
  const typedLandlord = $('#sig-landlord-typed')?.value.trim();
  const typedTenant = $('#sig-tenant-typed')?.value.trim();
  if (typedLandlord && (!sigPadLandlord || sigPadLandlord.isEmpty())) {
    printContent = printContent.replace(
      /<canvas id="sig-landlord"[^>]*><\/canvas>/,
      `<div style="font-family:'Brush Script MT',cursive;font-size:28px;padding:20px 0;border-bottom:1px solid #333;">${esc(typedLandlord)}</div>`
    );
  }
  if (typedTenant && (!sigPadTenant || sigPadTenant.isEmpty())) {
    printContent = printContent.replace(
      /<canvas id="sig-tenant"[^>]*><\/canvas>/,
      `<div style="font-family:'Brush Script MT',cursive;font-size:28px;padding:20px 0;border-bottom:1px solid #333;">${esc(typedTenant)}</div>`
    );
  }

  // Remove interactive elements from print
  printContent = printContent.replace(/<button[^>]*>.*?<\/button>/gs, '');
  printContent = printContent.replace(/<input[^>]*class="sig-typed-input"[^>]*>/g, '');
  printContent = printContent.replace(/<div class="sig-pad-actions">[\s\S]*?<\/div>/g, '');
  printContent = printContent.replace(/<p class="sig-instructions">[\s\S]*?<\/p>/g, '');

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Residential Tenancy Agreement</title>
      <style>${getPrintStyles()}</style>
    </head>
    <body>${printContent}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.onload = () => { printWindow.print(); };
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


function getPrintStyles() {
  return `
    @page { margin: 20mm; size: letter; }
    body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; max-width: 100%; }
    h1 { font-size: 18pt; text-align: center; margin-bottom: 4px; letter-spacing: 2px; }
    h2 { font-size: 13pt; border-bottom: 2px solid #1a4fd8; padding-bottom: 4px; margin: 24px 0 12px; color: #1a4fd8; }
    h3 { font-size: 11pt; margin: 16px 0 8px; }
    .lease-header { text-align: center; margin-bottom: 30px; border-bottom: 3px double #333; padding-bottom: 20px; }
    .lease-subtitle { color: #555; font-style: italic; }
    .lease-legislation { font-size: 9pt; color: #666; }
    .lease-note { background: #fff3cd; padding: 8px 12px; border-left: 4px solid #ffc107; margin: 10px 0; font-size: 9pt; }
    .lease-date { margin-top: 10px; }
    .lease-section { margin-bottom: 20px; }
    .lease-field-group { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .lease-field label { font-weight: bold; font-size: 9pt; text-transform: uppercase; color: #555; }
    .full-width { grid-column: 1 / -1; }
    .lease-info { font-size: 9pt; color: #555; font-style: italic; margin-top: 4px; }
    .lease-warning { background: #fee; border-left: 4px solid #dc2626; padding: 8px 12px; font-size: 9pt; }
    .lease-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
    .lease-table th, .lease-table td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
    .lease-table th { background: #f0f0f0; font-weight: bold; }
    .inspection-table td { min-height: 24px; }
    .room-cell { font-weight: bold; background: #f8f8f8; vertical-align: top; }
    .condition-cell, .notes-cell { min-width: 80px; }
    .lease-legal { background: #f8f9fa; padding: 16px; border: 1px solid #ddd; border-radius: 4px; }
    .lease-additional { white-space: pre-wrap; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
    .sig-block { text-align: center; }
    .sig-line { border-bottom: 1px solid #333; margin-bottom: 8px; height: 50px; }
    .sig-name { font-weight: bold; }
    .sig-date { font-size: 9pt; color: #555; }
    .blank-line { border-bottom: 1px solid #ccc; height: 28px; margin-bottom: 4px; }
    .lease-schedule { border-top: 3px solid #1a4fd8; padding-top: 20px; }
    ul { margin: 8px 0; padding-left: 24px; }
    li { margin-bottom: 4px; }
    .form-notice { background: #e8f5e9; padding: 10px; border-left: 4px solid #4caf50; }
    .timeline { margin-bottom: 30px; page-break-after: always; }
    .timeline-title { font-size: 14pt; margin-bottom: 16px; color: #1a4fd8; }
    .timeline-event { display: flex; gap: 16px; margin-bottom: 16px; padding-left: 20px; border-left: 3px solid #ddd; }
    .timeline-primary { border-left-color: #1a4fd8; }
    .timeline-warning { border-left-color: #d97706; }
    .timeline-danger { border-left-color: #dc2626; }
    .timeline-info { border-left-color: #2563eb; }
    .timeline-date { font-weight: bold; font-size: 10pt; }
    .timeline-label { font-weight: bold; }
    .timeline-desc { font-size: 9pt; color: #555; }
    .signature-section { margin-top: 40px; border-top: 2px solid #1a4fd8; padding-top: 20px; }
    .sig-pads { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
    .sig-pad-group label { font-weight: bold; display: block; margin-bottom: 8px; }
  `;
}


// ── Validation ──
function validateStep(step) {
  let valid = true;
  const stepEl = $(`.form-step[data-step="${step}"]`);
  const required = stepEl.querySelectorAll('[required]');

  required.forEach(input => {
    const group = input.closest('.form-group');
    if (!input.value.trim()) {
      if (group) group.classList.add('error');
      valid = false;
    } else {
      if (group) group.classList.remove('error');
    }
  });

  if (!valid) {
    const firstError = stepEl.querySelector('.form-group.error');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return valid;
}


// ── Toast Notifications ──
function showToast(message) {
  const existing = $('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}


// ── Event Listeners ──
function setupEventListeners() {
  // Next/Prev buttons
  $$('.btn-next').forEach(btn => {
    btn.addEventListener('click', () => {
      const step = parseInt(btn.closest('.form-step').dataset.step);
      nextStep(step);
    });
  });

  $$('.btn-prev').forEach(btn => {
    btn.addEventListener('click', () => {
      const step = parseInt(btn.closest('.form-step').dataset.step);
      prevStep(step);
    });
  });

  // Province change
  $('#province').addEventListener('change', () => {
    const code = $('#province').value;
    if (code) {
      currentProvince = provinces[code];
      onProvinceSelected();
    }
  });

  // Term type toggle
  $$('input[name="termType"]').forEach(radio => {
    radio.addEventListener('change', () => {
      $('#endDateGroup').style.display = radio.value === 'fixed' ? '' : 'none';
    });
  });

  // Export PDF
  $('#btn-export').addEventListener('click', exportPDF);

  // Edit button
  $('#btn-edit').addEventListener('click', () => showStep(1));

  // Regenerate preview
  $('#btn-regenerate').addEventListener('click', () => generatePreview());

  // Rights sidebar toggle
  $('#rights-toggle')?.addEventListener('click', () => {
    const sidebar = $('#rights-sidebar');
    sidebar.classList.toggle('open');
  });

  // Language switcher — button label shows what you'll switch TO
  $('#lang-switch')?.addEventListener('click', () => {
    const newLang = getLanguage() === 'en' ? 'fr' : 'en';
    setLanguage(newLang);
    // After switching, button shows the OTHER language (what you'd switch to next)
    $('#lang-switch').textContent = newLang === 'fr' ? 'EN' : 'FR';
  });
}
