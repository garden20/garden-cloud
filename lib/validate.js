module.exports = function (newDoc, oldDoc, userCtx, secObj) {
    secObj.admins = secObj.admins || {};
    secObj.admins.names = secObj.admins.names || [];
    secObj.admins.roles = secObj.admins.roles || [];


    var IS_DB_ADMIN = false;
    if(~ userCtx.roles.indexOf('_admin'))
      IS_DB_ADMIN = true;
    if(~ secObj.admins.names.indexOf(userCtx.name))
      IS_DB_ADMIN = true;
    for(var i = 0; i < userCtx.roles; i++)
      if(~ secObj.admins.roles.indexOf(userCtx.roles[i]))
        IS_DB_ADMIN = true;

    // deleting
    if (oldDoc && newDoc._deleted) {
        if (!IS_DB_ADMIN) {
            throw {
                unauthorized: 'Only the uploader can delete an existing app'
            };
        }
        // don't need to further validate a deleted document!
        return;
    }
    // updating
    if (oldDoc && !newDoc._deleted) {
        if (!IS_DB_ADMIN) {
            throw {
                unauthorized: 'Only the uploader can delete an existing app'
            };
        }
        // don't need to further validate a deleted document!
        return;
    }
}