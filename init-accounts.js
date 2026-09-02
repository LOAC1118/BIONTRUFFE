/**
 * INIT ACCOUNTS — AUTO-INITIALIZATION (v2)
 * Initialise les comptes admin à la première connexion
 * Crée automatiquement le compte admin principal
 */

const InitAccounts = (() => {
  // Compte admin unique
  const ADMIN_ACCOUNT = {
    email: 'spoto.christophe@gmail.com',
    displayName: 'Christophe Spoto',
    role: 'admin'
  };
  
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
  
  // Initialiser le compte admin
  const init = async (db) => {
    if (!db) return;
    
    try {
      // Vérifier si le compte admin existe
      const adminSnapshot = await db.collection('accounts_biontruffle')
        .doc(ADMIN_ACCOUNT.email)
        .get();
      
      // Si le compte n'existe pas, le créer
      if (!adminSnapshot.exists) {
        console.log('📝 Création du compte admin principal...');
        
        await db.collection('accounts_biontruffle').doc(ADMIN_ACCOUNT.email).set({
          email: ADMIN_ACCOUNT.email,
          displayName: ADMIN_ACCOUNT.displayName,
          role: ADMIN_ACCOUNT.role,
          permissions: DEFAULT_ADMIN_PERMISSIONS,
          status: 'active',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: 'system'
        });
        
        console.log(`✅ Compte admin créé: ${ADMIN_ACCOUNT.email}`);
        console.log('✅ Initialisation terminée!');
        return true;
      } else {
        console.log('✅ Compte admin existant trouvé');
        return false;
      }
    } catch (e) {
      console.error('❌ Erreur initialisation compte admin:', e);
      return false;
    }
  };
  
  return {
    init
  };
})();
