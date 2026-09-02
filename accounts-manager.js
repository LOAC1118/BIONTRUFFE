/**
 * ACCOUNTS MANAGER — GESTION DES COMPTES (v2)
 * spoto.christophe@gmail.com = Admin automatique avec accès complet
 * Permet de créer des comptes avec droits personnalisés
 */

const AccountsManager = (() => {
  let hostEl = null;
  let db = null;
  let currentUser = null;
  let accounts = [];
  
  const ADMIN_EMAIL = 'spoto.christophe@gmail.com';
  const isAdmin = () => currentUser && currentUser.email === ADMIN_EMAIL;

  const PERMISSIONS = {
    bdc: 'Bons de Commande',
    stock_entry: 'Entrée Stock',
    stock_view: 'Voir Stocks',
    accounts_manage: 'Gérer les Comptes',
    clients_view: 'Voir Clients',
    invoices_view: 'Voir Factures',
    delivery_view: 'Voir Bons de Livraison'
  };

  const loadAccounts = async () => {
    if (!db) return;
    try {
      const snap = await db.collection('accounts_biontruffle').get();
      accounts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error('Erreur chargement comptes:', e);
      accounts = [];
    }
    render();
  };

  const saveAccount = async () => {
    const email = document.getElementById('acc-email')?.value?.trim() || '';
    const name = document.getElementById('acc-name')?.value?.trim() || '';
    const role = document.getElementById('acc-role')?.value || 'commercial';
    const selectedPerms = Array.from(document.querySelectorAll('input[name="perm"]:checked')).map(el => el.value);
    
    if (!email || !name) {
      alert('⚠️ Remplissez email et nom');
      return;
    }

    if (!selectedPerms.length) {
      alert('⚠️ Sélectionnez au moins 1 droit');
      return;
    }
    
    try {
      await db.collection('accounts_biontruffle').doc(email.toLowerCase()).set({
        email: email.toLowerCase(),
        displayName: name,
        role: role,
        status: 'active',
        permissions: selectedPerms,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: currentUser.email
      });
      
      // Réinitialiser le formulaire
      document.getElementById('acc-email').value = '';
      document.getElementById('acc-name').value = '';
      document.querySelectorAll('input[name="perm"]').forEach(el => el.checked = false);
      
      alert('✅ Compte créé avec succès');
      loadAccounts();
    } catch (e) {
      alert('❌ Erreur: ' + e.message);
    }
  };

  const deleteAccount = async (email) => {
    if (!confirm('Êtes-vous sûr? Cette action est irréversible.')) return;
    try {
      await db.collection('accounts_biontruffle').doc(email).delete();
      alert('✅ Compte supprimé');
      loadAccounts();
    } catch (e) {
      alert('❌ Erreur: ' + e.message);
    }
  };

  const render = () => {
    if (!hostEl) return;

    const adminHtml = `
      <div style="padding: 2rem; max-width: 1000px; margin: 0 auto;">
        
        <!-- HEADER -->
        <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); border-radius: 12px; padding: 2rem; margin-bottom: 2rem; color: white; text-align: center;">
          <div style="font-size: 2.5rem; font-weight: 700; margin-bottom: 0.5rem;">✅ ACCÈS COMPLET</div>
          <div style="font-size: 1.1rem; opacity: 0.95;">Bienvenue Administrateur</div>
          <div style="font-size: 0.9rem; margin-top: 0.5rem; opacity: 0.85;">${currentUser?.email}</div>
        </div>

        <!-- CRÉER COMPTE -->
        <div style="background: white; border: 1px solid #e4e4e7; border-radius: 12px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <div style="font-size: 1.3rem; font-weight: 700; margin-bottom: 1.5rem; color: #18181b;">➕ Créer un nouveau compte</div>
          
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            <!-- Email et Nom -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div>
                <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #4b5563; margin-bottom: 0.4rem;">Email *</label>
                <input type="email" id="acc-email" placeholder="user@example.com" style="width: 100%; padding: 0.75rem; border: 1px solid #e4e4e7; border-radius: 8px; font-family: inherit; font-size: 0.95rem;">
              </div>
              <div>
                <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #4b5563; margin-bottom: 0.4rem;">Nom complet *</label>
                <input type="text" id="acc-name" placeholder="Jean Dupont" style="width: 100%; padding: 0.75rem; border: 1px solid #e4e4e7; border-radius: 8px; font-family: inherit; font-size: 0.95rem;">
              </div>
            </div>

            <!-- Rôle -->
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #4b5563; margin-bottom: 0.4rem;">Rôle *</label>
              <select id="acc-role" style="width: 100%; padding: 0.75rem; border: 1px solid #e4e4e7; border-radius: 8px; font-family: inherit; font-size: 0.95rem;">
                <option value="commercial">Commercial</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <!-- Droits -->
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #4b5563; margin-bottom: 0.75rem;">Accès et Droits *</label>
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; background: #fafafa; padding: 1rem; border-radius: 8px; border: 1px solid #e4e4e7;">
                ${Object.entries(PERMISSIONS).map(([key, label]) => `
                  <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="checkbox" name="perm" value="${key}" style="cursor: pointer; width: 18px; height: 18px;">
                    <span style="font-size: 0.9rem;">${label}</span>
                  </label>
                `).join('')}
              </div>
            </div>

            <!-- Bouton créer -->
            <button onclick="AccountsManager.save()" style="padding: 0.85rem 1.5rem; background: #16a34a; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 1rem; margin-top: 0.5rem;">✅ Créer le compte</button>
          </div>
        </div>

        <!-- LISTE COMPTES -->
        <div style="background: white; border: 1px solid #e4e4e7; border-radius: 12px; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <div style="font-size: 1.3rem; font-weight: 700; margin-bottom: 1.5rem; color: #18181b;">👥 Comptes (${accounts.length})</div>
          
          ${accounts.length === 0 ? 
            '<div style="color: #71717a; text-align: center; padding: 2rem;">Aucun compte créé</div>' : 
            `<div style="display: flex; flex-direction: column; gap: 1rem;">
              ${accounts.map(acc => `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 1rem; background: #f9fafb; border: 1px solid #e4e4e7; border-radius: 8px;">
                  <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 0.95rem; color: #18181b;">${acc.displayName}</div>
                    <div style="font-size: 0.85rem; color: #71717a; margin-top: 0.25rem;">${acc.email}</div>
                    <div style="font-size: 0.8rem; color: #a1a1aa; margin-top: 0.5rem;">
                      Rôle: <span style="font-weight: 600; color: ${acc.role === 'admin' ? '#dc2626' : '#16a34a'}">${acc.role}</span>
                    </div>
                    <div style="font-size: 0.75rem; color: #a1a1aa; margin-top: 0.5rem;">
                      Droits: ${acc.permissions?.length || 0} / 7
                    </div>
                  </div>
                  <button onclick="AccountsManager.delete('${acc.email}')" style="padding: 0.5rem 1rem; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">🗑️ Supprimer</button>
                </div>
              `).join('')}
            </div>`
          }
        </div>

      </div>
    `;

    hostEl.innerHTML = adminHtml;
  };

  return {
    mount(selector, fb, usr) {
      hostEl = typeof selector === 'string' ? document.querySelector(selector) : selector;
      db = fb;
      currentUser = usr;
      if (hostEl && isAdmin()) {
        loadAccounts();
      } else if (hostEl) {
        hostEl.innerHTML = '<div style="padding: 2rem; color: #dc2626; text-align: center;">❌ Accès refusé. Seul l\'administrateur peut gérer les comptes.</div>';
      }
    },
    save: saveAccount,
    delete: deleteAccount
  };
})();
