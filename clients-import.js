/**
 * CLIENTS IMPORT — VERSION SIMPLE (v2)
 * Module d'import de base clients (CSV/Excel)
 * Simplifié pour admin auto
 */

const ClientsImport = (() => {
  let hostEl = null;
  let db = null;
  let currentUser = null;

  const render = () => {
    if (!hostEl) return;
    
    hostEl.innerHTML = `
      <div style="padding: 2rem; max-width: 900px; margin: 0 auto;">
        
        <div style="background: white; border: 1px solid #e4e4e7; border-radius: 12px; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <div style="font-size: 1.3rem; font-weight: 700; margin-bottom: 1rem; color: #18181b;">📥 Importer une base de clients</div>
          
          <div style="background: #f0f9ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
            <div style="font-weight: 600; color: #1e40af; margin-bottom: 0.5rem;">📋 Format attendu:</div>
            <div style="font-size: 0.9rem; color: #1e3a8a;">
              Fichier CSV ou Excel avec colonnes:<br>
              <strong>Requis:</strong> email, nom<br>
              <strong>Optionnels:</strong> adresse, telephone, contact, siret, ville, codepostal
            </div>
          </div>
          
          <form id="import-form" style="display: flex; flex-direction: column; gap: 1rem;">
            
            <div id="drop-zone" style="border: 2px dashed #94a3b8; border-radius: 8px; padding: 2rem; text-align: center; cursor: pointer; transition: all 0.3s;" 
                 onmouseover="this.style.background='#f1f5f9'" 
                 onmouseout="this.style.background='white'">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">📁</div>
              <div style="font-weight: 600; color: #1e293b; margin-bottom: 0.25rem;">Cliquez ou déposez votre fichier</div>
              <div style="font-size: 0.85rem; color: #64748b;">CSV ou Excel (.xlsx, .xls)</div>
              <input type="file" id="file-input" accept=".csv,.xlsx,.xls" style="display: none;">
            </div>
            
            <div id="file-status" style="display: none; padding: 0.75rem; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; color: #16a34a;">
              ✅ <span id="file-name"></span>
            </div>
            
            <div id="preview-area" style="display: none; margin: 1rem 0;">
              <div style="font-weight: 600; margin-bottom: 0.5rem;">📊 Aperçu:</div>
              <div id="preview" style="max-height: 300px; overflow-y: auto; border: 1px solid #e4e4e7; border-radius: 6px; background: #fafafa; padding: 1rem; font-size: 0.85rem; font-family: monospace;"></div>
            </div>
            
            <div style="display: flex; gap: 1rem;">
              <button type="submit" id="submit-btn" disabled style="flex: 1; padding: 0.75rem; background: #16a34a; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; disabled-opacity: 0.5;">✅ Importer</button>
              <button type="reset" style="padding: 0.75rem 1.5rem; background: #f3f4f6; color: #4b5563; border: 1px solid #e4e4e7; border-radius: 6px; cursor: pointer; font-weight: 600;">↻ Annuler</button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    attachEvents();
  };

  const attachEvents = () => {
    const form = document.getElementById('import-form');
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const submitBtn = document.getElementById('submit-btn');
    const fileStatus = document.getElementById('file-status');
    const fileName = document.getElementById('file-name');
    const previewArea = document.getElementById('preview-area');
    const previewDiv = document.getElementById('preview');

    form._fileData = null;

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.background = '#f1f5f9';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.background = 'white';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.background = 'white';
      const files = e.dataTransfer.files;
      if (files.length > 0) handleFileSelect(files[0]);
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
    });

    const handleFileSelect = async (file) => {
      try {
        let data = null;
        if (file.name.endsWith('.csv')) {
          const text = await file.text();
          data = parseCSV(text);
        } else if (/\.(xlsx|xls)$/.test(file.name)) {
          const buffer = await file.arrayBuffer();
          data = parseExcel(buffer);
        } else {
          alert('Format non supporté');
          return;
        }

        form._fileData = data;
        fileName.textContent = file.name + ' (' + data.rows.length + ' lignes)';
        fileStatus.style.display = 'block';
        submitBtn.disabled = false;

        previewDiv.innerHTML = data.rows.slice(0, 5).map(row => 
          JSON.stringify(row)
        ).join('\n');
        previewArea.style.display = 'block';
      } catch (e) {
        alert('❌ Erreur: ' + e.message);
      }
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form._fileData) {
        alert('Sélectionnez un fichier');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Import en cours...';

      try {
        const rows = form._fileData.rows;
        let imported = 0, skipped = 0;

        for (const row of rows) {
          if (!row.email || !row.nom) {
            skipped++;
            continue;
          }

          try {
            await db.collection('clients_biontruffle').doc(row.email.toLowerCase()).set({
              email: row.email.toLowerCase(),
              nom: row.nom,
              adresse: row.adresse || '',
              telephone: row.telephone || '',
              contact: row.contact || '',
              siret: row.siret || '',
              ville: row.ville || '',
              codepostal: row.codepostal || '',
              importedAt: firebase.firestore.FieldValue.serverTimestamp(),
              importedBy: currentUser.email
            });
            imported++;
          } catch (e) {
            console.error('Erreur import ligne:', e);
            skipped++;
          }
        }

        alert(`✅ Import terminé!\n\n✓ ${imported} clients importés\n⚠️ ${skipped} ignorés`);
        form.reset();
        form._fileData = null;
        fileStatus.style.display = 'none';
        previewArea.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = '✅ Importer';
      } catch (e) {
        alert('❌ Erreur: ' + e.message);
        submitBtn.disabled = false;
        submitBtn.textContent = '✅ Importer';
      }
    });

    form.addEventListener('reset', () => {
      fileInput.value = '';
      form._fileData = null;
      fileStatus.style.display = 'none';
      previewArea.style.display = 'none';
      submitBtn.disabled = true;
    });
  };

  const parseCSV = (text) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('Fichier vide');
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      if (row.email && row.nom) rows.push(row);
    }
    
    return { headers, rows };
  };

  const parseExcel = (buffer) => {
    if (typeof XLSX === 'undefined') {
      throw new Error('Excel parsing non disponible');
    }
    
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    return { 
      headers: Object.keys(data[0] || {}),
      rows: data.map(row => ({
        email: row.email || '',
        nom: row.nom || '',
        adresse: row.adresse || '',
        telephone: row.telephone || '',
        contact: row.contact || '',
        siret: row.siret || '',
        ville: row.ville || '',
        codepostal: row.codepostal || ''
      }))
    };
  };

  return {
    mount(selector, fb, usr) {
      hostEl = typeof selector === 'string' 
        ? document.querySelector(selector) 
        : selector;
      
      if (!hostEl) {
        console.error('ClientsImport: host not found');
        return;
      }

      db = fb;
      currentUser = usr;

      // Seulement pour l'admin
      if (!currentUser || currentUser.email !== 'spoto.christophe@gmail.com') {
        hostEl.innerHTML = '<div style="padding: 2rem; color: #dc2626; text-align: center;">❌ Accès refusé.</div>';
        return;
      }

      render();
    }
  };
})();
