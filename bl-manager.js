/**
 * BL MANAGER — BIO N TRUFFE (v1)
 * Gestion des bons de livraison
 * IIFE self-contained, styles `bl-`, API `BLManager.mount()`
 */

const BLManager = (() => {
  let hostEl = null;
  let db = null;
  let currentUser = null;
  let bls = [];
  let selectedBL = null;
  
  let viewMode = 'list'; // 'list', 'detail'
  
  // Charger les BL
  const loadBLs = async () => {
    try {
      const snapshot = await db.collection('bls_biontruffle')
        .orderBy('createdAt', 'desc')
        .get();
      bls = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date()
      }));
      return bls;
    } catch (e) {
      console.error('Erreur chargement BLs:', e);
      return [];
    }
  };
  
  // Afficher liste BLs
  const renderListView = (container) => {
    if (!bls.length) {
      container.innerHTML = `
        <div class="bl-empty">
          <div class="bl-empty-icon">🚚</div>
          <div class="bl-empty-text">Aucun bon de livraison</div>
        </div>
      `;
      return;
    }
    
    const html = `
      <div class="bl-list">
        <div class="bl-list-header">
          <div class="bl-search-box">
            <input type="text" id="bl-search" class="bl-search" placeholder="🔍 Rechercher un BL..." />
          </div>
        </div>
        
        <table class="bl-table">
          <thead>
            <tr>
              <th>Numéro</th>
              <th>Client</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="bl-tbody">
            ${bls.map(b => {
              const statusBadge = {
                'draft': '<span class="bl-status bl-status-draft">Brouillon</span>',
                'sent': '<span class="bl-status bl-status-sent">Envoyé</span>',
                'delivered': '<span class="bl-status bl-status-delivered">Livré</span>'
              }[b.status] || '<span class="bl-status bl-status-draft">Inconnu</span>';
              
              return `
                <tr class="bl-row" data-id="${b.id}">
                  <td class="bl-numero">${b.numero}</td>
                  <td class="bl-client">${b.clientNom}</td>
                  <td class="bl-date">${new Date(b.date).toLocaleDateString('fr-FR')}</td>
                  <td>${statusBadge}</td>
                  <td class="bl-actions">
                    <button class="bl-btn bl-btn-small bl-btn-view" onclick="BLManager.viewBL('${b.id}')">👁️</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    
    container.innerHTML = html;
    
    const searchInput = container.querySelector('#bl-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        container.querySelectorAll('.bl-row').forEach(row => {
          const numero = row.querySelector('.bl-numero').textContent.toLowerCase();
          const client = row.querySelector('.bl-client').textContent.toLowerCase();
          const match = numero.includes(query) || client.includes(query);
          row.style.display = match ? '' : 'none';
        });
      });
    }
  };
  
  // Afficher détail BL
  const renderDetailView = (container, bl) => {
    selectedBL = bl;
    
    const html = `
      <div class="bl-detail">
        <div class="bl-detail-header">
          <button class="bl-back-btn" onclick="BLManager.backToList()">← Retour</button>
          <div class="bl-detail-title">BL ${bl.numero}</div>
        </div>
        
        <div class="bl-detail-card">
          <div class="bl-detail-section">
            <div class="bl-detail-label">Client</div>
            <div class="bl-detail-value">${bl.clientNom}</div>
          </div>
          
          <div class="bl-detail-grid">
            <div class="bl-detail-section">
              <div class="bl-detail-label">Email</div>
              <div class="bl-detail-value">${bl.clientEmail}</div>
            </div>
            
            <div class="bl-detail-section">
              <div class="bl-detail-label">Date</div>
              <div class="bl-detail-value">${new Date(bl.date).toLocaleDateString('fr-FR')}</div>
            </div>
          </div>
        </div>
        
        <div class="bl-detail-card">
          <div class="bl-detail-label">Adresse de livraison</div>
          <div class="bl-detail-text">${bl.clientAdresse || '-'}</div>
          <div style="margin-top: 0.5rem; font-size: 0.9rem; color: #71717a;">
            ${bl.clientCodepostal || ''} ${bl.clientVille || ''}
          </div>
        </div>
        
        <div class="bl-detail-card">
          <div class="bl-detail-label">Description de la livraison</div>
          <div class="bl-detail-text">${bl.description}</div>
        </div>
        
        <div class="bl-detail-card">
          <div class="bl-detail-label">Status</div>
          <div style="margin-top: 0.5rem;">
            ${(() => {
              if (bl.status === 'draft') {
                return `<span class="bl-status bl-status-draft">Brouillon</span>`;
              } else if (bl.status === 'sent') {
                return `<span class="bl-status bl-status-sent">Envoyé</span>`;
              } else {
                return `<span class="bl-status bl-status-delivered">Livré</span>`;
              }
            })()}
          </div>
          
          <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem;">
            ${bl.status === 'draft' ? `
              <button class="bl-btn bl-btn-small" onclick="BLManager.updateStatus('${bl.id}', 'sent')" style="background: #fbbf24; color: white; border: none;">Marquer envoyé</button>
            ` : ''}
            ${bl.status === 'sent' ? `
              <button class="bl-btn bl-btn-small" onclick="BLManager.updateStatus('${bl.id}', 'delivered')" style="background: #16a34a; color: white; border: none;">Marquer livré</button>
            ` : ''}
          </div>
        </div>
        
        <div class="bl-detail-actions">
          <button class="bl-btn bl-btn-secondary" onclick="BLManager.backToList()">Retour</button>
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  };
  
  // Mettre à jour status
  const updateStatus = async (id, newStatus) => {
    try {
      await db.collection('bls_biontruffle').doc(id).update({
        status: newStatus,
        updatedAt: firebase.firestore.Timestamp.now()
      });
      alert(`✅ Status mis à jour: ${newStatus}`);
      loadBLs().then(() => render());
    } catch (e) {
      alert(`❌ Erreur: ${e.message}`);
    }
  };
  
  // Actions
  const backToList = () => {
    viewMode = 'list';
    loadBLs().then(() => render());
  };
  
  const viewBL = (id) => {
    const bl = bls.find(b => b.id === id);
    if (bl) {
      viewMode = 'detail';
      selectedBL = bl;
      render();
    }
  };
  
  // Rendu
  const render = () => {
    if (!hostEl) return;
    
    const container = document.createElement('div');
    container.className = 'bl-container';
    
    switch (viewMode) {
      case 'list':
        renderListView(container);
        break;
      case 'detail':
        if (selectedBL) renderDetailView(container, selectedBL);
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
        console.error('[BLManager] mount: host not found');
        return;
      }
      
      if (fb) db = fb;
      if (usr) currentUser = usr;
      
      loadBLs().then(() => render());
    },
    
    viewBL,
    updateStatus,
    backToList
  };
})();
