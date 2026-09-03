/**
 * STOCK ENTRY MODULE — BIONTRUFFLE (v2.3)
 * Entrée de stock par EAN / RÉFÉRENCE avec mouvements, raisons, localisations
 * + Scanner EAN + Export PDF/CSV
 */

const StockEntry = (() => {
  let hostEl = null;
  let currentBrand = 'biontruffle';
  let stockHistory = [];
  let stockSummary = {};
  let db = null;
  let currentUser = null;
  let onStockSync = null;
  
  const MOVEMENT_TYPES = [
    { value: 'reception', label: 'Réception', color: '#4CAF50' },
    { value: 'sortie', label: 'Sortie', color: '#FF9800' },
    { value: 'correction', label: 'Correction', color: '#2196F3' },
    { value: 'ajustement', label: 'Ajustement', color: '#9C27B0' },
  ];

  let MOVEMENT_REASONS = {
    reception: ['Livraison fournisseur', 'Retour client', 'Stock initial'],
    sortie: ['Vente', 'Cadeau', 'Perte', 'Obsolescence'],
    correction: ['Différence inventaire', 'Erreur système'],
    ajustement: ['Réajustement', 'Comptage'],
  };

  let LOCATIONS = ['Central', 'Grenoble', 'Périgord'];

  const loadHistory = async () => {
    if (!db || !currentBrand) return;
    try {
      const col = `stock_entries_${currentBrand}`;
      const snap = await db.collection(col).orderBy('createdAt', 'desc').get();
      stockHistory = snap.docs.map(d => ({
        id: d.id,
        date: d.data().createdAt?.toDate?.().toLocaleDateString('fr-FR') || d.data().date,
        ...d.data()
      }));
      console.log(`✅ Chargé ${stockHistory.length} entrées`);
      renderHistory();
      computeSummary();
    } catch (e) {
      console.error('❌ Erreur chargement historique:', e);
      stockHistory = [];
    }
  };

  const saveEntry = async (ean, ref, qty, name, movementType, reason, location, prixAchat, ddm, numLot) => {
    if (!db || !currentBrand || !currentUser) return false;
    try {
      const col = `stock_entries_${currentBrand}`;
      await db.collection(col).add({
        ean,
        code: ref,
        productName: name,
        qty: parseInt(qty, 10),
        movementType,
        reason,
        location,
        prixAchat: prixAchat ? parseFloat(prixAchat) : null,
        ddm: ddm || null,
        numLot: numLot || null,
        createdAt: new Date(),
        createdBy: currentUser.email,
      });
      console.log('✅ Entrée enregistrée');
      if (onStockSync) onStockSync({ type: movementType, qty });
      return true;
    } catch (e) {
      console.error('❌ Erreur enregistrement:', e);
      return false;
    }
  };

  const computeSummary = () => {
    stockSummary = {};
    stockHistory.forEach(e => {
      if (!stockSummary[e.code]) {
        stockSummary[e.code] = { name: e.productName, qty: 0, prix: 0, entries: [] };
      }
      stockSummary[e.code].qty += e.qty;
      if (e.prixAchat) stockSummary[e.code].prix = e.prixAchat;
      stockSummary[e.code].entries.push(e);
    });
  };

  const renderForm = () => {
    const form = document.createElement('form');
    form.className = 'stk-form';
    form.innerHTML = `
      <div class="stk-field-group">
        <label>Produit (EAN ou Ref)</label>
        <input type="text" id="stk-search" placeholder="Scanner ou saisir" autocomplete="off">
        <div id="stk-result"></div>
      </div>
      <div class="stk-field-group">
        <label>Type</label>
        <select id="stk-type">
          ${MOVEMENT_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="stk-field-group">
        <label>Raison</label>
        <select id="stk-reason"><option>--</option></select>
      </div>
      <div class="stk-field-group">
        <label>Quantité</label>
        <input type="number" id="stk-qty" placeholder="0" required>
      </div>
      <div class="stk-field-group">
        <label>Localisation</label>
        <select id="stk-location">
          ${LOCATIONS.map(l => `<option value="${l}">${l}</option>`).join('')}
        </select>
      </div>
      <div class="stk-section-title">📦 Infos complémentaires</div>
      <div class="stk-field-group">
        <label>Prix d'achat (€)</label>
        <input type="number" id="stk-prix" placeholder="0.00" step="0.01">
      </div>
      <div class="stk-field-group">
        <label>DDM</label>
        <input type="date" id="stk-ddm">
      </div>
      <div class="stk-field-group">
        <label>Numéro LOT</label>
        <input type="text" id="stk-lot" placeholder="LOT-2024-001">
      </div>
      <button type="button" id="stk-scanner-toggle" class="stk-scanner-btn">📱 Scanner</button>
      <div id="stk-scanner-host"></div>
      <button type="submit" class="stk-submit">✅ Enregistrer</button>
    `;
    return form;
  };

  const renderHistory = () => {
    const histDiv = document.getElementById('stk-history');
    if (!histDiv) return;
    
    let html = '';
    let currentDate = '';
    
    stockHistory.forEach(e => {
      if (e.date !== currentDate) {
        if (currentDate) html += '</div>';
        currentDate = e.date;
        html += `<div class="stk-date-group"><div class="stk-date-label">📅 ${e.date}</div>`;
      }
      
      const color = MOVEMENT_TYPES.find(t => t.value === e.movementType)?.color || '#999';
      const prixDisplay = e.prixAchat ? `€${e.prixAchat.toFixed(2)}` : '-';
      const ddmDisplay = e.ddm || '-';
      const lotDisplay = e.numLot || '-';
      
      html += `
        <div class="stk-entry" style="border-left: 4px solid ${color}">
          <div class="stk-entry-name">${e.productName}</div>
          <div class="stk-entry-details">
            Code: ${e.code || e.ean || '?'} | Type: ${e.movementType} | Raison: ${e.reason || '-'}
          </div>
          <div class="stk-entry-qty" style="color: ${e.qty > 0 ? '#4CAF50' : '#FF9800'}">
            ${e.qty > 0 ? '+' : ''}${e.qty} | Prix: ${prixDisplay} | DDM: ${ddmDisplay} | LOT: ${lotDisplay}
          </div>
        </div>
      `;
    });
    
    if (currentDate) html += '</div>';
    histDiv.innerHTML = html || '<div style="color: #999;">Aucune entrée</div>';
  };

  const renderSummary = () => {
    const summDiv = document.getElementById('stk-summary');
    if (!summDiv) return;
    
    if (Object.keys(stockSummary).length === 0) {
      summDiv.innerHTML = '<div style="color: #999;">Aucun produit</div>';
      return;
    }
    
    let html = '<div class="stk-summary-grid">';
    Object.entries(stockSummary).forEach(([code, data]) => {
      const qty = data.qty;
      const color = qty > 0 ? '#4CAF50' : qty < 0 ? '#FF9800' : '#999';
      html += `
        <div class="stk-summary-card">
          <div class="stk-summary-name">${data.name}</div>
          <div class="stk-summary-code">${code}</div>
          <div class="stk-summary-qty" style="color: ${color}; font-size: 1.2rem; font-weight: 700;">
            ${qty > 0 ? '+' : ''}${qty}
          </div>
          ${data.prix ? `<div class="stk-summary-prix">€${data.prix.toFixed(2)}</div>` : ''}
        </div>
      `;
    });
    html += '</div>';
    summDiv.innerHTML = html;
  };

  const exportStockToPDF = async () => {
    if (!stockHistory || stockHistory.length === 0) {
      alert('Aucune entrée à exporter');
      return;
    }

    try {
      const jsPDF = window.jspdf.jsPDF;
      if (!jsPDF) {
        alert('⚠️ jsPDF non disponible');
        return;
      }

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      let yPos = 10;

      doc.setFontSize(16);
      doc.text('📦 RAPPORT ENTRÉE STOCK', 105, yPos, { align: 'center' });
      yPos += 10;
      doc.setFontSize(10);
      doc.text(`${new Date().toLocaleString('fr-FR')} | ${currentUser?.email}`, 105, yPos, { align: 'center' });
      yPos += 15;

      stockHistory.forEach((e, idx) => {
        if (yPos > 250) {
          doc.addPage();
          yPos = 10;
        }
        
        const movType = MOVEMENT_TYPES.find(m => m.value === e.movementType)?.label || e.movementType;
        doc.text(`${e.productName} (${e.code})`, 10, yPos);
        doc.setFontSize(8);
        doc.text(`${movType} | ${e.reason} | Qty: ${e.qty} | €${e.prixAchat || '-'} | DDM: ${e.ddm || '-'} | LOT: ${e.numLot || '-'}`, 10, yPos + 5);
        doc.setFontSize(10);
        yPos += 10;
      });

      doc.save(`stock-rapport-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e) {
      alert('❌ Erreur: ' + e.message);
    }
  };

  const exportStockToCSV = () => {
    if (!stockHistory || stockHistory.length === 0) {
      alert('Aucune entrée à exporter');
      return;
    }

    let csv = 'Date,Produit,Code,Type,Raison,Quantité,Prix,DDM,LOT\n';
    stockHistory.forEach(e => {
      csv += `"${e.date}","${e.productName}","${e.code}","${e.movementType}","${e.reason}","${e.qty}","${e.prixAchat || ''}","${e.ddm || ''}","${e.numLot || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return {
    mount(selector, fb, usr, brand) {
      hostEl = typeof selector === 'string' ? document.querySelector(selector) : selector;
      if (!hostEl) {
        console.error('[StockEntry] Host not found');
        return;
      }
      if (fb) db = fb;
      if (usr) currentUser = usr;
      if (brand) currentBrand = brand;

      hostEl.innerHTML = `
        <div class="stk-container">
          <div class="stk-form-panel" id="stk-form-host"></div>
          <div class="stk-summary-panel">
            <h3>📊 Totaux</h3>
            <div id="stk-summary"></div>
          </div>
          <div class="stk-history-panel">
            <h3>📋 Historique</h3>
            <div id="stk-history"></div>
          </div>
        </div>
      `;

      document.getElementById('stk-form-host').appendChild(renderForm());
      
      const typeSelect = hostEl.querySelector('#stk-type');
      typeSelect?.addEventListener('change', () => {
        const reason = hostEl.querySelector('#stk-reason');
        const type = typeSelect.value;
        reason.innerHTML = '<option>--</option>' + 
          (MOVEMENT_REASONS[type] || []).map(r => `<option>${r}</option>`).join('');
      });

      const submitBtn = hostEl.querySelector('.stk-submit');
      submitBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        const search = hostEl.querySelector('#stk-search').value.trim();
        const qty = hostEl.querySelector('#stk-qty').value;
        const reason = hostEl.querySelector('#stk-reason').value;
        const prixAchat = hostEl.querySelector('#stk-prix').value;
        const ddm = hostEl.querySelector('#stk-ddm').value;
        const numLot = hostEl.querySelector('#stk-lot').value;
        const movementType = hostEl.querySelector('#stk-type').value;

        if (!search || !qty || !reason || !movementType) {
          alert('❌ Remplissez tous les champs obligatoires');
          return;
        }

        const ok = await saveEntry(search, search, qty, search, movementType, reason, 'Central', prixAchat, ddm, numLot);
        if (ok) {
          hostEl.querySelector('.stk-form').reset();
          await loadHistory();
        }
      });

      // Charger au démarrage
      loadHistory();
    },

    setDb(fb) { db = fb; },
    setUser(usr) { currentUser = usr; },
    setBrand(brand) { currentBrand = brand; },
    setLocations(locs) { LOCATIONS = locs || LOCATIONS; },
    setMovementReasons(reasons) { Object.assign(MOVEMENT_REASONS, reasons); },
    onStockSync(callback) { onStockSync = callback; },
    loadHistory,
    computeSummary,
    getSummary() { return stockSummary; },
    exportStockToPDF,
    exportStockToCSV,
    getHistory() { return stockHistory; },
  };
})();
