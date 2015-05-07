var async = require('async');
var _ = require('lodash');
var path = require('path');

var access = require('any2api-access');
var util = require('any2api-util');



module.exports = util.createInvoker({
  accessModule: access,
  gatherParameters: [ { name: 'cmd' } ],
  invoke: function(ctx, callback) {
    if (!ctx.unmappedParameters.cmd) return callback(new Error('cmd parameter missing'));

    var install = function(callback) {
      var installCommand = [
        'if type apt-get > /dev/null; then sudo apt-get -y update && sudo apt-get -y install curl git; fi',
        'if type yum > /dev/null; then sudo yum -y install curl git; fi',
        'curl https://raw.githubusercontent.com/fesplugas/rbenv-installer/master/bin/rbenv-installer | bash' // sudo -E bash
      ].join(' && ');

      async.series([
        function(callback) {
          ctx.access.exec({
            command: installCommand,
            env: ctx.invokerConfig.env,
            encodingStdout: ctx.invokerConfig.encoding_stdout,
            encodingStderr: ctx.invokerConfig.encoding_stderr
          }, ctx.accessExecCallback(callback));
        }
      ], callback);
    };

    var run = function(callback) {
      var runCommand = [
        'export PATH="$RBENV_ROOT/bin:$PATH"',
        'eval "$(rbenv init -)"',
        'rbenv install -s ' + ctx.invokerConfig.version,
        'rbenv rehash',
        'rbenv local ' + ctx.invokerConfig.version,
        'gem install bundler',
        'bundle install --binstubs --path ' + path.join(ctx.instancePath, 'bundle'),
        //'bundle install --deployment',
        'echo "' + ctx.invokerConfig.stdin + '" | ' + ctx.unmappedParameters.cmd
        //params.cmd
      ].join(' && ');

      async.series([
        //async.apply(ctx.access.remove, { path: ctx.instancePath }),
        async.apply(ctx.access.mkdir, { path: ctx.instancePath }),
        async.apply(ctx.access.mkdir, { path: ctx.invokerConfig.cwd }),
        function(callback) {
          if (!ctx.executablePath) return callback();

          ctx.access.copyDirToRemote({ sourcePath: ctx.executablePath, targetPath: ctx.instancePath }, callback);
        },
        function(callback) {
          ctx.access.exists({ path: path.join(ctx.instancePath, 'Gemfile') }, function(err, exists) {
            if (err || exists) return callback(err);

            ctx.access.writeFile({ path: path.join(ctx.instancePath, 'Gemfile'), content: ctx.invokerConfig.gemfile || '' }, callback);
          });
        },
        function(callback) {
          if (!ctx.invokerConfig.gemfile_lock) return callback();

          ctx.access.exists({ path: path.join(ctx.instancePath, 'Gemfile.lock') }, function(err, exists) {
            if (err || exists) return callback(err);

            ctx.access.writeFile({ path: path.join(ctx.instancePath, 'Gemfile.lock'), content: ctx.invokerConfig.gemfile_lock }, callback);
          });
        },
        function(callback) {
          ctx.access.exec({
            command: runCommand,
            env: ctx.invokerConfig.env,
            //stdin: ctx.invokerConfig.stdin || '',
            cwd: ctx.invokerConfig.cwd,
            encodingStdout: ctx.invokerConfig.encoding_stdout,
            encodingStderr: ctx.invokerConfig.encoding_stderr
          }, ctx.accessExecCallback(callback));
        }
      ], callback);
    };

    ctx.invokerConfig.env.RBENV_ROOT = ctx.invokerConfig.env.RBENV_ROOT || '/opt/rbenv';
    ctx.invokerConfig.version = ctx.invokerConfig.version || '1.9.3-p551' || '2.2.0';

    try {
      if (!_.isEmpty(ctx.invokerConfig.args)) {
        ctx.unmappedParameters.cmd = _.template(ctx.unmappedParameters.cmd)(ctx.invokerConfig.args);
      }
    } catch (err) {
      return callback(new Error('error while building command using args: ' + err.message));
    }

    async.series([
      function(callback) {
        ctx.access.exists({ path: ctx.invokerConfig.env.RBENV_ROOT }, function(err, exists) {
          if (err) callback(err);
          else if (!exists) install(callback);
          else callback();
        });
      },
      async.apply(run)
    ], callback);
  }
});
