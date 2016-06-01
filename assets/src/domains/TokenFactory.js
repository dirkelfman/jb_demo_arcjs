var CryptoHelper = require('./CryptoHelper');
function TokenFactory(context) {
    this.cryptoHelper = CryptoHelper.create(context);
}
TokenFactory.prototype.createToken = function(username, password) {
    var plainTextToken = JSON.stringify({
        username: username,
        password: password,
        date: new Date().getTime()
    });
    return this.cryptoHelper.encrypt(plainTextToken);
};
TokenFactory.prototype.decryptTicket = function(token) {
    var raw = this.cryptoHelper.decrypt(token);
    var jToken = JSON.parse(raw);
    var minutesOld = (new Date().getTime() - jToken.date) / (1000 * 60);
    if (minutesOld > 5) {
        throw new Error('token expired.  [' + minutesOld + 'minutes old');
    }
    return jToken;
};
module.exports = {
    create: function(context) {
        return new TokenFactory(context);
    }
};
