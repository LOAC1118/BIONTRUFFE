/**
 * BDC MANAGER — BIO N TRUFFE (v1)
 * Gestion des bons de commande + Transformation en facture
 * IIFE self-contained, styles `bdc-`, API `BDCManager.mount()`
 */

const BDCManager = (() => {
  let hostEl = null;
  let db = null;
  let currentUser = null;
  let bdcs = [];
  let selectedBDC = null;
  
  let viewMode = 'list'; // 'list', 'detail', 'to-invoice'
  
  // Charger les BDC
  const loadBDCs = async () => {
    try {
      const snapshot = await db.collection('bdc_biontruffle')
        .orderBy('createdAt', 'desc')
        .get();
      bdcs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date()
      }));
      return bdcs;
    } catch (e) {
      console.error('Erreur chargement BDCs:', e);
      return [];
    }
  };
  
  // Afficher liste BDCs
  const renderListView = (container) => {
    if (!bdcs.length) {
      container.innerHTML = `
        <div class="bdc-empty">
          <div class="bdc-empty-icon">📋</div>
          <div class="bdc-empty-text">Aucun bon de commande</div>
        </div>
      `;
      return;
    }
    
    const html = `
      <div class="bdc-list">
        <div class="bdc-list-header">
          <div class="bdc-search-box">
            <input type="text" id="bdc-search" class="bdc-search" placeholder="🔍 Rechercher un BDC..." />
          </div>
        </div>
        
        <table class="bdc-table">
          <thead>
            <tr>
              <th>Numéro</th>
              <th>Client</th>
              <th>Date</th>
              <th>Montant HT</th>
              <th>Montant TTC</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="bdc-tbody">
            ${bdcs.map(b => {
              const montantTTC = b.montantHT + (b.montantHT * b.tvaPct / 100);
              const statusBadge = {
                'draft': '<span class="bdc-status bdc-status-draft">Brouillon</span>',
                'sent': '<span class="bdc-status bdc-status-sent">Envoyé</span>',
                'converted_to_invoice': '<span class="bdc-status bdc-status-invoice">Facture</span>'
              }[b.status] || '<span class="bdc-status bdc-status-draft">Inconnu</span>';
              
              return `
                <tr class="bdc-row" data-id="${b.id}">
                  <td class="bdc-numero">${b.numero}</td>
                  <td class="bdc-client">${b.clientNom}</td>
                  <td class="bdc-date">${new Date(b.date).toLocaleDateString('fr-FR')}</td>
                  <td class="bdc-amount">${b.montantHT.toFixed(2)} €</td>
                  <td class="bdc-amount bdc-amount-ttc">${montantTTC.toFixed(2)} €</td>
                  <td>${statusBadge}</td>
                  <td class="bdc-actions">
                    <button class="bdc-btn bdc-btn-small bdc-btn-view" onclick="BDCManager.viewBDC('${b.id}')">👁️</button>
                    ${b.status !== 'converted_to_invoice' ? `
                      <button class="bdc-btn bdc-btn-small bdc-btn-invoice" onclick="BDCManager.convertToInvoice('${b.id}')">🧾</button>
                    ` : ''}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    
    container.innerHTML = html;
    
    const searchInput = container.querySelector('#bdc-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        container.querySelectorAll('.bdc-row').forEach(row => {
          const numero = row.querySelector('.bdc-numero').textContent.toLowerCase();
          const client = row.querySelector('.bdc-client').textContent.toLowerCase();
          const match = numero.includes(query) || client.includes(query);
          row.style.display = match ? '' : 'none';
        });
      });
    }
  };
  
  // Afficher détail BDC
  const renderDetailView = (container, bdc) => {
    selectedBDC = bdc;
    const montantTTC = bdc.montantHT + (bdc.montantHT * bdc.tvaPct / 100);
    
    const html = `
      <div class="bdc-detail">
        <div class="bdc-detail-header">
          <button class="bdc-back-btn" onclick="BDCManager.backToList()">← Retour</button>
          <div class="bdc-detail-title">BDC ${bdc.numero}</div>
        </div>
        
        <div class="bdc-detail-card">
          <div class="bdc-detail-section">
            <div class="bdc-detail-label">Client</div>
            <div class="bdc-detail-value">${bdc.clientNom}</div>
          </div>
          
          <div class="bdc-detail-grid">
            <div class="bdc-detail-section">
              <div class="bdc-detail-label">Email</div>
              <div class="bdc-detail-value">${bdc.clientEmail}</div>
            </div>
            
            <div class="bdc-detail-section">
              <div class="bdc-detail-label">Adresse</div>
              <div class="bdc-detail-value">${bdc.clientAdresse || '-'}</div>
            </div>
            
            <div class="bdc-detail-section">
              <div class="bdc-detail-label">Ville</div>
              <div class="bdc-detail-value">${bdc.clientVille || '-'} ${bdc.clientCodepostal || ''}</div>
            </div>
            
            <div class="bdc-detail-section">
              <div class="bdc-detail-label">Date</div>
              <div class="bdc-detail-value">${new Date(bdc.date).toLocaleDateString('fr-FR')}</div>
            </div>
          </div>
        </div>
        
        <div class="bdc-detail-card">
          <div class="bdc-detail-label">Description</div>
          <div class="bdc-detail-text">${bdc.description || '-'}</div>
        </div>
        
        <div class="bdc-detail-card">
          <div class="bdc-detail-amounts">
            <div class="bdc-amount-line">
              <span>Montant HT:</span>
              <span class="bdc-amount-value">${bdc.montantHT.toFixed(2)} €</span>
            </div>
            <div class="bdc-amount-line">
              <span>TVA (${bdc.tvaPct}%):</span>
              <span class="bdc-amount-value">${(bdc.montantHT * bdc.tvaPct / 100).toFixed(2)} €</span>
            </div>
            <div class="bdc-amount-line bdc-amount-line-ttc">
              <span>Montant TTC:</span>
              <span class="bdc-amount-value bdc-amount-value-ttc">${montantTTC.toFixed(2)} €</span>
            </div>
          </div>
        </div>
        
        <div class="bdc-detail-actions">
          ${bdc.status !== 'converted_to_invoice' ? `
            <button class="bdc-btn bdc-btn-primary" onclick="BDCManager.convertToInvoice('${bdc.id}')">
              🧾 Transformer en Facture
            </button>
          ` : `
            <div class="bdc-status bdc-status-invoice" style="padding: 0.5rem 1rem; border-radius: 6px; text-align: center;">
              ✅ Transformé en facture
            </div>
          `}
          <button class="bdc-btn bdc-btn-secondary" onclick="BDCManager.backToList()">Retour</button>
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  };
  
  // Transformer en facture
  const renderInvoiceView = (container, bdc) => {
    selectedBDC = bdc;
    const montantTTC = bdc.montantHT + (bdc.montantHT * bdc.tvaPct / 100);
    
    const html = `
      <div class="bdc-invoice">
        <div class="bdc-invoice-header">
          <button class="bdc-back-btn" onclick="BDCManager.viewBDC('${bdc.id}')">← Retour</button>
          <div class="bdc-invoice-title">Transformer en Facture</div>
        </div>
        
        <form class="bdc-invoice-form" id="bdc-invoice-form">
          <div class="bdc-invoice-info">
            <div class="bdc-info-line">
              <span class="bdc-info-label">BDC:</span>
              <span class="bdc-info-value">${bdc.numero}</span>
            </div>
            <div class="bdc-info-line">
              <span class="bdc-info-label">Client:</span>
              <span class="bdc-info-value">${bdc.clientNom}</span>
            </div>
          </div>
          
          <div class="bdc-form-group">
            <label class="bdc-label">Numéro de Facture</label>
            <input type="text" id="inv-numero" class="bdc-input" placeholder="FAC-2026-001" required />
          </div>
          
          <div class="bdc-form-group">
            <label class="bdc-label">Date de Facture</label>
            <input type="date" id="inv-date" class="bdc-input" value="${new Date().toISOString().split('T')[0]}" required />
          </div>
          
          <div class="bdc-form-group">
            <label class="bdc-label">Commentaires (optionnel)</label>
            <textarea id="inv-notes" class="bdc-textarea" placeholder="Notes supplémentaires..."></textarea>
          </div>
          
          <div class="bdc-invoice-summary">
            <div class="bdc-summary-line">Montant HT: <strong>${bdc.montantHT.toFixed(2)} €</strong></div>
            <div class="bdc-summary-line">TVA (${bdc.tvaPct}%): <strong>${(bdc.montantHT * bdc.tvaPct / 100).toFixed(2)} €</strong></div>
            <div class="bdc-summary-line bdc-summary-ttc">Montant TTC: <strong>${montantTTC.toFixed(2)} €</strong></div>
          </div>
          
          <div class="bdc-form-actions">
            <button type="submit" class="bdc-btn bdc-btn-primary">✅ Créer la Facture</button>
            <button type="button" class="bdc-btn bdc-btn-secondary" onclick="BDCManager.viewBDC('${bdc.id}')">Annuler</button>
          </div>
        </form>
      </div>
    `;
    
    container.innerHTML = html;
    
    const form = container.querySelector('#bdc-invoice-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const invoice = {
        numero: form.querySelector('#inv-numero').value,
        date: form.querySelector('#inv-date').value,
        bdcNumero: bdc.numero,
        bdcId: bdc.id,
        clientEmail: bdc.clientEmail,
        clientNom: bdc.clientNom,
        clientAdresse: bdc.clientAdresse || '',
        clientCodepostal: bdc.clientCodepostal || '',
        clientVille: bdc.clientVille || '',
        montantHT: bdc.montantHT,
        tvaPct: bdc.tvaPct,
        notes: form.querySelector('#inv-notes').value,
        createdAt: firebase.firestore.Timestamp.now(),
        createdBy: currentUser.email,
        status: 'draft'
      };
      
      saveInvoice(bdc.id, invoice);
    });
  };
  
  // Sauvegarder facture
  const saveInvoice = async (bdcId, invoice) => {
    try {
      // Créer la facture
      const invRef = await db.collection('factures_biontruffle').add(invoice);
      
      // Mettre à jour le status du BDC
      await db.collection('bdc_biontruffle').doc(bdcId).update({
        status: 'converted_to_invoice',
        invoiceId: invRef.id,
        invoiceNumero: invoice.numero,
        convertedAt: firebase.firestore.Timestamp.now()
      });
      
      alert(`✅ Facture créée!\nNuméro: ${invoice.numero}\nID: ${invRef.id}`);
      backToList();
    } catch (e) {
      alert(`❌ Erreur: ${e.message}`);
    }
  };
  
  // Actions
  const backToList = () => {
    viewMode = 'list';
    loadBDCs().then(() => render());
  };
  
  const viewBDC = (id) => {
    const bdc = bdcs.find(b => b.id === id);
    if (bdc) {
      viewMode = 'detail';
      selectedBDC = bdc;
      render();
    }
  };
  
  const convertToInvoice = (id) => {
    const bdc = bdcs.find(b => b.id === id);
    if (bdc) {
      if (bdc.status === 'converted_to_invoice') {
        alert('Ce BDC est déjà transformé en facture');
        return;
      }
      viewMode = 'to-invoice';
      selectedBDC = bdc;
      render();
    }
  };
  
  // Rendu
  const render = () => {
    if (!hostEl) return;
    
    const container = document.createElement('div');
    container.className = 'bdc-container';
    
    switch (viewMode) {
      case 'list':
        renderListView(container);
        break;
      case 'detail':
        if (selectedBDC) renderDetailView(container, selectedBDC);
        break;
      case 'to-invoice':
        if (selectedBDC) renderInvoiceView(container, selectedBDC);
        break;
    }
    
    hostEl.innerHTML = '';
    hostEl.appendChild(container);
  };
  
  return {
    mount(selector, fb, usr) {
      hostEl = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector;
      
      if (!hostEl) {
        console.error('[BDCManager] mount: host not found');
        return;
      }
      
      if (fb) db = fb;
      if (usr) currentUser = usr;
      
      loadBDCs().then(() => render());
    },
    
    viewBDC,
    convertToInvoice,
    backToList
  };
})();
