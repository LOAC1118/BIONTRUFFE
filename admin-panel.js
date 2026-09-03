/**
 * ADMIN PANEL — Gestion complète des comptes et permissions
 * Version pro avec vue liste, création, édition, suppression
 */

const AdminPanel = (() => {
  let hostEl = null;
  let db = null;
  let auth = null;
  let currentUser = null;
  let accounts = [];
  let editingAccount = null;

  const ADMIN_EMAIL = 'spoto.christophe@gmail.com';

  const ROLES = [
    { value: 'admin', label: '👑 Admin (Accès complet)', color: '#dc2626' },
    { value: 'manager', label: '👔 Manager (Gestion)', color: '#f59e0b' },
    { value: 'operator', label: '👤 Opérateur (Saisie)', color: '#3b82f6' },
    { value: 'viewer', label: '👁️ Lecteur (Lecture)', color: '#6b7280' }
  ];

  const PERMISSIONS = {
    admin: ['read', 'write', 'delete', 'manage_users', 'export'],
    manager: ['read', 'write', 'delete', 'export'],
    operator: ['read', 'write', 'export'],
    viewer: ['read']
  };

  const MODULES = [
    { id: 'clients', label: 'Clients', icon: '👥' },
    { id: 'stock', label: 'Stock', icon: '📦' },
    { id: 'bdc', label: 'Commandes', icon: '📋' },
    { id: 'bl', label: 'Livraisons', icon: '🚚' },
    { id: 'factures', label: 'Factures', icon: '📄' }
  ];

  const loadAccounts = async () => {
    if (!db) return;
    try {
      const snap = await db.collection('accounts_biontruffle').get();
      accounts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          if (a.email === ADMIN_EMAIL) return -1;
          if (b.email === ADMIN_EMAIL) return 1;
          return (a.email || '').localeCompare(b.email || '');
        });
      console.log('✅ Comptes chargés:', accounts.length);
    } catch (e) {
      console.error('❌ Erreur chargement comptes:', e);
      accounts = [];
    }
    render();
  };

  const createAccount = async (data) => {
    if (!db || !auth) {
      alert('❌ Firestore ou Auth non disponible');
      return false;
    }

    if (!data.email || !data.displayName) {
      alert('❌ Email et nom obligatoires');
      return false;
    }

    try {
      console.log('📝 Création compte:', data.email);

      // Créer utilisateur Firebase Auth
      const userCred = await auth.createUserWithEmailAndPassword(data.email, data.password);
      const uid = userCred.user.uid;
      console.log('✅ Auth créé:', uid);

      // Créer document Firestore
      await db.collection('accounts_biontruffle').doc(data.email).set({
        uid: uid,
        email: data.email,
        displayName: data.displayName,
        role: data.role || 'operator',
        modules: data.modules || MODULES.map(m => m.id),
        permissions: PERMISSIONS[data.role || 'operator'],
        createdAt: new Date(),
        createdBy: currentUser?.email,
        status: 'active'
      });

      console.log('✅ Document Firestore créé');
      await loadAccounts();
      alert(`✅ Compte créé: ${data.email}\n(Rôle: ${data.role})`);
      return true;
    } catch (e) {
      console.error('❌ Erreur création:', e);
      alert(`❌ Erreur: ${e.message}`);
      return false;
    }
  };

  const updateAccount = async (email, data) => {
    if (!db) return false;

    try {
      console.log('✏️ Modification:', email);
      
      await db.collection('accounts_biontruffle').doc(email).update({
        displayName: data.displayName,
        role: data.role,
        modules: data.modules,
        permissions: PERMISSIONS[data.role],
        updatedAt: new Date(),
        updatedBy: currentUser?.email
      });

      console.log('✅ Compte modifié');
      await loadAccounts();
      alert(`✅ Compte ${email} modifié`);
      editingAccount = null;
      return true;
    } catch (e) {
      console.error('❌ Erreur modification:', e);
      alert(`❌ Erreur: ${e.message}`);
      return false;
    }
  };

  const deleteAccount = async (email) => {
    if (email === ADMIN_EMAIL) {
      alert('❌ Impossible de supprimer le compte admin principal!');
      return false;
    }

    if (!confirm(`⚠️ Êtes-vous sûr de supprimer ${email}?\nCette action est irréversible!`)) {
      return false;
    }

    if (!db) return false;

    try {
      console.log('🗑️ Suppression:', email);
      
      // Supprimer de Firestore
      await db.collection('accounts_biontruffle').doc(email).delete();
      
      console.log('✅ Compte supprimé');
      await loadAccounts();
      alert(`✅ Compte ${email} supprimé`);
      return true;
    } catch (e) {
      console.error('❌ Erreur suppression:', e);
      alert(`❌ Erreur: ${e.message}`);
      return false;
    }
  };

  const getRoleInfo = (role) => {
    return ROLES.find(r => r.value === role) || ROLES[2];
  };

  const renderAccountsList = () => {
    if (accounts.length === 0) {
      return `
        <div style="text-align: center; padding: 3rem 1rem; color: #71717a;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">📋</div>
          <div style="font-size: 1rem; font-weight: 600;">Aucun compte</div>
          <div style="font-size: 0.9rem; margin-top: 0.5rem;">Créez un nouveau compte pour commencer</div>
        </div>
      `;
    }

    return accounts.map(acc => {
      const roleInfo = getRoleInfo(acc.role);
      const isAdmin = acc.email === ADMIN_EMAIL;
      const createdDate = acc.createdAt?.toDate?.().toLocaleDateString('fr-FR') || '?';

      return `
        <div style="background: white; border: 1px solid #e4e4e7; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
            <div style="flex: 1;">
              <div style="font-size: 1rem; font-weight: 700; color: #18181b;">${acc.displayName || 'Sans nom'}</div>
              <div style="font-size: 0.85rem; color: #71717a; margin-top: 0.25rem;">${acc.email}</div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <span style="background: ${roleInfo.color}20; color: ${roleInfo.color}; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600; white-space: nowrap;">${roleInfo.label}</span>
              ${isAdmin ? '<span style="background: #dbeafe; color: #1e40af; padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.75rem; font-weight: 700;">🔐 PRINCIPAL</span>' : ''}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.85rem; color: #71717a; margin-bottom: 1rem; padding: 1rem; background: #f9fafb; border-radius: 8px;">
            <div>
              <div style="font-weight: 600; color: #4b5563;">Créé le:</div>
              <div>${createdDate}</div>
            </div>
            <div>
              <div style="font-weight: 600; color: #4b5563;">Modules:</div>
              <div>${(acc.modules || []).length}/${MODULES.length}</div>
            </div>
            <div>
              <div style="font-weight: 600; color: #4b5563;">Permissions:</div>
              <div>${(acc.permissions || []).length} droits</div>
            </div>
            <div>
              <div style="font-weight: 600; color: #4b5563;">Statut:</div>
              <div>${acc.status === 'active' ? '🟢 Actif' : '⚪ Inactif'}</div>
            </div>
          </div>

          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
            ${!isAdmin ? `
              <button onclick="AdminPanel.editAccount('${acc.email}')" style="flex: 1; min-width: 120px; padding: 0.75rem; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s;">✏️ Modifier</button>
              <button onclick="AdminPanel.deleteAccount('${acc.email}')" style="flex: 1; min-width: 120px; padding: 0.75rem; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s;">🗑️ Supprimer</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  };

  const renderCreateForm = () => {
    return `
      <div style="background: white; border: 1px solid #e4e4e7; border-radius: 12px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <div style="font-size: 1.3rem; font-weight: 700; margin-bottom: 1.5rem; color: #18181b;">➕ Nouveau Compte</div>

        <form id="create-account-form" style="display: grid; gap: 1.25rem;">
          <div>
            <label style="display: block; font-size: 0.9rem; font-weight: 600; color: #4b5563; margin-bottom: 0.5rem;">📧 Email *</label>
            <input type="email" id="new-email" placeholder="utilisateur@example.com" style="width: 100%; padding: 0.75rem; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 1rem; font-family: inherit;" required>
          </div>

          <div>
            <label style="display: block; font-size: 0.9rem; font-weight: 600; color: #4b5563; margin-bottom: 0.5rem;">👤 Nom complet *</label>
            <input type="text" id="new-name" placeholder="Jean Dupont" style="width: 100%; padding: 0.75rem; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 1rem; font-family: inherit;" required>
          </div>

          <div>
            <label style="display: block; font-size: 0.9rem; font-weight: 600; color: #4b5563; margin-bottom: 0.5rem;">🔐 Mot de passe *</label>
            <input type="password" id="new-password" placeholder="Min. 6 caractères" style="width: 100%; padding: 0.75rem; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 1rem; font-family: inherit;" required minlength="6">
          </div>

          <div>
            <label style="display: block; font-size: 0.9rem; font-weight: 600; color: #4b5563; margin-bottom: 0.5rem;">👑 Rôle *</label>
            <select id="new-role" style="width: 100%; padding: 0.75rem; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 1rem; font-family: inherit;">
              ${ROLES.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
            </select>
          </div>

          <div>
            <label style="display: block; font-size: 0.9rem; font-weight: 600; color: #4b5563; margin-bottom: 0.75rem;">📦 Modules autorisés</label>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem;">
              ${MODULES.map(m => `
                <label style="display: flex; align-items: center; padding: 0.75rem; background: #f3f4f6; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: all 0.3s;">
                  <input type="checkbox" value="${m.id}" class="module-checkbox" checked style="margin-right: 0.5rem; cursor: pointer;">
                  <span>${m.icon} ${m.label}</span>
                </label>
              `).join('')}
            </div>
          </div>

          <button type="submit" style="padding: 1rem; background: #16a34a; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 1rem; transition: all 0.3s;">✅ Créer le compte</button>
        </form>
      </div>
    `;
  };

  const render = () => {
    if (!hostEl) return;

    hostEl.innerHTML = `
      <div style="padding: 2rem; max-width: 1200px; margin: 0 auto;">
        <div style="margin-bottom: 2rem;">
          <div style="font-size: 2rem; font-weight: 700; color: #18181b; display: flex; align-items: center; gap: 1rem;">
            🔐 Gestion des Comptes
            <span style="font-size: 0.8rem; background: #dbeafe; color: #1e40af; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600;">Admin Only</span>
          </div>
          <div style="font-size: 0.95rem; color: #71717a; margin-top: 0.5rem;">Créez, modifiez et gérez les comptes utilisateurs</div>
        </div>

        ${renderCreateForm()}

        <div style="margin-bottom: 2rem;">
          <div style="font-size: 1.3rem; font-weight: 700; margin-bottom: 1.5rem; color: #18181b;">👥 Comptes existants (${accounts.length})</div>
          ${renderAccountsList()}
        </div>
      </div>
    `;

    // Attach event listener
    const form = document.getElementById('create-account-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const modules = Array.from(document.querySelectorAll('.module-checkbox:checked'))
          .map(cb => cb.value);

        const ok = await createAccount({
          email: document.getElementById('new-email').value,
          displayName: document.getElementById('new-name').value,
          password: document.getElementById('new-password').value,
          role: document.getElementById('new-role').value,
          modules: modules.length > 0 ? modules : MODULES.map(m => m.id)
        });

        if (ok) {
          form.reset();
        }
      });
    }
  };

  return {
    mount(selector, database, authObj, user) {
      hostEl = typeof selector === 'string' ? document.querySelector(selector) : selector;
      db = database;
      auth = authObj;
      currentUser = user;
      
      if (!hostEl) {
        console.error('[AdminPanel] Host element not found:', selector);
        return;
      }

      if (!db || !auth) {
        console.error('[AdminPanel] Firestore or Auth not provided');
        hostEl.innerHTML = '<div style="padding: 2rem; color: #ef4444;">❌ Firestore ou Auth non configuré</div>';
        return;
      }

      if (currentUser?.email !== ADMIN_EMAIL) {
        hostEl.innerHTML = '<div style="padding: 2rem; color: #ef4444;">❌ Accès réservé aux administrateurs</div>';
        return;
      }

      loadAccounts();
    },

    editAccount(email) {
      console.log('📝 Édition:', email);
      // TODO: Implémenter l'édition
      alert('⚠️ Édition non implémentée (bientôt)');
    },

    deleteAccount(email) {
      return deleteAccount(email);
    },

    async refresh() {
      await loadAccounts();
    }
  };
})();
