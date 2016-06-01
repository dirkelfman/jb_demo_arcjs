/**
 * This is a scaffold for unit tests for the custom function for
 * `http.commerce.customer.authTickets.createUserAuthTicket.before`.
 * Modify the test conditions below. You may:
 *  - add special assertions for code actions from Simulator.assert
 *  - create a mock context with Simulator.context() and modify it
 *  - use and modify mock Mozu business objects from Simulator.fixtures
 *  - use Express to simulate request/response pairs
 */

'use strict';

var Simulator = require('mozu-action-simulator');
var assert = Simulator.assert;

var actionName = 'http.storefront.routes';

describe('http.commerce.customer.authTickets.createUserAuthTicket.before implementing http.commerce.customer.authTickets.createUserAuthTicket.before', function () {

  var action;

  before(function () {
    action = require('../src/domains/commerce.customer/http.commerce.customer.authTickets.createUserAuthTicket.before');
  });

  it('runs successfully', function(done) {

    var callback = function(err) {
      assert.ok(!err, "Callback was called with an error: " + err);
      // more assertions
      done();
    };

    var context = Simulator.context(actionName, callback);



    Simulator.simulate(actionName, action, context, callback);
  });
});
