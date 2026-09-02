/**
 * STOCK ENTRY MODULE — BIONTRUFFE (v2)
 * Entrée de stock par EAN / RÉFÉRENCE avec mouvements, raisons, localisations, synchro BDC
 * IIFE self-contained, styles `stk-`, API `StockEntry.mount()`
 */

const StockEntry = (() => {
  // Private state
  let hostEl = null;
  let currentBrand = 'biontruffe'; // À parametrer
  let stockHistory = []; // Cache local pour affichage
  let stockSummary = {}; // Totaux par produit
  let db = null;
  let currentUser = null;
  
  // Config mouvements et localisations
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
  
  // Hook pour synchro BDC
  let onStockSync = null;

  // Helpers privés
  const setDb = (firestore) => { db = firestore; };
  const setUser = (u) => { currentUser = u; };
  const setBrand = (b) => { currentBrand = b; };

  // Lookup produit par EAN ou REF dans le catalogue
  const findProduct = (searchTerm) => {
    if (!window.PRODUCTS) return null;
    const term = (searchTerm || '').trim().toUpperCase();
    if (!term) return null;
    
    // Cherche par EAN d'abord
    let p = window.PRODUCTS.find(x => x.ean && x.ean.toUpperCase() === term);
    if (p) return p;
    
    // Puis par code/référence
    p = window.PRODUCTS.find(x => x.code && x.code.toUpperCase() === term);
    if (p) return p;
    
    return null;
  };

  // Lecture historique depuis Firestore
  const loadHistory = async () => {
    if (!db || !currentUser) return;
    
    try {
      const col = db.collection(`stock_entries_${currentBrand}`);
      const snap = await col
        .where('uid', '==', currentUser.uid)
        .orderBy('createdAt', 'desc')
        .limit(200) // Plus d'historique pour les totaux
        .get();
      
      stockHistory = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderHistory();
      computeSummary(); // Recalc totaux
    } catch (e) {
      console.error('[StockEntry] load history:', e);
    }
  };

  // Calcul des totaux consolidés par produit
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

  // Enregistrement d'une entrée (enrichie)
  const saveEntry = async (ean, ref, qty, productName, movementType, reason, location) => {
    if (!db || !currentUser) return false;
    if (!qty || qty === 0) return false;
    
    const qtyInt = parseInt(qty, 10);
    
    try {
      const col = db.collection(`stock_entries_${currentBrand}`);
      const entry = {
        ean: ean || '',
        ref: ref || '',
        code: ref || '', // Alias pour recherche
        productName: productName || ref || ean,
        qty: qtyInt, // Signé : positif=entrée, négatif=sortie
        movementType: movementType || 'reception', // Type de mouvement
        reason: reason || '', // Raison du mouvement
        location: location || 'central', // Localisation
        uid: currentUser.uid,
        createdAt: firebase.firestore.Timestamp.now(),
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      };
      
      const docRef = await col.add(entry);
      
      // Synchro BDC + recalc totaux
      await syncStockToBDC(ref, qtyInt);
      
      // Hook personnalisé
      if (onStockSync) {
        onStockSync({ code: ref, qty: qtyInt, type: movementType });
      }
      
      return true;
    } catch (e) {
      console.error('[StockEntry] save:', e);
      return false;
    }
  };

  // Synchro du stock vers le BDC (bdcStockMap)
  const syncStockToBDC = async (ref, qtyDelta) => {
    if (!ref || !window.bdcStockMap) return;
    
    try {
      // Mise à jour du stock disponible
      const currentStk = window.bdcStockMap[ref] || 0;
      window.bdcStockMap[ref] = Math.max(0, currentStk + qtyDelta);
      
      // Persister dans Firestore (même doc que la recherche produit)
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

  // Rendu du formulaire (enrichi)
  const renderForm = () => {
    const form = document.createElement('form');
    form.className = 'stk-form';
    
    // Options types de mouvement
    const movementOpts = MOVEMENT_TYPES
      .map(m => `<option value="${m.value}">${m.label}</option>`)
      .join('');
    
    // Options localisations
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
          <input 
            type="text" 
            id="stk-search" 
            class="stk-input stk-search"
            placeholder="Ex: 5410188005000 ou PRD-001"
            autocomplete="off"
          />
          <div class="stk-result" id="stk-result"></div>
        </div>
        
        <div class="stk-group">
          <label for="stk-qty">Quantité *</label>
          <input 
            type="number" 
            id="stk-qty" 
            class="stk-input stk-qty"
            min="-9999"
            step="1"
            placeholder="0"
          />
          <small class="stk-hint">Positive = entrée, négative = sortie</small>
        </div>
        
        <div class="stk-group">
          <label for="stk-reason">Raison *</label>
          <select id="stk-reason" class="stk-input stk-select">
            <option value="">-- Sélectionner --</option>
          </select>
        </div>
        
        <div class="stk-group">
          <label for="stk-location">Localisations</label>
          <select id="stk-location" class="stk-input stk-select">
            ${locationOpts}
          </select>
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
    let currentProduct = null;

    // Update raisons selon le type
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
    updateReasons(); // Init

    // Recherche produit en temps réel
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

    // Submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const search = searchInput.value.trim();
      const qty = qtyInput.value.trim();
      const movementType = typeSelect.value;
      const reason = reasonSelect.value;
      const location = locationSelect.value;
      
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
      
      const ok = await saveEntry(ean, ref, qty, name, movementType, reason, location);
      if (ok) {
        form.reset();
        resultDiv.innerHTML = '';
        currentProduct = null;
        updateReasons();
        
        // Feedback
        const msg = document.createElement('div');
        msg.className = 'stk-success';
        msg.textContent = `✓ ${name} — ${qty} pcs (${reason})`;
        form.prepend(msg);
        setTimeout(() => msg.remove(), 3000);
        
        // Reload historique
        await loadHistory();
      } else {
        alert('Erreur lors de l\'enregistrement');
      }
    });

    return form;
  };

  // Rendu de l'historique (enrichi)
  const renderHistory = () => {
    const histDiv = document.getElementById('stk-history');
    if (!histDiv) return;
    
    if (!stockHistory.length) {
      histDiv.innerHTML = '<p class="stk-empty">Aucune entrée enregistrée</p>';
      return;
    }
    
    // Grouper par date
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
          <table class="stk-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Code</th>
                <th>Type</th>
                <th>Raison</th>
                <th>Quantité</th>
              </tr>
            </thead>
            <tbody>
        `;
        items.forEach(e => {
          const movType = MOVEMENT_TYPES.find(m => m.value === e.movementType);
          const badge = movType 
            ? `<span class="stk-badge" style="background:${movType.color}">${movType.label}</span>`
            : '';
          const qtyClass = e.qty > 0 ? 'stk-qty-in' : 'stk-qty-out';
          html += `<tr>
            <td class="stk-name">${e.productName}</td>
            <td class="stk-code">${e.code || e.ean || '?'}</td>
            <td>${badge}</td>
            <td class="stk-reason">${e.reason || '–'}</td>
            <td class="stk-qty ${qtyClass}">${e.qty > 0 ? '+' : ''}${e.qty}</td>
          </tr>`;
        });
        html += `
            </tbody>
          </table>
        </div>`;
      });
    html += '</div>';
    
    histDiv.innerHTML = html;
  };

  // Rendu des totaux consolidés
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
            <div class="stk-summary-detail">
              ${locations}
            </div>
            <div class="stk-summary-count">
              ${p.countEntries} mouvement${p.countEntries > 1 ? 's' : ''}
            </div>
          </div>
        </div>
      `;
    });
    html += '</div>';
    
    summDiv.innerHTML = html;
  };

  // API publique
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
      
      // Charger les locations depuis config si disponible
      if (db && brand) {
        (async () => {
          try {
            const cfgSnap = await db.collection(`config_${brand}`).doc('locations').get();
            if (cfgSnap.exists && cfgSnap.data()?.list) {
              LOCATIONS = cfgSnap.data().list;
            }
          } catch (e) {
            console.log('[StockEntry] Locations non configurées, utilise défaut');
          }
        })();
      }
      
      // Rendu
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
      
      // Re-attach form listeners
      const form = hostEl.querySelector('.stk-form');
      const searchInput = form.querySelector('#stk-search');
      const qtyInput = form.querySelector('#stk-qty');
      const resultDiv = form.querySelector('#stk-result');
      let currentProduct = null;

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

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const search = searchInput.value.trim();
        const qty = qtyInput.value.trim();
        if (!currentProduct && !search) {
          alert('Veuillez entrer un EAN ou une référence');
          return;
        }
        if (!qty || parseInt(qty, 10) <= 0) {
          alert('Veuillez entrer une quantité valide');
          return;
        }
        const ean = currentProduct?.ean || '';
        const ref = currentProduct?.code || search;
        const name = currentProduct?.libelle || search;
        const ok = await saveEntry(ean, ref, qty, name);
        if (ok) {
          form.reset();
          resultDiv.innerHTML = '';
          currentProduct = null;
          const msg = document.createElement('div');
          msg.className = 'stk-success';
          msg.textContent = `✓ ${name} — ${qty} pcs enregistrés`;
          form.prepend(msg);
          setTimeout(() => msg.remove(), 3000);
          await loadHistory();
        } else {
          alert('Erreur lors de l\'enregistrement');
        }
      });
      
      // Charger l'historique
      loadHistory();
    },

    setDb,
    setUser,
    setBrand,
    setLocations(locs) {
      LOCATIONS = locs || LOCATIONS;
    },
    setMovementReasons(reasons) {
      Object.assign(MOVEMENT_REASONS, reasons);
    },
    onStockSync(callback) {
      onStockSync = callback;
    },
    loadHistory,
    computeSummary,
    getSummary() {
      return stockSummary;
    },
    getHistory() {
      return stockHistory;
    },
  };
})();
