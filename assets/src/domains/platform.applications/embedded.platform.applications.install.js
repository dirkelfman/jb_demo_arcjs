/*
 * This custom function was generated by the Actions Generator
 * in order to enable the other custom functions in this app
 * upon installation into a tenant.
 */

var ActionInstaller = require('mozu-action-helpers/installers/actions');
var EntityInstaller = require('mozu-action-helpers/installers/entities');
var salesRepsSchema = require('../../schema/sales_reps.json');

module.exports = function(context, callback) {
    var installer = new ActionInstaller({
        context: context.apiContext
    });
    var promises = [];
    var entityInstaller = new EntityInstaller(context);
    promises.push(installer.enableActions(context));
    promises.push(entityInstaller.upsertList(salesRepsSchema, context));
    Promise.all(promises).then(callback.bind(null, null), callback);
};

