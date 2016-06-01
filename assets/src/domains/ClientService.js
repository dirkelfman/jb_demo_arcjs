var EntityClient = require('mozu-node-sdk/clients/platform/entitylists/entity');
var CustomerAccountClient = require('mozu-node-sdk/clients/commerce/customer/customerAccount');

var getAppInfo = require('mozu-action-helpers/get-app-info');
var TokenFactory = require('./TokenFactory');
var CryptoHelper = require('./CryptoHelper');

function ClientService(context) {
    var appInfo = getAppInfo(context);
    this._context = context;
    this._entityListName = 'sales_reps@' + appInfo.namespace;
     this._westHost = (context.configuration || {}).westHost;
     this._eastHost = (context.configuration || {}).eastHost;
}

ClientService.prototype.getList = function(request) {
    var me = this;
    var user = me._context.items.pageContext.user;
    var pageSize = (request || {}).pageSize || 30;
    var page = ((request || {}).page || 1) - 1;
    var offset = pageSize * page;

    var ret = {
        total: 0,
        clients: []
    };

    if (!user || user.isAnonymous || !user.email) {
        return new Promise(function(resolve) {
            resolve(ret);
        });
    }
    var tokenFactory = TokenFactory.create(me._context);
    var cryptoHelper = CryptoHelper.create(me._context);
    var lcEmail = user.email.toLowerCase();
    var entityClient = new EntityClient({
        context: me._context.apiContext
    });

    return entityClient.getEntity({
        id: lcEmail,
        entityListFullName: me._entityListName
    }).then(function(res) {
        if (res.clients) {
            ret.total = res.clients.length;
            ret.clients = res.clients.slice(offset, offset + pageSize).map(function(customer) {
                var password = cryptoHelper.decrypt(customer.password);
                customer.token = tokenFactory.createToken(customer.email, password);
                customer.host = (customer.segment === 'east') ? me._eastHost : me._westHost;
                return customer;
            });
        }
        return ret;
    });
};


module.exports = ClientService;
