var cryptLib = require('cryptlib');
function CryptoHelper(context) {
    this.key = cryptLib.getHashSha256((context.configuration || {}).cryptPhrase || 'password', 16);
    this.iv = (context.configuration || {}).cryptIv || '2fBrYTgZIzGjc_FI';
}
CryptoHelper.prototype.encrypt = function(input) {
    return cryptLib.encrypt(input, this.key, this.iv);
};
CryptoHelper.prototype.decrypt = function(input) {
    return cryptLib.decrypt(input, this.key, this.iv);
};

module.exports = {
    create: function(context) {
        return new CryptoHelper(context);
    }
};
