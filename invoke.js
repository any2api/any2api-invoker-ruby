var Invoker = require('./lib/Invoker');
var util = require('any2api-util');
var log = require('verr-log')({ color: false });
var domain = require('domain');



var handleError = function(err) {
  if (err) { log.error(err); process.exit(1); }
};

var d = domain.create();

d.on('error', handleError);

d.run(function() {
  util.readInput(null, function(err, input) {
    handleError(err);

    Invoker().invoke(input, function(err, resultsStream) {
      handleError(err);

      util.writeOutput({ resultsStream: resultsStream }, function(err) {
        handleError(err);
      });
    });
  });
});
