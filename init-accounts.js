/**
 * INIT ACCOUNTS — AUTO-INITIALIZATION (v1)
 * Initialise les comptes admin à la première connexion
 * Crée automatiquement les 2 comptes admin si absent
 */

const InitAccounts = (() => {
  // Liste des comptes admin à initialiser
  const ADMIN_ACCOUNTS = [
    {
      email: 'cspoto@moulindesmoines.com',
      displayName: 'Christophe Spoto (MDM)',
      role: 'admin'
    },
    {
      email: 'loacdev@outlook.fr',
      displayName: 'Christophe LOAC Dev',
      role: 'admin'
    }
  ];
  
  // Permissions par défaut pour les admins
  const DEFAULT_ADMIN_PERMISSIONS = [
    'bdc',
    'stock_entry',
    'stock_view',
    'accounts_manage',
    'clients_view',
    'invoices_view',
    'delivery_view'
  ];
  
  // Initialiser les comptes
  const init = async (db) => {
    if (!db) return;
    
    try {
      // Vérifier si la collection existe
      const snapshot = await db.collection('accounts_biontruffle').limit(1).get();
      
      // Si aucun compte n'existe, créer les comptes admin
      if (snapshot.empty) {
        console.log('📝 Initialisation des comptes admin...');
        
        for (const account of ADMIN_ACCOUNTS) {
          const docRef = db.collection('accounts_biontruffle').doc(account.email);
          
          await docRef.set({
            email: account.email,
            displayName: account.displayName,
            role: account.role,
            permissions: DEFAULT_ADMIN_PERMISSIONS,
            status: 'active',
            createdAt: new Date(),
            createdBy: 'system'
          });
          
          console.log(`✅ Compte créé: ${account.email}`);
        }
        
        console.log('✅ Initialisation des comptes admin terminée!');
        return true;
      } else {
        console.log('✅ Comptes existants trouvés');
        return false;
      }
    } catch (e) {
      console.error('❌ Erreur initialisation comptes:', e);
      return false;
    }
  };
  
  return {
    init
  };
})();
