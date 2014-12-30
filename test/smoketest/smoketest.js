var chai = require('chai');
var expect = chai.expect;
var fs = require('fs-extra');
var path = require('path');
var async = require('async');
var util = require('any2api-util');

var timeout = 1000 * 60 * 15; // 15 minutes

var invokerPath = path.join(__dirname, '..', '..');
var specPathScript = path.join(__dirname, 'script-apispec.json');

var apiSpecScript = {
  "executables": {
    "script": {
      "parameters_schema": {
        "input_file": {
          "type": "string",
          "mapping": "file",
          "file_path": "./input.txt"
        },
        "input_env": {
          "type": "string",
          "mapping": "env"
        }
      },
      "results_schema": {
        "output_file": {
          "type": "string",
          "mapping": "file",
          "file_path": "./output.txt"
        }
      },
      "path": ".",
      "invoker_name": "ruby"
    }
  },
  "invokers": {
    "ruby": {
      "path": invokerPath,
      "expose": true
    }
  },
  apispec_path: specPathScript
};

var runScript = {
  parameters: {
    input_file: 'some input through a file',
    input_env: 'some more input through env',
    cmd: 'bundle exec ruby script.rb foo=bar',
    invoker_config: {
      env: {
        FOO: 'some input through env'
      },
      stdin: 'hello world',
      gemfile: 'source \'https://rubygems.org\'\ngem \'nokogiri\'\ngem \'rack\', \'~>1.1\'\n',
      access: 'local'
    }
  }
};



var cleanup = function(done) {
  async.series([
    async.apply(fs.remove, specPathScript),
    async.apply(fs.remove, path.join(invokerPath, 'node_modules'))
  ], done);
};



describe('script.rb', function() {
  this.timeout(timeout);

  before(cleanup);

  before(function(done) {
    fs.writeFile(specPathScript, JSON.stringify(apiSpecScript), 'utf8', done);
  });

  it('prepare buildtime', function(done) {
    util.prepareBuildtime({ apiSpec: apiSpecScript,
                            executable_name: 'script' }, function(err) {
                              if (err) throw err;
                              
                              done();
                            });
  });

  it('prepare executable', function(done) {
    util.prepareExecutable({ apiSpec: apiSpecScript,
                             executable_name: 'script' }, function(err, updatedSpec) {
                               if (err) throw err;

                               apiSpecScript = updatedSpec;

                               expect(updatedSpec.executables.script.prepared).to.be.true;

                               done();
                             });
  });

  it('prepare runtime', function(done) {
    util.prepareRuntime({ apiSpec: apiSpecScript,
                          executable_name: 'script' }, function(err) {
                            if (err) throw err;
                            
                            done();
                          });
  });

  it('invoke executable', function(done) {
    util.invokeExecutable({ apiSpec: apiSpecScript,
                            executable_name: 'script',
                            run: runScript }, function(err, run) {
                              if (err) throw err;

                              expect(run.finished).to.exist;

                              console.log(run);

                              done();
                            });
  });

  after(cleanup);
});
