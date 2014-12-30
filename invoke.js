var Invoker = require('./lib/Invoker');
var util = require('any2api-util');
var log = require('verr-log')();



util.readInput(null, function(err, apiSpec, params) {
  if (err) { log.error(err); process.exit(1); }

  Invoker().invoke({ apiSpec: apiSpec, parameters: params }, function(err) {
    if (err) { log.error(err); process.exit(1); }
  });
});
