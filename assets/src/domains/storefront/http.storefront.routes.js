var ClientService = require('../ClientService');

module.exports = function(context, callback) {
    var clientService = new ClientService(context);

    clientService.getList().then(function(res) {
        context.response.body = res;
        callback();
    }).catch(callback);
};
