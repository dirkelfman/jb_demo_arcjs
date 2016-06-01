var EntityClient = require('mozu-node-sdk/clients/platform/entitylists/entity');
var CustomerAccountClient = require('mozu-node-sdk/clients/commerce/customer/customerAccount');
var prompt = require('prompt');
var CryptoHelper = require('../src/domains/CryptoHelper');
var mozuConfig = require('../../mozu.config.json');
mozuConfig.appKey = mozuConfig.appKey || mozuConfig.applicationKey || mozuConfig.workingApplicationKey;
var FiddlerProxy = require('mozu-node-sdk/plugins/fiddler-proxy');
prompt.start();

prompt.get([{
    name: 'tenantId',
    required: true,
    'default': mozuConfig.tenantId || mozuConfig.tenant
}, {
    name: 'appKey',
    required: true,
    'default': mozuConfig.appKey
}, {
    name: 'sharedSecret',
    'default': mozuConfig.sharedSecret
}], function(err, result) {

    if (err) {
        return;
    }
    mozuConfig.tenantId = mozuConfig.tenant = result.tenantId;
    mozuConfig.appKey = mozuConfig.applicationKey = result.appKey;
    mozuConfig.sharedSecret = result.sharedSecret;
    addAccounts();
});

function addAccounts() {
    var i = 0;
    var j = 0;
    var doc;
    var clinetConfig = {
        context: mozuConfig,
        plugins: [FiddlerProxy()]
    };
    var nameSpace = mozuConfig.appKey.substring(0, mozuConfig.appKey.indexOf('.'));
    var customerAccountClient = new CustomerAccountClient(clinetConfig);
    var entityClient = new EntityClient(clinetConfig);
    var accounts = [];
    for (i = 1; i < 5; i++) {
        accounts.push({
            password: 'password' + i,
            account: {
                emailAddress: 'sr' + i + '@jbtest.com',
                userName: 'sr' + i + '@jbtest.com',
                firstName: 'Rep' + i + 'First',
                lastName: 'Rep' + i + 'Last',
                companyOrOrganization: 'jbtest'
            }
        });
    }
    for (i = 1; i < 10; i++) {
        accounts.push({
            password: 'password' + i,
            account: {
                emailAddress: 'client' + i + '@testclient.com',
                userName: 'client' + i + '@testclient.com',
                firstName: 'Client' + i + 'First',
                lastName: 'Client' + i + 'Last',
            }
        });
    }

    // var promises = accounts.map(function(entry) {
    //     return customerAccountClient.addAccount(entry.account).then(function(res) {
    //         console.log('created ' + res.username + ' account');
    //     }).catch(function(err) {
    //         console.warn('error creating account... maybe it already exists?');
    //     });
    // });
    promises = [];

    promises.push(customerAccountClient.addAccounts(accounts).then(function(res) {
        console.log('created' + res.length + ' accounts');
    }).catch(function(err) {
        console.warn('error creating accounts... maybe they already exists?');
    }));


    var cryptoHelper = CryptoHelper.create({
        configuration: {}
    });

    for (i = 1; i < 5; i++) {
        doc = {
            entityListFullName: 'sales_reps@' + nameSpace,
            email: 'sr' + i + '@jbtest.com',
            clients: []
        };
        for (j = 1; j < 10; j++) {
            if (j % i === 0) {
                doc.clients.push({
                    email: 'client' + j + '@testclient.com',
                    description: 'Client' + j,
                    password: cryptoHelper.encrypt('password' + j),
                    segment: j % 2 === 0 ? 'east' : 'west'
                });
            }
        }

        promises.push(
            entityClient.insertEntity(doc)
                .then(function(res) {
                    console.log('created ' + res.email);
                })
                .catch(function(err) {
                    console.warn('error mzdb entry... maybe it already exists?');
                }));

    }

    Promise.all(promises);

}
