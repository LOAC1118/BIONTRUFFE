/**
 * CLIENTS LIST — BIO N TRUFFE (v1)
 * Liste des clients + Créer BDC + Transformer en Facture
 * IIFE self-contained, styles `cli-`, API `ClientsList.mount()`
 */

const ClientsList = (() => {
  let hostEl = null;
  let db = null;
  let currentUser = null;
  let clients = [];
  let selectedClient = null;
  let bdc = null;
  
  // Mode affichage
  let viewMode = 'list'; // 'list', 'client-detail', 'bdc-creator', 'bdc-editor'
  
  // Charger les clients depuis Firestore
  const loadClients = async () => {
    try {
      const snapshot = await db.collection('clients_biontruffle').get();
      clients = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      return clients;
    } catch (e) {
      console.error('Erreur chargement clients:', e);
      return [];
    }
  };
  
  // Afficher liste clients
  const renderListView = (container) => {
    if (!clients.length) {
      container.innerHTML = `
        <div class="cli-empty">
          <div class="cli-empty-icon">📭</div>
          <div class="cli-empty-text">Aucun client trouvé</div>
          <div class="cli-empty-sub">Importez une base de clients d'abord</div>
        </div>
      `;
      return;
    }
    
    const html = `
      <div class="cli-list">
        <div class="cli-list-header">
          <div class="cli-search-box">
            <input type="text" id="cli-search" class="cli-search" placeholder="🔍 Rechercher un client..." />
          </div>
        </div>
        
        <table class="cli-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Nom</th>
              <th>Ville</th>
              <th>Contact</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="cli-tbody">
            ${clients.map(c => `
              <tr class="cli-row" data-email="${c.email}">
                <td class="cli-email">${c.email}</td>
                <td class="cli-nom">${c.nom}</td>
                <td class="cli-ville">${c.ville || '-'}</td>
                <td class="cli-contact">${c.contact || '-'}</td>
                <td class="cli-actions">
                  <button class="cli-btn cli-btn-small cli-btn-view" onclick="ClientsList.viewClient('${c.email}')">👁️ Voir</button>
                  <button class="cli-btn cli-btn-small cli-btn-bdc" onclick="ClientsList.createBDC('${c.email}')">📋 BDC</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    
    container.innerHTML = html;
    
    // Recherche
    const searchInput = container.querySelector('#cli-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        container.querySelectorAll('.cli-row').forEach(row => {
          const email = row.getAttribute('data-email').toLowerCase();
          const nom = row.querySelector('.cli-nom').textContent.toLowerCase();
          const ville = row.querySelector('.cli-ville').textContent.toLowerCase();
          const match = email.includes(query) || nom.includes(query) || ville.includes(query);
          row.style.display = match ? '' : 'none';
        });
      });
    }
  };
  
  // Afficher fiche client
  const renderClientDetail = (container, client) => {
    selectedClient = client;
    
    const html = `
      <div class="cli-detail">
        <div class="cli-detail-header">
          <button class="cli-back-btn" onclick="ClientsList.backToList()">← Retour</button>
          <div class="cli-detail-title">${client.nom}</div>
        </div>
        
        <div class="cli-detail-card">
          <div class="cli-detail-section">
            <div class="cli-detail-label">Email</div>
            <div class="cli-detail-value">${client.email}</div>
          </div>
          
          <div class="cli-detail-grid">
            <div class="cli-detail-section">
              <div class="cli-detail-label">Contact</div>
              <div class="cli-detail-value">${client.contact || '-'}</div>
            </div>
            
            <div class="cli-detail-section">
              <div class="cli-detail-label">Téléphone</div>
              <div class="cli-detail-value">${client.telephone || '-'}</div>
            </div>
            
            <div class="cli-detail-section">
              <div class="cli-detail-label">Adresse</div>
              <div class="cli-detail-value">${client.adresse || '-'}</div>
            </div>
            
            <div class="cli-detail-section">
              <div class="cli-detail-label">Ville</div>
              <div class="cli-detail-value">${client.ville || '-'}</div>
            </div>
            
            <div class="cli-detail-section">
              <div class="cli-detail-label">Code Postal</div>
              <div class="cli-detail-value">${client.codepostal || '-'}</div>
            </div>
            
            <div class="cli-detail-section">
              <div class="cli-detail-label">SIRET</div>
              <div class="cli-detail-value">${client.siret || '-'}</div>
            </div>
          </div>
        </div>
        
        <div class="cli-detail-actions">
          <button class="cli-btn cli-btn-primary" onclick="ClientsList.createBDC('${client.email}')">
            📋 Créer un Bon de Commande
          </button>
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  };
  
  // Créer BDC pour un client
  const renderBDCCreator = (container, client) => {
    selectedClient = client;
    
    const html = `
      <div class="cli-bdc">
        <div class="cli-bdc-header">
          <button class="cli-back-btn" onclick="ClientsList.backToClient()">← Retour</button>
          <div class="cli-bdc-title">Créer Bon de Commande</div>
        </div>
        
        <form class="cli-bdc-form" id="cli-bdc-form">
          <div class="cli-bdc-info">
            <div class="cli-info-line">
              <span class="cli-info-label">Client:</span>
              <span class="cli-info-value">${client.nom} (${client.email})</span>
            </div>
          </div>
          
          <div class="cli-form-group">
            <label class="cli-label">Numéro BDC</label>
            <input type="text" id="bdc-numero" class="cli-input" placeholder="BDC-2026-001" required />
          </div>
          
          <div class="cli-form-group">
            <label class="cli-label">Date</label>
            <input type="date" id="bdc-date" class="cli-input" value="${new Date().toISOString().split('T')[0]}" required />
          </div>
          
          <div class="cli-form-group">
            <label class="cli-label">Description/Observations</label>
            <textarea id="bdc-description" class="cli-textarea" placeholder="Détails de la commande..."></textarea>
          </div>
          
          <div class="cli-form-group">
            <label class="cli-label">Montant HT (€)</label>
            <input type="number" id="bdc-montant-ht" class="cli-input" step="0.01" min="0" placeholder="0.00" required />
          </div>
          
          <div class="cli-form-group">
            <label class="cli-label">TVA (%)</label>
            <input type="number" id="bdc-tva-pct" class="cli-input" step="0.01" value="20" min="0" />
          </div>
          
          <div class="cli-bdc-total">
            <div>TVA: <span id="bdc-tva-amount">0.00</span>€</div>
            <div class="cli-bdc-ttc">Montant TTC: <span id="bdc-montant-ttc">0.00</span>€</div>
          </div>
          
          <div class="cli-form-actions">
            <button type="submit" class="cli-btn cli-btn-primary">✅ Créer BDC</button>
            <button type="button" class="cli-btn cli-btn-secondary" onclick="ClientsList.backToClient()">Annuler</button>
          </div>
        </form>
      </div>
    `;
    
    container.innerHTML = html;
    
    // Calcul TVA auto
    const montantHTInput = container.querySelector('#bdc-montant-ht');
    const tvaPctInput = container.querySelector('#bdc-tva-pct');
    const tvAAmountSpan = container.querySelector('#bdc-tva-amount');
    const montantTTCSpan = container.querySelector('#bdc-montant-ttc');
    const form = container.querySelector('#cli-bdc-form');
    
    const updateTotals = () => {
      const montantHT = parseFloat(montantHTInput.value) || 0;
      const tvaPct = parseFloat(tvaPctInput.value) || 0;
      const tvaAmount = montantHT * tvaPct / 100;
      const montantTTC = montantHT + tvaAmount;
      
      tvAAmountSpan.textContent = tvaAmount.toFixed(2);
      montantTTCSpan.textContent = montantTTC.toFixed(2);
    };
    
    montantHTInput.addEventListener('input', updateTotals);
    tvaPctInput.addEventListener('input', updateTotals);
    updateTotals();
    
    // Submit
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const bdc = {
        numero: form.querySelector('#bdc-numero').value,
        date: form.querySelector('#bdc-date').value,
        clientEmail: client.email,
        clientNom: client.nom,
        clientAdresse: client.adresse || '',
        clientCodepostal: client.codepostal || '',
        clientVille: client.ville || '',
        description: form.querySelector('#bdc-description').value,
        montantHT: parseFloat(form.querySelector('#bdc-montant-ht').value) || 0,
        tvaPct: parseFloat(form.querySelector('#bdc-tva-pct').value) || 0,
        createdAt: firebase.firestore.Timestamp.now(),
        createdBy: currentUser.email,
        status: 'draft' // draft, sent, converted_to_invoice
      };
      
      saveBDC(bdc);
    });
  };
  
  // Sauvegarder BDC
  const saveBDC = async (bdc) => {
    try {
      const docRef = await db.collection('bdc_biontruffle').add(bdc);
      alert(`✅ BDC créé avec succès!\nNuméro: ${bdc.numero}\nID: ${docRef.id}`);
      backToClient();
    } catch (e) {
      alert(`❌ Erreur: ${e.message}`);
    }
  };
  
  // Retour à la liste
  const backToList = () => {
    viewMode = 'list';
    loadClients().then(() => render());
  };
  
  // Retour à la fiche client
  const backToClient = () => {
    if (selectedClient) {
      viewMode = 'client-detail';
      render();
    } else {
      backToList();
    }
  };
  
  // Afficher fiche client
  const viewClient = (email) => {
    const client = clients.find(c => c.email === email);
    if (client) {
      viewMode = 'client-detail';
      selectedClient = client;
      render();
    }
  };
  
  // Créer BDC
  const createBDC = (email) => {
    const client = clients.find(c => c.email === email);
    if (client) {
      viewMode = 'bdc-creator';
      selectedClient = client;
      render();
    }
  };
  
  // Rendu principal
  const render = () => {
    if (!hostEl) return;
    
    const container = document.createElement('div');
    container.className = 'cli-container';
    
    switch (viewMode) {
      case 'list':
        renderListView(container);
        break;
      case 'client-detail':
        if (selectedClient) renderClientDetail(container, selectedClient);
        break;
      case 'bdc-creator':
        if (selectedClient) renderBDCCreator(container, selectedClient);
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
        console.error('[ClientsList] mount: host not found');
        return;
      }
      
      if (fb) db = fb;
      if (usr) currentUser = usr;
      
      loadClients().then(() => render());
    },
    
    viewClient,
    createBDC,
    backToList,
    backToClient,
    
    render: function() {
      render();
    }
  };
})();
