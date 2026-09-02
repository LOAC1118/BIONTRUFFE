/**
 * AUTO-INIT — Initialisation automatique du CRM
 * Crée le compte admin à la première connexion
 * spoto.christophe@gmail.com = Admin automatique
 */

const AutoInit = (() => {
  const ADMIN_EMAIL = 'spoto.christophe@gmail.com';

  const initAdmin = async (db, email) => {
    if (email !== ADMIN_EMAIL) return;
    
    try {
      // Vérifier si le compte existe
      const doc = await db.collection('accounts_biontruffle').doc(email).get();
      
      if (!doc.exists) {
        console.log('📝 Création du compte admin...');
        
        // Créer le compte admin
        await db.collection('accounts_biontruffle').doc(email).set({
          email: email,
          displayName: 'Christophe Spoto - Admin',
          role: 'admin',
          status: 'active',
          permissions: [
            'bdc',
            'stock_entry',
            'stock_view',
            'accounts_manage',
            'clients_view',
            'invoices_view',
            'delivery_view'
          ],
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: 'system'
        });
        
        console.log('✅ Compte admin créé automatiquement');
      } else {
        console.log('✅ Compte admin existant');
      }
    } catch (e) {
      console.error('❌ Erreur init:', e);
    }
  };

  return {
    init: initAdmin
  };
})();
