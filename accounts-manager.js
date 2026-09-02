/**
 * ACCOUNTS MANAGER — BIO N TRUFFE (v1)
 * Gestion complète des comptes et rôles (Admin, Commercial)
 * IIFE self-contained, styles `acc-`, API `AccountsManager.mount()`
 */

const AccountsManager = (() => {
  let hostEl = null;
  let db = null;
  let currentUser = null;
  let accounts = [];
  
  // Rôles disponibles
  const ROLES = {
    admin: {
      label: 'Administrateur',
      color: '#dc2626',
      description: 'Accès complet : BDC, Entrée stock, Gestion stocks & comptes',
      permissions: ['bdc', 'stock_entry', 'stock_view', 'accounts_manage']
    },
    commercial: {
      label: 'Commercial',
      color: '#16a34a',
      description: 'Visualisation : Stocks, BDC (lecture seule)',
      permissions: ['stock_view', 'bdc_view']
    }
  };

  // Charger les comptes
  const loadAccounts = async () => {
    if (!db || !currentUser) return;
    try {
      const snap = await db.collection('accounts_biontruffe').get();
      accounts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAccounts();
    } catch (e) {
      console.error('[AccountsManager] load:', e);
    }
  };

  // Créer/modifier un compte
  const saveAccount = async (email, displayName, role) => {
    if (!email || !displayName || !role) return false;
    if (!Object.keys(ROLES).includes(role)) return false;
    
    try {
      const docData = {
        email: email.toLowerCase().trim(),
        displayName: displayName.trim(),
        role: role,
        permissions: ROLES[role].permissions,
        status: 'active',
        createdAt: firebase.firestore.Timestamp.now(),
        createdBy: currentUser.uid,
      };
      
      await db.collection('accounts_biontruffe').doc(email.toLowerCase()).set(docData, { merge: true });
      console.log(`[AccountsManager] Account saved: ${email} (${role})`);
      return true;
    } catch (e) {
      console.error('[AccountsManager] save:', e);
      return false;
    }
  };

  // Supprimer un compte
  const deleteAccount = async (email) => {
    if (!email || email === currentUser.email) return false; // Protéger admin
    try {
      await db.collection('accounts_biontruffe').doc(email.toLowerCase()).delete();
      console.log(`[AccountsManager] Account deleted: ${email}`);
      return true;
    } catch (e) {
      console.error('[AccountsManager] delete:', e);
      return false;
    }
  };

  // Vérifier les permissions de l'utilisateur actuel
  const checkPermission = async (permission) => {
    if (!currentUser) return false;
    try {
      const doc = await db.collection('accounts_biontruffe').doc(currentUser.email.toLowerCase()).get();
      if (!doc.exists) return false;
      const data = doc.data();
      return (data.permissions || []).includes(permission);
    } catch (e) {
      console.error('[AccountsManager] checkPermission:', e);
      return false;
    }
  };

  // Rendre le formulaire
  const renderForm = () => {
    const form = document.createElement('form');
    form.className = 'acc-form';
    form.id = 'accounts-form';
    
    form.innerHTML = `
      <div class="acc-fieldset">
        <legend class="acc-legend">Ajouter/Modifier un compte</legend>
        
        <div class="acc-group">
          <label for="acc-email">Email *</label>
          <input type="email" id="acc-email" class="acc-input"
            placeholder="user@example.com" autocomplete="off"/>
        </div>
        
        <div class="acc-group">
          <label for="acc-name">Nom complet *</label>
          <input type="text" id="acc-name" class="acc-input"
            placeholder="Prénom Nom"/>
        </div>
        
        <div class="acc-group">
          <label for="acc-role">Rôle *</label>
          <select id="acc-role" class="acc-input acc-select">
            <option value="">-- Sélectionner --</option>
            ${Object.entries(ROLES).map(([key, role]) => 
              `<option value="${key}">${role.label}</option>`
            ).join('')}
          </select>
          <small class="acc-role-desc" id="acc-role-desc"></small>
        </div>
        
        <div class="acc-actions">
          <button type="submit" class="acc-btn acc-btn-primary">✅ Enregistrer</button>
          <button type="reset" class="acc-btn acc-btn-secondary">↻ Annuler</button>
        </div>
      </div>
    `;

    const emailInput = form.querySelector('#acc-email');
    const nameInput = form.querySelector('#acc-name');
    const roleSelect = form.querySelector('#acc-role');
    const roleDesc = form.querySelector('#acc-role-desc');

    // Mise à jour description du rôle
    roleSelect.addEventListener('change', () => {
      const role = ROLES[roleSelect.value];
      roleDesc.textContent = role ? role.description : '';
    });

    // Submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const name = nameInput.value.trim();
      const role = roleSelect.value;

      if (!email || !name || !role) {
        alert('Veuillez remplir tous les champs');
        return;
      }

      const ok = await saveAccount(email, name, role);
      if (ok) {
        form.reset();
        roleDesc.textContent = '';
        const msg = document.createElement('div');
        msg.className = 'acc-success';
        msg.textContent = `✓ Compte ${name} (${ROLES[role].label}) enregistré`;
        form.prepend(msg);
        setTimeout(() => msg.remove(), 3000);
        await loadAccounts();
      } else {
        alert('Erreur lors de l\'enregistrement');
      }
    });

    return form;
  };

  // Rendre la liste des comptes
  const renderAccounts = () => {
    const listDiv = document.getElementById('accounts-list');
    if (!listDiv) return;

    if (!accounts.length) {
      listDiv.innerHTML = '<p class="acc-empty">Aucun compte enregistré</p>';
      return;
    }

    let html = '<div class="acc-table-wrapper"><table class="acc-table"><thead><tr>' +
      '<th>Email</th><th>Nom</th><th>Rôle</th><th>Statut</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    accounts.forEach(acc => {
      const role = ROLES[acc.role];
      const badge = role ? `<span class="acc-badge" style="background:${role.color}20;color:${role.color}">${role.label}</span>` : '?';
      const canDelete = currentUser.email !== acc.email;
      
      html += `<tr>
        <td class="acc-email">${acc.email}</td>
        <td class="acc-name">${acc.displayName}</td>
        <td>${badge}</td>
        <td><span class="acc-status ${acc.status}">${acc.status === 'active' ? '🟢 Actif' : '⚫ Inactif'}</span></td>
        <td class="acc-actions-cell">
          <button class="acc-btn-icon" title="Éditer" onclick="AccountsManager.editAccount('${acc.email}')">✏️</button>
          ${canDelete ? `<button class="acc-btn-icon acc-btn-danger" title="Supprimer" onclick="AccountsManager.deleteAccountUI('${acc.email}')">🗑️</button>` : ''}
        </td>
      </tr>`;
    });

    html += '</tbody></table></div>';
    listDiv.innerHTML = html;
  };

  // API publique
  return {
    mount(selector, fb, usr) {
      hostEl = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector;
      
      if (!hostEl) {
        console.error('[AccountsManager] mount: host not found');
        return;
      }
      
      if (fb) db = fb;
      if (usr) currentUser = usr;

      // Vérifier que l'utilisateur est admin
      checkPermission('accounts_manage').then(isAdmin => {
        if (!isAdmin) {
          hostEl.innerHTML = '<div class="acc-error">❌ Accès refusé. Seuls les administrateurs peuvent gérer les comptes.</div>';
          return;
        }

        hostEl.innerHTML = `
          <div class="acc-container">
            <div class="acc-form-section">
              ${renderForm().outerHTML}
            </div>
            <div class="acc-list-section">
              <h3 class="acc-list-title">📋 Comptes enregistrés</h3>
              <div id="accounts-list" class="acc-list"></div>
            </div>
          </div>
        `;

        const form = hostEl.querySelector('#accounts-form');
        const emailInput = form.querySelector('#acc-email');
        const nameInput = form.querySelector('#acc-name');
        const roleSelect = form.querySelector('#acc-role');
        const roleDesc = form.querySelector('#acc-role-desc');

        roleSelect.addEventListener('change', () => {
          const role = ROLES[roleSelect.value];
          roleDesc.textContent = role ? role.description : '';
        });

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const email = emailInput.value.trim();
          const name = nameInput.value.trim();
          const role = roleSelect.value;

          if (!email || !name || !role) {
            alert('Veuillez remplir tous les champs');
            return;
          }

          const ok = await saveAccount(email, name, role);
          if (ok) {
            form.reset();
            roleDesc.textContent = '';
            const msg = document.createElement('div');
            msg.className = 'acc-success';
            msg.textContent = `✓ Compte ${name} (${ROLES[role].label}) enregistré`;
            form.prepend(msg);
            setTimeout(() => msg.remove(), 3000);
            await loadAccounts();
          } else {
            alert('Erreur lors de l\'enregistrement');
          }
        });

        loadAccounts();
      });
    },

    deleteAccountUI(email) {
      if (!email || email === currentUser.email) {
        alert('Impossible de supprimer ce compte');
        return;
      }
      if (confirm(`Êtes-vous sûr de vouloir supprimer le compte ${email} ?`)) {
        this.deleteAccount(email);
      }
    },

    deleteAccount(email) {
      deleteAccount(email).then(ok => {
        if (ok) {
          const msg = document.createElement('div');
          msg.className = 'acc-success';
          msg.textContent = `✓ Compte ${email} supprimé`;
          document.getElementById('accounts-list').prepend(msg);
          setTimeout(() => msg.remove(), 3000);
          loadAccounts();
        } else {
          alert('Erreur lors de la suppression');
        }
      });
    },

    editAccount(email) {
      const acc = accounts.find(a => a.email === email);
      if (!acc) return;
      document.getElementById('acc-email').value = acc.email;
      document.getElementById('acc-name').value = acc.displayName;
      document.getElementById('acc-role').value = acc.role;
      const role = ROLES[acc.role];
      document.getElementById('acc-role-desc').textContent = role ? role.description : '';
      document.getElementById('acc-email').disabled = true; // Email non modifiable
      document.querySelector('.acc-form').scrollIntoView({ behavior: 'smooth' });
    },

    checkPermission,
    getRoles: () => ROLES,
    getAccounts: () => accounts,
  };
})();
