var log = require('verr-log')();
var path = require('path');
var async = require('async');
var _ = require('lodash');
var shortId = require('shortid');

var acc = require('any2api-access');
var util = require('any2api-util');



module.exports = function(spec) {
  var obj = {};

  obj.invoke = function(args, done) {
    args = args || {};

    var apiSpec = args.apiSpec;
    if (!apiSpec) return done(new Error('API spec missing'));

    var params = args.parameters;
    if (!params) return done(new Error('parameters missing'));

    if (!params.cmd) return done(new Error('cmd parameter missing'));

    var config = params.invoker_config || {};

    config.version = config.version || '1.9.3-p551' || '2.2.0';
    config.access = config.access || 'local';
    config.stdin = config.stdin || '';
    config.env = config.env || {};
    config.env.RBENV_ROOT = config.env.RBENV_ROOT || '/opt/rbenv';

    var instanceParams = params._;
    delete params._;

    instanceParams.instance_id = instanceParams.instance_id || uuid.v4();

    if (!instanceParams.instance_path) return done(new Error('_.instance_path parameter missing'));

    var executable = apiSpec.executables[instanceParams.executable_name];

    var localExecPath = path.resolve(apiSpec.apispec_path, '..', executable.path);
    var remoteExecPath = path.join('/', 'tmp', shortId.generate());

    // Find parameters that need to be mapped to environment variables
    _.each(util.getMappedParametersSync({
      apiSpec: apiSpec,
      executable_name: instanceParams.executable_name,
      parameters: params,
      mappingType: 'env'
    }), function(def, name) {
      if (!config.env[name] && def.value) {
        config.env[name] = def.value;
      }
    });

    // Find parameter that need to be mapped to stdin
    _.each(util.getMappedParametersSync({
      apiSpec: apiSpec,
      executable_name: instanceParams.executable_name,
      parameters: params,
      mappingType: 'stdin'
    }), function(def, name) {
      if (!_.isEmpty(config.stdin) && def.value) {
        config.stdin = def.value;
      }
    });

    var access;

    if (acc[config.access]) {
      access = acc[config.access](config);
    } else {
      return done(new Error('access \'' + config.access + '\' not supported'));
    }

    var commands = {
      install: [
        'if type apt-get > /dev/null; then sudo apt-get -y update && sudo apt-get -y install curl git; fi',
        'if type yum > /dev/null; then sudo yum -y install curl git; fi',
        'curl https://raw.githubusercontent.com/fesplugas/rbenv-installer/master/bin/rbenv-installer | bash' // sudo -E bash
      ].join(' && '),
      run: [
        'export PATH="$RBENV_ROOT/bin:$PATH"',
        'eval "$(rbenv init -)"',
        'rbenv install -s ' + config.version,
        'rbenv rehash',
        'rbenv local ' + config.version,
        'gem install bundler',
        'bundle install --binstubs --path ' + path.join(remoteExecPath, 'bundle'),
        //'bundle install --deployment',
        'echo "' + config.stdin + '" | ' + params.cmd
      ].join(' && ')
    };



    var install = function(done) {
      async.series([
        function(callback) {
          access.exec({ command: commands.install, env: config.env }, function(err, stdout, stderr) {
            if (stderr) console.error(stderr);
            if (stdout) console.log(stdout);

            if (err) {
              err.stderr = stderr;
              err.stdout = stdout;

              return callback(err);
            }

            callback();
          });
        }
      ], done);
    };

    var run = function(done) {
      async.series([
        async.apply(access.remove, { path: remoteExecPath }),
        async.apply(access.mkdir, { path: path.join(remoteExecPath, '..') }),
        async.apply(access.copyDirToRemote, { sourcePath: localExecPath, targetPath: remoteExecPath }),
        function(callback) {
          access.exists({ path: path.join(remoteExecPath, 'Gemfile') }, function(err, exists) {
            if (err || exists) return callback(err);

            access.writeFile({ path: path.join(remoteExecPath, 'Gemfile'), content: config.gemfile || '' }, callback);
          });
        },
        function(callback) {
          if (!config.gemfile_lock) return callback();

          access.exists({ path: path.join(remoteExecPath, 'Gemfile.lock') }, function(err, exists) {
            if (err || exists) return callback(err);

            access.writeFile({ path: path.join(remoteExecPath, 'Gemfile.lock'), content: config.gemfile_lock }, callback);
          });
        },
        async.apply(util.writeParameters, {
          apiSpec: apiSpec,
          executable_name: instanceParams.executable_name,
          parameters: params,
          remotePath: remoteExecPath,
          access: access
        }),
        function(callback) {
          access.exec({ command: commands.run, env: config.env, path: remoteExecPath }, function(err, stdout, stderr) {
            if (stderr) console.error(stderr);
            if (stdout) console.log(stdout);

            if (err) {
              err.stderr = stderr;
              err.stdout = stdout;

              return callback(err);
            }

            callback();
          });
        },
        async.apply(util.collectResults, {
          apiSpec: apiSpec,
          executable_name: instanceParams.executable_name,
          localPath: instanceParams.instance_path,
          remotePath: remoteExecPath,
          access: access
        })
      ], done);
    };



    async.series([
      function(callback) {
        access.exists({ path: config.env.RBENV_ROOT }, function(err, exists) {
          if (err) callback(err);
          else if (!exists) install(callback);
          else callback();
        });
      },
      async.apply(run)
    ], function(err) {
      async.series([
        async.apply(access.terminate)
      ], function(err2) {
        if (err2) log.error(err2);

        done(err);
      });
    });
  };

  return obj;
};
