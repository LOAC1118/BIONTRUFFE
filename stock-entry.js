/**
 * STOCK ENTRY MODULE — BIONTRUFFLE (v3)
 * Interface d'entrée de stock AMÉLIORÉE
 * Design moderne, productivité maximale, mobile-friendly
 */

const StockEntry = (() => {
  let hostEl = null;
  let currentBrand = 'biontruffle';
  let stockHistory = [];
  let stockSummary = {};
  let db = null;
  let currentUser = null;
  let onStockSync = null;
  let recentProducts = [];
  
  const MOVEMENT_TYPES = [
    { value: 'reception', label: 'Réception', icon: '📥', color: '#10b981' },
    { value: 'sortie', label: 'Sortie', icon: '📤', color: '#f59e0b' },
    { value: 'correction', label: 'Correction', icon: '🔧', color: '#3b82f6' },
    { value: 'ajustement', label: 'Ajustement', icon: '⚙️', color: '#8b5cf6' },
  ];

  let MOVEMENT_REASONS = {
    reception: ['Livraison fournisseur', 'Retour client', 'Stock initial', 'Correction reçu'],
    sortie: ['Vente', 'Cadeau', 'Perte', 'Obsolescence', 'Test'],
    correction: ['Différence inventaire', 'Erreur système', 'Comptage'],
    ajustement: ['Réajustement', 'Comptage', 'Régularisation'],
  };

  let LOCATIONS = ['Central', 'Grenoble', 'Périgord'];

  const loadHistory = async () => {
    if (!db || !currentBrand) return;
    try {
      const col = `stock_entries_${currentBrand}`;
      const snap = await db.collection(col).orderBy('createdAt', 'desc').limit(100).get();
      stockHistory = snap.docs.map(d => ({
        id: d.id,
        date: d.data().createdAt?.toDate?.().toLocaleDateString('fr-FR') || d.data().date,
        time: d.data().createdAt?.toDate?.().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) || '',
        ...d.data()
      }));
      
      // Extraire produits récents
      recentProducts = [];
      const seen = new Set();
      stockHistory.forEach(e => {
        if (!seen.has(e.code) && recentProducts.length < 5) {
          recentProducts.push({
            code: e.code,
            name: e.productName,
            ean: e.ean,
            lastQty: e.qty
          });
          seen.add(e.code);
        }
      });

      console.log(`✅ ${stockHistory.length} entrées chargées`);
      renderHistory();
      computeSummary();
      renderSummary();
    } catch (e) {
      console.error('❌ Erreur chargement:', e);
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
      return true;
    } catch (e) {
      console.error('❌ Erreur:', e);
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

  const getStockColor = (qty) => {
    if (qty > 0) return { color: '#10b981', bg: '#d1fae5', label: 'Entrée' };
    if (qty < 0) return { color: '#f59e0b', bg: '#fef3c7', label: 'Sortie' };
    return { color: '#6b7280', bg: '#f3f4f6', label: 'Zéro' };
  };

  const renderForm = () => {
    const form = document.createElement('form');
    form.className = 'stk-form';
    form.innerHTML = `
      <div style="padding: 2rem; background: white; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        
        <!-- HEADER -->
        <div style="margin-bottom: 2rem; border-bottom: 2px solid #f0f0f0; padding-bottom: 1.5rem;">
          <h2 style="margin: 0; font-size: 1.5rem; font-weight: 700; color: #18181b;">📦 Nouvelle Entrée Stock</h2>
          <p style="margin: 0.5rem 0 0; color: #71717a; font-size: 0.9rem;">Saisissez les informations du produit</p>
        </div>

        <!-- SECTION 1: PRODUIT -->
        <div style="margin-bottom: 2rem;">
          <div style="font-size: 0.9rem; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1rem;">📌 Identification Produit</div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #4b5563; margin-bottom: 0.5rem;">EAN / Référence *</label>
              <input type="text" id="stk-search" placeholder="Scanner ou taper" autocomplete="off" style="width: 100%; padding: 0.75rem; border: 2px solid #e4e4e7; border-radius: 8px; font-size: 1rem; font-family: monospace; transition: all 0.3s;">
            </div>
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #4b5563; margin-bottom: 0.5rem;">🏷️ Produit</label>
              <input type="text" id="stk-product-name" placeholder="Nom produit" style="width: 100%; padding: 0.75rem; border: 2px solid #e4e4e7; border-radius: 8px; font-size: 1rem; background: #f9fafb; cursor: not-allowed;" readonly>
            </div>
          </div>
          
          <div id="stk-result" style="margin-bottom: 1rem;"></div>
        </div>

        <!-- SECTION 2: MOUVEMENT -->
        <div style="margin-bottom: 2rem;">
          <div style="font-size: 0.9rem; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1rem;">🔄 Type de Mouvement</div>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem;">
            ${MOVEMENT_TYPES.map(t => `
              <label style="display: flex; align-items: center; padding: 0.75rem; border: 2px solid #e4e4e7; border-radius: 8px; cursor: pointer; background: white; transition: all 0.3s;" data-type="${t.value}">
                <input type="radio" name="type" value="${t.value}" style="margin-right: 0.5rem;" ${t.value === 'reception' ? 'checked' : ''}>
                <span style="font-weight: 600; color: #4b5563;">${t.icon} ${t.label}</span>
              </label>
            `).join('')}
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #4b5563; margin-bottom: 0.5rem;">Raison *</label>
              <select id="stk-reason" style="width: 100%; padding: 0.75rem; border: 2px solid #e4e4e7; border-radius: 8px; font-size: 1rem; background: white;">
                <option>-- Sélectionner --</option>
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #4b5563; margin-bottom: 0.5rem;">Quantité *</label>
              <input type="number" id="stk-qty" placeholder="0" style="width: 100%; padding: 0.75rem; border: 2px solid #10b981; border-radius: 8px; font-size: 1rem; font-weight: 700;" required>
            </div>
          </div>
        </div>

        <!-- SECTION 3: INFOS COMPLÉMENTAIRES -->
        <div style="margin-bottom: 2rem; padding: 1.5rem; background: #f9fafb; border-radius: 8px; border: 1px solid #e4e4e7;">
          <div style="font-size: 0.9rem; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1rem;">💾 Détails (Optionnel)</div>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #4b5563; margin-bottom: 0.5rem;">Localisation</label>
              <select id="stk-location" style="width: 100%; padding: 0.75rem; border: 1px solid #e4e4e7; border-radius: 6px; font-size: 0.95rem; background: white;">
                ${LOCATIONS.map(l => `<option value="${l}">${l}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #4b5563; margin-bottom: 0.5rem;">Prix d'achat (€)</label>
              <input type="number" id="stk-prix" placeholder="0.00" step="0.01" style="width: 100%; padding: 0.75rem; border: 1px solid #e4e4e7; border-radius: 6px; font-size: 0.95rem;">
            </div>
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #4b5563; margin-bottom: 0.5rem;">DDM</label>
              <input type="date" id="stk-ddm" style="width: 100%; padding: 0.75rem; border: 1px solid #e4e4e7; border-radius: 6px; font-size: 0.95rem;">
            </div>
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #4b5563; margin-bottom: 0.5rem;">N° LOT</label>
              <input type="text" id="stk-lot" placeholder="LOT-2024-001" style="width: 100%; padding: 0.75rem; border: 1px solid #e4e4e7; border-radius: 6px; font-size: 0.95rem;">
            </div>
          </div>
        </div>

        <!-- ACTIONS -->
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <button type="submit" style="flex: 1; min-width: 150px; padding: 1rem; background: #10b981; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 1rem; cursor: pointer; transition: all 0.3s;">✅ Enregistrer</button>
          <button type="button" id="stk-scanner-toggle" style="flex: 1; min-width: 150px; padding: 1rem; background: #2196F3; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 1rem; cursor: pointer; transition: all 0.3s;">📱 Scanner</button>
        </div>
        
        <div id="stk-scanner-host"></div>
      </div>
    `;
    return form;
  };

  const renderSummary = () => {
    const summDiv = document.getElementById('stk-summary');
    if (!summDiv) return;
    
    const keys = Object.keys(stockSummary).slice(0, 6);
    
    if (keys.length === 0) {
      summDiv.innerHTML = '<div style="text-align: center; padding: 2rem; color: #99999a;">📦 Aucun produit</div>';
      return;
    }
    
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">';
    keys.forEach(code => {
      const data = stockSummary[code];
      const sc = getStockColor(data.qty);
      html += `
        <div style="background: white; border: 1px solid #e4e4e7; border-radius: 12px; padding: 1.25rem; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: all 0.3s;">
          <div style="font-size: 0.8rem; font-weight: 600; color: #71717a; margin-bottom: 0.5rem; word-break: break-all;">${code}</div>
          <div style="font-size: 0.9rem; color: #4b5563; margin-bottom: 0.75rem; line-height: 1.3; min-height: 2.4rem;">${data.name}</div>
          <div style="font-size: 1.75rem; font-weight: 700; color: ${sc.color}; margin-bottom: 0.5rem;">
            ${data.qty > 0 ? '📈' : data.qty < 0 ? '📉' : '⏸️'} ${data.qty > 0 ? '+' : ''}${data.qty}
          </div>
          ${data.prix ? `<div style="font-size: 0.85rem; color: #3b82f6; font-weight: 600;">€${data.prix.toFixed(2)}</div>` : ''}
        </div>
      `;
    });
    html += '</div>';
    summDiv.innerHTML = html;
  };

  const renderHistory = () => {
    const histDiv = document.getElementById('stk-history');
    if (!histDiv) return;
    
    if (stockHistory.length === 0) {
      histDiv.innerHTML = '<div style="text-align: center; padding: 2rem; color: #999;">📋 Aucun historique</div>';
      return;
    }
    
    let html = '';
    let currentDate = '';
    
    stockHistory.slice(0, 30).forEach(e => {
      if (e.date !== currentDate) {
        if (currentDate) html += '</div>';
        currentDate = e.date;
        html += `<div style="margin-bottom: 1.5rem;"><div style="font-weight: 700; font-size: 0.95rem; color: #3b82f6; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 2px solid #dbeafe;">📅 ${e.date}</div><div style="display: flex; flex-direction: column; gap: 0.75rem;">`;
      }
      
      const type = MOVEMENT_TYPES.find(t => t.value === e.movementType);
      const sc = getStockColor(e.qty);
      
      html += `
        <div style="display: flex; gap: 1rem; align-items: flex-start; padding: 0.75rem; background: ${sc.bg}; border-left: 4px solid ${sc.color}; border-radius: 6px; font-size: 0.9rem;">
          <div style="font-size: 1.5rem; flex-shrink: 0;">${type?.icon || '📦'}</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #18181b;">${e.productName}</div>
            <div style="color: #71717a; font-size: 0.8rem; margin-top: 0.25rem;">${e.code || e.ean} • ${e.reason} • ${e.time || ''}</div>
            <div style="color: ${sc.color}; font-weight: 700; margin-top: 0.5rem;">
              ${e.qty > 0 ? '+' : ''}${e.qty} | €${e.prixAchat || '-'} | DDM: ${e.ddm || '-'} | LOT: ${e.numLot || '-'}
            </div>
          </div>
        </div>
      `;
    });
    
    if (currentDate) html += '</div></div>';
    histDiv.innerHTML = html;
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
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; padding: 2rem; max-width: 1400px;">
          <!-- GAUCHE: FORMULAIRE -->
          <div id="stk-form-panel"></div>
          
          <!-- DROITE: STATS + HISTORIQUE -->
          <div>
            <div style="margin-bottom: 2rem;">
              <div style="font-size: 1.2rem; font-weight: 700; color: #18181b; margin-bottom: 1rem;">📊 Stock Récent</div>
              <div id="stk-summary"></div>
            </div>
            
            <div>
              <div style="font-size: 1.2rem; font-weight: 700; color: #18181b; margin-bottom: 1rem;">📋 Dernières entrées</div>
              <div id="stk-history" style="max-height: 500px; overflow-y: auto;"></div>
            </div>
          </div>
        </div>
      `;

      document.getElementById('stk-form-panel').appendChild(renderForm());
      
      // Gestion du formulaire
      const form = hostEl.querySelector('.stk-form');
      const typeSelect = hostEl.querySelector('input[name="type"]');
      const reasonSelect = hostEl.querySelector('#stk-reason');
      const typeRadios = hostEl.querySelectorAll('input[name="type"]');
      
      typeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
          const type = radio.value;
          reasonSelect.innerHTML = '<option>-- Sélectionner --</option>' + 
            (MOVEMENT_REASONS[type] || []).map(r => `<option>${r}</option>`).join('');
        });
      });

      // Init raisons
      reasonSelect.innerHTML = '<option>-- Sélectionner --</option>' + 
        (MOVEMENT_REASONS['reception'] || []).map(r => `<option>${r}</option>`).join('');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const search = hostEl.querySelector('#stk-search').value.trim();
        const qty = hostEl.querySelector('#stk-qty').value;
        const reason = hostEl.querySelector('#stk-reason').value;
        const prixAchat = hostEl.querySelector('#stk-prix').value;
        const ddm = hostEl.querySelector('#stk-ddm').value;
        const numLot = hostEl.querySelector('#stk-lot').value;
        const movementType = document.querySelector('input[name="type"]:checked').value;

        if (!search || !qty || reason === '-- Sélectionner --' || !movementType) {
          alert('❌ Remplissez tous les champs obligatoires');
          return;
        }

        const ok = await saveEntry(search, search, qty, search, movementType, reason, 'Central', prixAchat, ddm, numLot);
        
        if (ok) {
          // Succès
          const msg = document.createElement('div');
          msg.style.cssText = 'position: fixed; top: 2rem; right: 2rem; background: #10b981; color: white; padding: 1.5rem 2rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 1000; animation: slideIn 0.3s ease-out;';
          msg.innerHTML = `✅ <strong>${search}</strong> — ${qty} pcs enregistrés!`;
          document.body.appendChild(msg);
          
          form.reset();
          document.querySelector('input[value="reception"]').checked = true;
          setTimeout(() => msg.remove(), 3000);
          
          await loadHistory();
        } else {
          alert('❌ Erreur lors de l\'enregistrement');
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
    getSummary() { return stockSummary; },
    getHistory() { return stockHistory; },
  };
})();
