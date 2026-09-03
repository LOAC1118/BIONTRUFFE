/**
 * STOCK ENTRY MODULE — BIONTRUFFLE (v2.1)
 * Entrée de stock par EAN / RÉFÉRENCE avec mouvements, raisons, localisations, synchro BDC
 * + Intégration scanner EAN
 * IIFE self-contained, styles `stk-`, API `StockEntry.mount()`
 */

const StockEntry = (() => {
  let hostEl = null;
  let currentBrand = 'biontruffle';
  let stockHistory = [];
  let stockSummary = {};
  let db = null;
  let currentUser = null;
  
  const MOVEMENT_TYPES = [
    { value: 'reception', label: 'Réception', color: '#4CAF50' },
    { value: 'sortie', label: 'Sortie', color: '#FF9800' },
    { value: 'correction', label: 'Correction', color: '#2196F3' },
    { value: 'ajustement', label: 'Ajustement', color: '#9C27B0' },
  ];
  
  const MOVEMENT_REASONS = {
    reception: ['Livraison fournisseur', 'Retour client'],
    sortie: ['Vente', 'Transfert', 'Destruction', 'Perte'],
    correction: ['Erreur de saisie', 'Inventaire', 'Casse'],
    ajustement: ['Autre'],
  };
  
  let LOCATIONS = [
    { id: 'central', label: 'Stock central' },
    { id: 'grenoble', label: 'Stock Grenoble' },
    { id: 'perigord', label: 'Stock Périgord' },
  ];
  
  let onStockSync = null;

  const setDb = (firestore) => { db = firestore; };
  const setUser = (u) => { currentUser = u; };
  const setBrand = (b) => { currentBrand = b; };

  const findProduct = (searchTerm) => {
    if (!window.PRODUCTS) return null;
    const term = (searchTerm || '').trim().toUpperCase();
    if (!term) return null;
    let p = window.PRODUCTS.find(x => x.ean && x.ean.toUpperCase() === term);
    if (p) return p;
    p = window.PRODUCTS.find(x => x.code && x.code.toUpperCase() === term);
    if (p) return p;
    return null;
  };

  const loadHistory = async () => {
    if (!db || !currentUser) return;
    try {
      const col = db.collection(`stock_entries_${currentBrand}`);
      const snap = await col
        .where('uid', '==', currentUser.uid)
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();
      stockHistory = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderHistory();
      computeSummary();
    } catch (e) {
      console.error('[StockEntry] load history:', e);
    }
  };

  const computeSummary = () => {
    stockSummary = {};
    stockHistory.forEach(entry => {
      const code = entry.code || entry.ref;
      if (!code) return;
      if (!stockSummary[code]) {
        stockSummary[code] = {
          code: code,
          productName: entry.productName,
          totalQty: 0,
          countEntries: 0,
          byLocation: {},
        };
      }
      stockSummary[code].totalQty += (entry.qty || 0);
      stockSummary[code].countEntries += 1;
      const loc = entry.location || 'central';
      if (!stockSummary[code].byLocation[loc]) {
        stockSummary[code].byLocation[loc] = 0;
      }
      stockSummary[code].byLocation[loc] += (entry.qty || 0);
    });
    renderSummary();
  };

  const syncStockToBDC = async (ref, qtyDelta) => {
    if (!ref || !window.bdcStockMap) return;
    try {
      const currentStk = window.bdcStockMap[ref] || 0;
      window.bdcStockMap[ref] = Math.max(0, currentStk + qtyDelta);
      if (db && currentUser) {
        const cfgRef = db.collection('config_' + currentBrand).doc('stock_map');
        const current = (await cfgRef.get()).data() || {};
        current[ref] = window.bdcStockMap[ref];
        await cfgRef.set(current, { merge: true });
      }
      console.log(`[StockEntry] Synchro BDC: ${ref} => ${window.bdcStockMap[ref]}`);
    } catch (e) {
      console.warn('[StockEntry] Synchro BDC échouée:', e);
    }
  };

  const saveEntry = async (ean, ref, qty, productName, movementType, reason, location, prixAchat, ddm, numLot) => {
    if (!db || !currentUser) return false;
    if (!qty || qty === 0) return false;
    const qtyInt = parseInt(qty, 10);
    try {
      const col = db.collection(`stock_entries_${currentBrand}`);
      const entry = {
        ean: ean || '',
        ref: ref || '',
        code: ref || '',
        productName: productName || ref || ean,
        qty: qtyInt,
        movementType: movementType || 'reception',
        reason: reason || '',
        location: location || 'central',
        prixAchat: prixAchat ? parseFloat(prixAchat) : null,
        ddm: ddm || null,
        numLot: numLot || null,
        uid: currentUser.uid,
        createdAt: firebase.firestore.Timestamp.now(),
        date: new Date().toISOString().split('T')[0],
      };
      await col.add(entry);
      await syncStockToBDC(ref, qtyInt);
      if (onStockSync) {
        onStockSync({ code: ref, qty: qtyInt, type: movementType });
      }
      return true;
    } catch (e) {
      console.error('[StockEntry] save:', e);
      return false;
    }
  };

  const renderForm = () => {
    const form = document.createElement('form');
    form.className = 'stk-form';
    const movementOpts = MOVEMENT_TYPES
      .map(m => `<option value="${m.value}">${m.label}</option>`)
      .join('');
    const locationOpts = LOCATIONS
      .map(l => `<option value="${l.id}">${l.label}</option>`)
      .join('');
    
    form.innerHTML = `
      <fieldset class="stk-fieldset">
        <legend class="stk-legend">Mouvement de stock</legend>
        <div class="stk-group">
          <label for="stk-type">Type *</label>
          <select id="stk-type" class="stk-input stk-select">
            ${movementOpts}
          </select>
        </div>
        <div class="stk-group">
          <label for="stk-search">EAN ou RÉFÉRENCE *</label>
          <div class="stk-search-group">
            <input type="text" id="stk-search" class="stk-input stk-search"
              placeholder="Ex: 5410188005000 ou PRD-001" autocomplete="off"/>
            <button type="button" id="stk-scanner-toggle" class="stk-icon-btn stk-scanner-btn" title="Scanner EAN">📱</button>
          </div>
          <div class="stk-result" id="stk-result"></div>
          <div id="stk-scanner-host" class="stk-scanner-panel" style="display: none;"></div>
        </div>
        <div class="stk-group">
          <label for="stk-qty">Quantité *</label>
          <input type="number" id="stk-qty" class="stk-input stk-qty"
            min="-9999" step="1" placeholder="0"/>
          <small class="stk-hint">Positive = entrée, négative = sortie</small>
        </div>
        <div class="stk-group">
          <label for="stk-reason">Raison *</label>
          <select id="stk-reason" class="stk-input stk-select">
            <option value="">-- Sélectionner --</option>
          </select>
        </div>
        <div class="stk-group">
          <label for="stk-location">Localisation</label>
          <select id="stk-location" class="stk-input stk-select">
            ${locationOpts}
          </select>
        </div>
        
        <!-- NOUVEAUX CHAMPS: Prix, DDM, LOT -->
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 0.75rem; margin: 1rem 0;">
          <div style="font-size: 0.75rem; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.75rem;">📦 Infos complémentaires</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
            <div class="stk-group" style="margin: 0;">
              <label for="stk-prix" style="font-size: 0.8rem;">Prix d'achat (€)</label>
              <input type="number" id="stk-prix" class="stk-input" 
                min="0" step="0.01" placeholder="0.00" style="font-size: 0.85rem; padding: 0.4rem 0.5rem;"/>
            </div>
            <div class="stk-group" style="margin: 0;">
              <label for="stk-ddm" style="font-size: 0.8rem;">DDM</label>
              <input type="date" id="stk-ddm" class="stk-input" style="font-size: 0.85rem; padding: 0.4rem 0.5rem;"/>
            </div>
            <div class="stk-group" style="margin: 0;">
              <label for="stk-lot" style="font-size: 0.8rem;">N° de LOT</label>
              <input type="text" id="stk-lot" class="stk-input" placeholder="Ex: LOT-2024-001" style="font-size: 0.85rem; padding: 0.4rem 0.5rem;"/>
            </div>
          </div>
        </div>
        
        <div class="stk-actions">
          <button type="submit" class="stk-btn stk-btn-primary">Enregistrer</button>
          <button type="reset" class="stk-btn stk-btn-secondary">Réinitialiser</button>
        </div>
      </fieldset>
    `;

    const typeSelect = form.querySelector('#stk-type');
    const searchInput = form.querySelector('#stk-search');
    const qtyInput = form.querySelector('#stk-qty');
    const reasonSelect = form.querySelector('#stk-reason');
    const locationSelect = form.querySelector('#stk-location');
    const resultDiv = form.querySelector('#stk-result');
    const scannerToggleBtn = form.querySelector('#stk-scanner-toggle');
    const scannerHost = form.querySelector('#stk-scanner-host');
    let currentProduct = null;
    let scannerOpen = false;

    const updateReasons = () => {
      const movementType = typeSelect.value;
      const reasons = MOVEMENT_REASONS[movementType] || [];
      reasonSelect.innerHTML = '<option value="">-- Sélectionner --</option>';
      reasons.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        reasonSelect.appendChild(opt);
      });
    };

    typeSelect.addEventListener('change', updateReasons);
    updateReasons();

    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.trim();
      resultDiv.innerHTML = '';
      currentProduct = null;
      if (!term) return;
      const found = findProduct(term);
      if (found) {
        currentProduct = found;
        resultDiv.innerHTML = `
          <div class="stk-match">
            <strong>${found.libelle || found.code}</strong>
            <small>${found.code} • EAN: ${found.ean || 'n/a'}</small>
          </div>
        `;
        qtyInput.focus();
      } else {
        resultDiv.innerHTML = `<div class="stk-nomatch">Produit introuvable</div>`;
      }
    });

    if (scannerToggleBtn && typeof StockScanner !== 'undefined') {
      scannerToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        scannerOpen = !scannerOpen;
        if (scannerOpen) {
          scannerHost.style.display = 'block';
          StockScanner.mount('#stk-scanner-host', '#stk-search');
          StockScanner.onDetected((event) => {
            console.log('[StockEntry] Code scanner:', event.code);
            scannerOpen = false;
            scannerHost.style.display = 'none';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          });
        } else {
          StockScanner.stop();
          scannerHost.style.display = 'none';
        }
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const search = searchInput.value.trim();
      const qty = qtyInput.value.trim();
      const movementType = typeSelect.value;
      const reason = reasonSelect.value;
      const location = locationSelect.value;
      const prixAchat = form.querySelector('#stk-prix')?.value || '';
      const ddm = form.querySelector('#stk-ddm')?.value || '';
      const numLot = form.querySelector('#stk-lot')?.value || '';
      
      if (!currentProduct && !search) {
        alert('Veuillez entrer un EAN ou une référence');
        return;
      }
      if (!qty || parseInt(qty, 10) === 0) {
        alert('Veuillez entrer une quantité non-nulle');
        return;
      }
      if (!reason) {
        alert('Veuillez sélectionner une raison');
        return;
      }
      
      const ean = currentProduct?.ean || '';
      const ref = currentProduct?.code || search;
      const name = currentProduct?.libelle || search;
      
      const ok = await saveEntry(ean, ref, qty, name, movementType, reason, location, prixAchat, ddm, numLot);
      if (ok) {
        form.reset();
        resultDiv.innerHTML = '';
        currentProduct = null;
        updateReasons();
        const msg = document.createElement('div');
        msg.className = 'stk-success';
        msg.textContent = `✓ ${name} — ${qty} pcs (${reason})`;
        form.prepend(msg);
        setTimeout(() => msg.remove(), 3000);
        await loadHistory();
      } else {
        alert('Erreur lors de l\'enregistrement');
      }
    });

    return form;
  };

  const renderHistory = () => {
    const histDiv = document.getElementById('stk-history');
    if (!histDiv) return;
    if (!stockHistory.length) {
      histDiv.innerHTML = '<p class="stk-empty">Aucune entrée enregistrée</p>';
      return;
    }
    const byDate = {};
    stockHistory.forEach(e => {
      const d = e.date || e.createdAt?.toDate?.().toISOString().split('T')[0] || '?';
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(e);
    });
    let html = '<div class="stk-timeline">';
    Object.entries(byDate)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .forEach(([date, items]) => {
        html += `<div class="stk-date-group">
          <h4 class="stk-date-label">${date}</h4>
          <table class="stk-table" style="font-size: 0.8rem;">
            <thead><tr><th>Produit</th><th>Code</th><th>Type</th><th>Raison</th><th>Quantité</th><th>Prix €</th><th>DDM</th><th>LOT</th></tr></thead>
            <tbody>`;
        items.forEach(e => {
          const movType = MOVEMENT_TYPES.find(m => m.value === e.movementType);
          const badge = movType 
            ? `<span class="stk-badge" style="background:${movType.color}">${movType.label}</span>`
            : '';
          const qtyClass = e.qty > 0 ? 'stk-qty-in' : 'stk-qty-out';
          const prixDisplay = e.prixAchat ? e.prixAchat.toFixed(2) + ' €' : '—';
          const ddmDisplay = e.ddm ? e.ddm : '—';
          const lotDisplay = e.numLot ? e.numLot : '—';
          html += `<tr>
            <td class="stk-name">${e.productName}</td>
            <td class="stk-code">${e.code || e.ean || '?'}</td>
            <td>${badge}</td>
            <td class="stk-reason">${e.reason || '–'}</td>
            <td class="stk-qty ${qtyClass}">${e.qty > 0 ? '+' : ''}${e.qty}</td>
            <td style="text-align: right; color: #16a34a; font-weight: 500;">${prixDisplay}</td>
            <td style="color: #2196F3;">${ddmDisplay}</td>
            <td style="color: #FF9800; font-weight: 500;">${lotDisplay}</td>
          </tr>`;
        });
        html += `</tbody></table></div>`;
      });
    html += '</div>';
    histDiv.innerHTML = html;
  };

  const renderSummary = () => {
    const summDiv = document.getElementById('stk-summary');
    if (!summDiv) return;
    const products = Object.values(stockSummary)
      .sort((a, b) => b.totalQty - a.totalQty);
    if (!products.length) {
      summDiv.innerHTML = '<p class="stk-empty">Aucune consolidation</p>';
      return;
    }
    let html = '<div class="stk-summary-list">';
    products.forEach(p => {
      const locations = Object.entries(p.byLocation)
        .map(([loc, qty]) => `<span class="stk-loc-badge">${loc}: ${qty > 0 ? '+' : ''}${qty}</span>`)
        .join(' ');
      const qtyClass = p.totalQty > 0 ? 'stk-qty-in' : 'stk-qty-out';
      html += `
        <div class="stk-summary-card">
          <div class="stk-summary-head">
            <strong class="stk-summary-name">${p.productName}</strong>
            <span class="stk-summary-code">${p.code}</span>
          </div>
          <div class="stk-summary-body">
            <div class="stk-summary-total">
              <span>Total:</span>
              <span class="stk-qty ${qtyClass}">${p.totalQty > 0 ? '+' : ''}${p.totalQty}</span>
            </div>
            <div class="stk-summary-detail">${locations}</div>
            <div class="stk-summary-count">${p.countEntries} mouvement${p.countEntries > 1 ? 's' : ''}</div>
          </div>
        </div>
      `;
    });
    html += '</div>';
    summDiv.innerHTML = html;
  };

  return {
    mount(selector, fb, usr, brand) {
      hostEl = typeof selector === 'string' 
        ? document.querySelector(selector) 
        : selector;
      if (!hostEl) {
        console.error('[StockEntry] mount: host not found');
        return;
      }
      if (fb) setDb(fb);
      if (usr) setUser(usr);
      if (brand) setBrand(brand);

      hostEl.innerHTML = `
        <div class="stk-container">
          <div class="stk-form-panel">
            ${renderForm().outerHTML}
          </div>
          <div class="stk-right-panels">
            <div class="stk-summary-panel">
              <h3 class="stk-summary-title">📊 Totaux consolidés</h3>
              <div id="stk-summary" class="stk-summary"></div>
            </div>
            <div class="stk-history-panel">
              <h3 class="stk-history-title">📋 Historique détaillé</h3>
              <div id="stk-history" class="stk-history"></div>
            </div>
          </div>
        </div>
      `;

      const form = hostEl.querySelector('.stk-form');
      const searchInput = form.querySelector('#stk-search');
      const typeSelect = form.querySelector('#stk-type');
      const qtyInput = form.querySelector('#stk-qty');
      const reasonSelect = form.querySelector('#stk-reason');
      const locationSelect = form.querySelector('#stk-location');
      const resultDiv = form.querySelector('#stk-result');
      const scannerToggleBtn = form.querySelector('#stk-scanner-toggle');
      const scannerHost = form.querySelector('#stk-scanner-host');
      let currentProduct = null;
      let scannerOpen = false;

      const updateReasons = () => {
        const movementType = typeSelect.value;
        const reasons = MOVEMENT_REASONS[movementType] || [];
        reasonSelect.innerHTML = '<option value="">-- Sélectionner --</option>';
        reasons.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r;
          opt.textContent = r;
          reasonSelect.appendChild(opt);
        });
      };

      typeSelect.addEventListener('change', updateReasons);
      updateReasons();

      searchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim();
        resultDiv.innerHTML = '';
        currentProduct = null;
        if (!term) return;
        const found = findProduct(term);
        if (found) {
          currentProduct = found;
          resultDiv.innerHTML = `
            <div class="stk-match">
              <strong>${found.libelle || found.code}</strong>
              <small>${found.code} • EAN: ${found.ean || 'n/a'}</small>
            </div>
          `;
          qtyInput.focus();
        } else {
          resultDiv.innerHTML = `<div class="stk-nomatch">Produit introuvable</div>`;
        }
      });

      if (scannerToggleBtn && typeof StockScanner !== 'undefined') {
        scannerToggleBtn.addEventListener('click', (e) => {
          e.preventDefault();
          scannerOpen = !scannerOpen;
          if (scannerOpen) {
            scannerHost.style.display = 'block';
            StockScanner.mount('#stk-scanner-host', '#stk-search');
            StockScanner.onDetected((event) => {
              console.log('[StockEntry] Code scanner:', event.code);
              scannerOpen = false;
              scannerHost.style.display = 'none';
              searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
          } else {
            StockScanner.stop();
            scannerHost.style.display = 'none';
          }
        });
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const search = searchInput.value.trim();
        const qty = qtyInput.value.trim();
        const movementType = typeSelect.value;
        const reason = reasonSelect.value;
        const location = locationSelect.value;
        const prixAchat = form.querySelector('#stk-prix')?.value || '';
        const ddm = form.querySelector('#stk-ddm')?.value || '';
        const numLot = form.querySelector('#stk-lot')?.value || '';
        
        if (!currentProduct && !search) {
          alert('Veuillez entrer un EAN ou une référence');
          return;
        }
        if (!qty || parseInt(qty, 10) === 0) {
          alert('Veuillez entrer une quantité non-nulle');
          return;
        }
        if (!reason) {
          alert('Veuillez sélectionner une raison');
          return;
        }
        
        const ean = currentProduct?.ean || '';
        const ref = currentProduct?.code || search;
        const name = currentProduct?.libelle || search;
        
        const ok = await saveEntry(ean, ref, qty, name, movementType, reason, location, prixAchat, ddm, numLot);
        if (ok) {
          form.reset();
          resultDiv.innerHTML = '';
          currentProduct = null;
          updateReasons();
          const msg = document.createElement('div');
          msg.className = 'stk-success';
          msg.textContent = `✓ ${name} — ${qty} pcs (${reason})`;
          form.prepend(msg);
          setTimeout(() => msg.remove(), 3000);
          await loadHistory();
        } else {
          alert('Erreur lors de l\'enregistrement');
        }
      });

  const exportStockToPDF = async () => {
    if (!stockHistory || stockHistory.length === 0) {
      alert('Aucune entrée à exporter');
      return;
    }

    try {
      // Charger jsPDF
      const jsPDF = window.jspdf.jsPDF;
      if (!jsPDF) {
        alert('⚠️ jsPDF non disponible. Veuillez vérifier la connexion.');
        return;
      }

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageHeight = doc.internal.pageSize.height;
      const pageWidth = doc.internal.pageSize.width;
      let yPos = 10;

      // En-tête
      doc.setFontSize(16);
      doc.setTextColor(22, 163, 74);
      doc.text('📦 RAPPORT ENTRÉE STOCK', pageWidth / 2, yPos, { align: 'center' });
      
      yPos += 8;
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Généré le: ${new Date().toLocaleString('fr-FR')}`, pageWidth / 2, yPos, { align: 'center' });
      doc.text(`Utilisateur: ${currentUser?.email || 'unknown'}`, pageWidth / 2, yPos + 5, { align: 'center' });
      
      yPos += 15;

      // Grouper par date
      const byDate = {};
      stockHistory.forEach(e => {
        const d = e.date || e.createdAt?.toDate?.().toISOString().split('T')[0] || '?';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(e);
      });

      // Tableau pour chaque date
      Object.entries(byDate)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .forEach(([date, items]) => {
          // Vérifier si on a besoin d'une nouvelle page
          if (yPos > pageHeight - 40) {
            doc.addPage();
            yPos = 10;
          }

          // Titre de la date
          doc.setFontSize(11);
          doc.setTextColor(33, 150, 243);
          doc.setFont(undefined, 'bold');
          doc.text(`📅 ${date}`, 10, yPos);
          yPos += 7;

          // En-têtes du tableau
          doc.setFontSize(9);
          doc.setTextColor(50, 50, 50);
          doc.setFont(undefined, 'bold');
          const cols = [
            { header: 'Produit', x: 10, width: 35 },
            { header: 'Code', x: 47, width: 18 },
            { header: 'Type', x: 67, width: 18 },
            { header: 'Raison', x: 87, width: 30 },
            { header: 'Qty', x: 119, width: 12 },
            { header: 'Prix €', x: 133, width: 16 },
            { header: 'DDM', x: 151, width: 20 },
            { header: 'LOT', x: 173, width: 25 }
          ];

          cols.forEach(col => {
            doc.text(col.header, col.x, yPos, { maxWidth: col.width });
          });

          yPos += 6;
          doc.setDrawColor(200, 200, 200);
          doc.line(10, yPos, pageWidth - 10, yPos);
          yPos += 3;

          // Lignes du tableau
          doc.setFont(undefined, 'normal');
          doc.setFontSize(8);
          items.forEach(e => {
            if (yPos > pageHeight - 20) {
              doc.addPage();
              yPos = 10;
            }

            const movType = MOVEMENT_TYPES.find(m => m.value === e.movementType)?.label || e.movementType;
            const prixDisplay = e.prixAchat ? e.prixAchat.toFixed(2) : '—';
            const ddmDisplay = e.ddm || '—';
            const lotDisplay = e.numLot || '—';

            // Colorer les lignes en fonction du type
            if (e.qty > 0) {
              doc.setTextColor(22, 163, 74); // Vert
            } else {
              doc.setTextColor(255, 152, 0); // Orange
            }

            doc.text(e.productName.substring(0, 20), 10, yPos, { maxWidth: 35 });
            doc.text(e.code || e.ean || '?', 47, yPos, { maxWidth: 18 });
            doc.text(movType.substring(0, 12), 67, yPos, { maxWidth: 18 });
            doc.text((e.reason || '–').substring(0, 15), 87, yPos, { maxWidth: 30 });
            doc.text(`${e.qty > 0 ? '+' : ''}${e.qty}`, 119, yPos, { maxWidth: 12, align: 'right' });
            
            doc.setTextColor(22, 163, 74);
            doc.text(prixDisplay, 133, yPos, { maxWidth: 16, align: 'right' });
            
            doc.setTextColor(33, 150, 243);
            doc.text(ddmDisplay, 151, yPos, { maxWidth: 20 });
            
            doc.setTextColor(255, 152, 0);
            doc.text(lotDisplay, 173, yPos, { maxWidth: 25 });

            yPos += 5;
          });

          yPos += 3;
        });

      // Pied de page
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Rapport généré automatiquement - BIONTRUFFE CRM v2.2`, pageWidth / 2, pageHeight - 5, { align: 'center' });

      // Télécharger
      doc.save(`stock-rapport-${new Date().toISOString().split('T')[0]}.pdf`);
      console.log('✅ PDF généré et téléchargé');
    } catch (e) {
      console.error('❌ Erreur export PDF:', e);
      alert('❌ Erreur: ' + e.message);
    }
  };

  const exportStockToCSV = () => {
    if (!stockHistory || stockHistory.length === 0) {
      alert('Aucune entrée à exporter');
      return;
    }

    try {
      let csv = 'Date,Produit,Code,Type,Raison,Quantité,Prix €,DDM,LOT\n';
      
      stockHistory.forEach(e => {
        const date = e.date || e.createdAt?.toDate?.().toISOString().split('T')[0] || '?';
        const movType = MOVEMENT_TYPES.find(m => m.value === e.movementType)?.label || e.movementType;
        const prixDisplay = e.prixAchat ? e.prixAchat.toFixed(2) : '';
        const ddmDisplay = e.ddm || '';
        const lotDisplay = e.numLot || '';
        
        csv += `"${date}","${e.productName}","${e.code || e.ean || ''}","${movType}","${e.reason || ''}","${e.qty}","${prixDisplay}","${ddmDisplay}","${lotDisplay}"\n`;
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
      
      console.log('✅ CSV généré et téléchargé');
    } catch (e) {
      console.error('❌ Erreur export CSV:', e);
      alert('❌ Erreur: ' + e.message);
    }
  };

    setUser,
    setBrand,
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
