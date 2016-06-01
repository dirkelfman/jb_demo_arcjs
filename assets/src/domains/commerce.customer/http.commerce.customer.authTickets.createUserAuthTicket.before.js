var TokenFactory = require('../TokenFactory');

module.exports = function(context, callback) {
    var authInfo = context.request.params.userAuthInfo;
    console.log('before', authInfo);
    try {
        var token = TokenFactory.create(context).decryptTicket(authInfo.password);
        console.log( token);
        authInfo.password = token.password;
        authInfo.username = token.username;
    } catch (e) {
        console.log(e);
    }
    console.log('after', authInfo);
    callback();
};
