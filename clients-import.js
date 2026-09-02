/**
 * CLIENTS IMPORT — BIO N TRUFFE (v1)
 * Module d'import de base clients (CSV/Excel)
 * IIFE self-contained, styles `imp-`, API `ClientsImport.mount()`
 */

const ClientsImport = (() => {
  let hostEl = null;
  let db = null;
  let currentUser = null;
  
  // Champs attendus (configurable)
  const REQUIRED_FIELDS = ['email', 'nom'];
  const OPTIONAL_FIELDS = ['adresse', 'telephone', 'contact', 'siret', 'ville', 'codepostal'];
  const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
  
  // Parser CSV
  const parseCSV = (text) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('Fichier CSV vide ou invalide');
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row = {};
      headers.forEach((header, idx) => {
        if (ALL_FIELDS.includes(header) || header === '') {
          row[header || `col_${idx}`] = values[idx] || '';
        }
      });
      if (Object.keys(row).length > 0) rows.push(row);
    }
    
    return { headers, rows };
  };
  
  // Parser Excel (utilise SheetJS via CDN si disponible)
  const parseExcel = (arrayBuffer) => {
    if (typeof XLSX === 'undefined') {
      throw new Error('Excel parsing requires SheetJS library');
    }
    
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      blankrows: false
    });
    
    if (rows.length < 2) throw new Error('Fichier Excel vide ou invalide');
    
    const headers = (rows[0] || []).map(h => String(h).trim().toLowerCase());
    const data = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = {};
      headers.forEach((header, idx) => {
        if (ALL_FIELDS.includes(header) || header === '') {
          row[header || `col_${idx}`] = rows[i][idx] || '';
        }
      });
      if (Object.keys(row).length > 0) data.push(row);
    }
    
    return { headers, rows: data };
  };
  
  // Valider les données
  const validateRows = (rows) => {
    const errors = [];
    const valid = [];
    
    rows.forEach((row, idx) => {
      const rowErrors = [];
      
      // Vérifier champs requis
      REQUIRED_FIELDS.forEach(field => {
        if (!row[field] || !String(row[field]).trim()) {
          rowErrors.push(`${field} manquant`);
        }
      });
      
      // Valider email
      if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
        rowErrors.push('Email invalide');
      }
      
      if (rowErrors.length > 0) {
        errors.push({ row: idx + 2, line: row, errors: rowErrors });
      } else {
        valid.push({
          email: row.email.toLowerCase().trim(),
          nom: row.nom.trim(),
          adresse: row.adresse || '',
          telephone: row.telephone || '',
          contact: row.contact || '',
          siret: row.siret || '',
          ville: row.ville || '',
          codepostal: row.codepostal || '',
          importedAt: firebase.firestore.Timestamp.now(),
          importedBy: currentUser.email
        });
      }
    });
    
    return { valid, errors };
  };
  
  // Importer dans Firestore
  const importToFirestore = async (clients) => {
    if (!clients.length) return { success: 0, failed: 0 };
    
    const results = { success: 0, failed: 0, duplicates: 0 };
    
    for (const client of clients) {
      try {
        const existingDoc = await db.collection('clients_biontruffle')
          .doc(client.email)
          .get();
        
        if (existingDoc.exists) {
          results.duplicates++;
          continue;
        }
        
        await db.collection('clients_biontruffle').doc(client.email).set(client);
        results.success++;
      } catch (e) {
        console.error(`Erreur import ${client.email}:`, e);
        results.failed++;
      }
    }
    
    return results;
  };
  
  // Afficher le formulaire
  const renderForm = () => {
    const form = document.createElement('form');
    form.className = 'imp-form';
    form.id = 'clients-import-form';
    
    form.innerHTML = `
      <div class="imp-fieldset">
        <legend class="imp-legend">📥 Importer une base de clients</legend>
        
        <div class="imp-info">
          <p class="imp-info-title">Format attendu:</p>
          <p class="imp-info-text">
            Fichier CSV ou Excel avec colonnes:<br>
            <strong>Requis:</strong> email, nom<br>
            <strong>Optionnels:</strong> adresse, telephone, contact, siret, ville, codepostal
          </p>
        </div>
        
        <div class="imp-upload-zone" id="imp-upload-zone">
          <div class="imp-upload-icon">📁</div>
          <div class="imp-upload-text">
            <div class="imp-upload-main">Cliquez ou déposez votre fichier</div>
            <div class="imp-upload-sub">CSV ou Excel (.xlsx, .xls)</div>
          </div>
          <input type="file" id="imp-file-input" class="imp-file-input" accept=".csv,.xlsx,.xls" style="display:none;" />
        </div>
        
        <div class="imp-actions">
          <button type="submit" class="imp-btn imp-btn-primary" disabled id="imp-submit">✅ Importer</button>
          <button type="reset" class="imp-btn imp-btn-secondary">↻ Annuler</button>
        </div>
      </div>
    `;
    
    return form;
  };
  
  // Traiter le fichier
  const handleFileSelect = async (file, form) => {
    if (!file) return;
    
    const fileInput = form.querySelector('#imp-file-input');
    const submitBtn = form.querySelector('#imp-submit');
    let parsed = null;
    
    try {
      const isCSV = file.name.endsWith('.csv');
      const isExcel = /\.(xlsx|xls)$/.test(file.name);
      
      if (isCSV) {
        const text = await file.text();
        parsed = parseCSV(text);
      } else if (isExcel) {
        const arrayBuffer = await file.arrayBuffer();
        parsed = parseExcel(arrayBuffer);
      } else {
        throw new Error('Format non supporté (CSV ou Excel requis)');
      }
      
      if (!parsed) throw new Error('Erreur de parsing du fichier');
      
      // Afficher aperçu
      showPreview(form, file, parsed);
      submitBtn.disabled = false;
      form._parsedData = parsed;
      form._file = file;
      
    } catch (e) {
      alert(`❌ Erreur: ${e.message}`);
      submitBtn.disabled = true;
      form._parsedData = null;
    }
  };
  
  // Afficher aperçu
  const showPreview = (form, file, parsed) => {
    let previewDiv = form.querySelector('.imp-preview');
    if (!previewDiv) {
      previewDiv = document.createElement('div');
      previewDiv.className = 'imp-preview';
      form.insertBefore(previewDiv, form.querySelector('.imp-actions'));
    }
    
    const { valid, errors } = validateRows(parsed.rows);
    
    let html = `
      <div class="imp-preview-header">
        <div class="imp-preview-title">📋 Aperçu du fichier: ${file.name}</div>
        <div class="imp-preview-stats">
          <span class="imp-stat-good">${valid.length} valides ✅</span>
          ${errors.length > 0 ? `<span class="imp-stat-bad">${errors.length} erreurs ❌</span>` : ''}
        </div>
      </div>
    `;
    
    if (errors.length > 0) {
      html += `
        <div class="imp-preview-errors">
          <div class="imp-errors-title">Erreurs detectées:</div>
          ${errors.slice(0, 5).map(err => `
            <div class="imp-error-item">
              <strong>Ligne ${err.row}:</strong> ${err.errors.join(', ')}
            </div>
          `).join('')}
          ${errors.length > 5 ? `<div class="imp-error-item">... et ${errors.length - 5} erreurs de plus</div>` : ''}
        </div>
      `;
    }
    
    html += `
      <div class="imp-preview-table">
        <table>
          <thead>
            <tr>
              ${parsed.headers.map(h => `<th>${h || 'Col'}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${parsed.rows.slice(0, 3).map(row => `
              <tr>
                ${Object.values(row).map(v => `<td>${v || '-'}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${parsed.rows.length > 3 ? `<div class="imp-table-more">... et ${parsed.rows.length - 3} lignes de plus</div>` : ''}
      </div>
    `;
    
    previewDiv.innerHTML = html;
  };
  
  return {
    mount(selector, fb, usr) {
      hostEl = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector;
      
      if (!hostEl) {
        console.error('[ClientsImport] mount: host not found');
        return;
      }
      
      if (fb) db = fb;
      if (usr) currentUser = usr;
      
      // Vérifier que l'utilisateur est admin
      if (typeof AccountsManager !== 'undefined') {
        AccountsManager.checkPermission('accounts_manage').then(isAdmin => {
          if (!isAdmin) {
            hostEl.innerHTML = '<div class="imp-error">❌ Accès refusé. Seuls les administrateurs peuvent importer une base clients.</div>';
            return;
          }
          
          renderModule();
        });
      } else {
        // Fallback si AccountsManager non disponible
        renderModule();
      }
    },
    
    // Rendu du module
    renderModule: function() {
      const form = renderForm();
      hostEl.innerHTML = '';
      hostEl.appendChild(form);
      
      const fileInput = form.querySelector('#imp-file-input');
      const uploadZone = form.querySelector('#imp-upload-zone');
      const submitBtn = form.querySelector('#imp-submit');
      
      // Clic sur zone upload
      uploadZone.addEventListener('click', () => fileInput.click());
      
      // Drag & drop
      uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('imp-upload-zone-hover');
      });
      
      uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('imp-upload-zone-hover');
      });
      
      uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('imp-upload-zone-hover');
        if (e.dataTransfer.files.length > 0) {
          handleFileSelect(e.dataTransfer.files[0], form);
        }
      });
      
      // Sélection fichier
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          handleFileSelect(e.target.files[0], form);
        }
      });
      
      // Submit
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!form._parsedData) {
          alert('Veuillez sélectionner un fichier');
          return;
        }
        
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Import en cours...';
        
        try {
          const { valid, errors } = validateRows(form._parsedData.rows);
          
          if (valid.length === 0) {
            alert('❌ Aucun client valide à importer');
            submitBtn.disabled = false;
            submitBtn.textContent = '✅ Importer';
            return;
          }
          
          const results = await importToFirestore(valid);
          
          const msg = `✅ Import terminé!\n\n✓ ${results.success} clients importés\n⚠️ ${results.duplicates} doublons (ignorés)\n❌ ${results.failed} erreurs`;
          alert(msg);
          
          form.reset();
          form._parsedData = null;
          const preview = form.querySelector('.imp-preview');
          if (preview) preview.remove();
          
          submitBtn.disabled = true;
          submitBtn.textContent = '✅ Importer';
          
        } catch (e) {
          alert(`❌ Erreur lors de l'import: ${e.message}`);
          submitBtn.disabled = false;
          submitBtn.textContent = '✅ Importer';
        }
      });
      
      form.addEventListener('reset', () => {
        fileInput.value = '';
        const preview = form.querySelector('.imp-preview');
        if (preview) preview.remove();
        submitBtn.disabled = true;
        form._parsedData = null;
      });
    }
  };
})();
