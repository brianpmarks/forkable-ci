var prompt = require("prompt")
  , jade   = require("jade")
  , fs     = require("fs")
  , os     = require("os");

module.exports = function(grunt) {
  var remote = grunt.option('remote') ? grunt.file.readJSON(grunt.option('remote')) : {};
  var pk     = remote.privateKey ? grunt.file.read(remote.privateKey) : "";

  // forkshop root
  var root   = grunt.option('root') || '/usr/local/node/forkshop';

  grunt.initConfig({
    sshexec: {
      deploy: {
        command: 'cd /usr/local/node/forkable-ci && grunt pull',
        options: {
          host: remote.host,
          username: remote.username,
          privateKey: pk,
          passphrase: '<%= passphrase %>'
        }
      },
      status: {
        command: "forever list",
        options: {
          host: remote.host,
          username: remote.username,
          privateKey: pk,
          passphrase: '<%= passphrase %>'
        }
      },
      check_branch: {
        command: 'cd /usr/local/node/forkable-ci && grunt git_branch',
        options: {
          host: remote.host,
          username: remote.username,
          privateKey: pk,
          passphrase: '<%= passphrase %>'
        }
      },
      test_ssh: {
        command: 'cd /usr/local/node/forkable-ci && grunt shell:test_ssh',
        options: {
          host: remote.host,
          username: remote.username,
          privateKey: pk,
          passphrase: '<%= passphrase %>'
        }
      }
    },
    shell: {
      pull: {
        command: [
          "git pull",
          "npm install",
          "git submodule init",
          "git submodule update"
        ].join('&&'),
        options: {
          stdout: true,
          stderr: true,
          execOptions: {
            cwd: "/usr/local/node/forkshop"
          }
        }
      },
      restart: {
        command: [
          "forever restart coursefork.js",
          "forever restart blog.js"
        ].join('&&'),
        options: {
          stdout: true,
          stderr: true,
          execOptions: {
            cwd: "/usr/local/node/forkshop"
          }
        }
      },
      git_branch: {
        command: "git branch",
        options: {
          stdout: true,
          execOptions: {
            cwd: "/usr/local/node/forkshop"
          }
        }
      },
      checkout_branch: {
        command: [
          "git fetch origin",
          "git checkout " + grunt.option("branch"),
          "git pull",
          "npm install",
          "git submodule init",
          "git submodule update"
        ].join('&&'),
        options: {
          stdout: true,
          stderr: true,
          execOptions: {
            cwd: "/usr/local/node/forkshop"
          }
        }
      },
      build: {
        command: [
          "make clean"
        ].join('&&'),
        options: {
          stdout: true,
          stderr: true,
          execOptions: {
            cwd: "/usr/local/node/build"
          }
        }
      },
      test: {
        command: [
          "make test"
        ].join('&&'),
        options: {
          stdout: true,
          stderr: true,
          execOptions: {
            cwd: "." // "/usr/local/node"
          }
        }
      },
      test_ssh: {
        command: [
          "ssh -vT git@github.com"
        ].join('&&'),
        options: {
          stdout: true,
          stderr: true,
        }
      },
      rev: {
        command: [
          "git rev-parse HEAD"
        ].join('&&'),
        options: {
          stdout: true,
          stderr: true,
          execOptions: {
            cwd: "/usr/local/node/forkshop"
          }
        }
      }
    },
    concat: {
      css: {
        options: {
          process: function(src, filepath) {
            // replace relative references
            return src.replace(/\.\.(\/)/g, '$1');
          }
        }
      }
    },
    uglify: {
      options: {
        mangle: false
      },
      js: {}
    },
    env: {
      config: {
        src: "config.json"
      }
    },
    restful: {
      options: {
        method: 'post',
        uri: '<%= grove_uri %>',
        destination: '/tmp/grunt-restler',
        data: {
            service: 'grobot'
          , message: '<%= grove_message %>'
          , url: 'https://forkable-ci.herokuapp.com/' // TODO: link to activity item...
          , icon_url: 'https://i.imgur.com/wgOlRFh.png'
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-env');
  grunt.loadNpmTasks('grunt-ssh');
  grunt.loadNpmTasks('grunt-shell');
  grunt.loadNpmTasks('grunt-restful');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');

  // -----------
  // Shell tasks

  // assumes repo has already been cloned
  // git@github.com:coursefork/forkshop.git
  grunt.registerTask('pull', [
      'env:config'
    , 'grove_starting'
    , 'exec_shell_pull'
    , 'css'
    , 'compile_jade'
    , 'javascript'
    , 'shell:restart'
    , 'grove_finished'
  ]);

  grunt.registerTask('grove_starting', 'Tell Grove deploy is starting', function() {
    if (process.env.GROVE_NOTICE_KEY) {
      grunt.config.set('grove_message', os.hostname() + ' began the deploy process...');
      grunt.config.set('grove_uri', 'https://grove.io/api/notice/' + process.env.GROVE_NOTICE_KEY + '/');
      grunt.task.run('restful');
    }
  });

  grunt.registerTask('exec_shell_pull', 'Run shell:pull', function() {
    // pull latest code
    grunt.task.run('shell:pull');
  });

  grunt.registerTask('css', 'Prepare css for production', function() {
    // makes all the file manipulation stuff work without being fully qualified
    grunt.file.setBase(root);

    // require assets for concat and uglify
    var assets = require(root + '/assets');

    // need to prepend 'public' to each asset
    for (min_asset in assets) {
      for (var index in assets[min_asset]) {
        var public_added = assets[min_asset][index].match(/^public/);
        if (!public_added) {
          assets[min_asset][index] = 'public' + assets[min_asset][index];
        }
      }
    }

    // concat files and process relative urls
    grunt.config.set('concat.css.files', { 'public/css/main.min.css': assets['/css/main.min.css'] });
    grunt.task.run('concat');

    // process @import statements
    grunt.config.set('imports.file', 'public/css/main.min.css');
    grunt.task.run('imports');
  });

  grunt.registerTask('javascript', 'Prepare javascript for production', function() {
    // makes all the file manipulation stuff work without being fully qualified
    grunt.file.setBase(root);

    // require assets for concat and uglify
    var assets = require(root + '/assets');

    // need to prepend 'public' to each asset
    for (min_asset in assets) {
      for (var index in assets[min_asset]) {
        var public_added = assets[min_asset][index].match(/^public/);
        if (!public_added) {
          assets[min_asset][index] = 'public' + assets[min_asset][index];
        }
      }
    }

    // uglify js
    grunt.config.set('uglify.js.files', { 'public/js/main.min.js': assets['/js/main.min.js'] });
    grunt.task.run('uglify');
  });

  grunt.registerTask('grove_finished', 'Tell Grove deploy is finished', function() {
    if (process.env.GROVE_NOTICE_KEY) {
      grunt.config.set('grove_message', 'Deploy process completed...');
      grunt.config.set('grove_uri', 'https://grove.io/api/notice/' + process.env.GROVE_NOTICE_KEY + '/');
      grunt.task.run('restful');
    }
  });

  grunt.registerTask('uglify_pr', 'Uglify Pull Request', function() {

    // makes all the file manipulation stuff work without being fully qualified
    grunt.file.setBase(root);

    // require assets for concat and uglify
    var assets = require(root + '/assets');

    // need to prepend 'public' to each asset
    for (min_asset in assets) {
      for (var index in assets[min_asset]) {
        assets[min_asset][index] = 'public' + assets[min_asset][index];
      }
    }

    // uglify js
    grunt.config.set('uglify.js.files', { 'public/js/main.min.js': assets['/js/main.min.js'] });
    grunt.task.run('uglify');

  });

  grunt.registerTask('concat_pr', 'Concat Pull Request', function() {

    // makes all the file manipulation stuff work without being fully qualified
    grunt.file.setBase(root);

    // require assets for concat and uglify
    var assets = require(root + '/assets');

    // need to prepend 'public' to each asset
    for (min_asset in assets) {
      for (var index in assets[min_asset]) {
        assets[min_asset][index] = 'public' + assets[min_asset][index];
      }
    }

    // concat files and process relative urls
    grunt.config.set('concat.css.files', { 'public/css/main.min.css': assets['/css/main.min.css'] });
    grunt.task.run('concat');

    // process @import statements
    grunt.config.set('imports.file', 'public/css/main.min.css');
    grunt.task.run('imports');

  });

  grunt.registerMultiTask('imports', 'Move @import statements to top', function() {
    var src = grunt.file.read(this.data);
    var regex = /@import.*\;/gim;
    var matches = src.match(regex);
    if (matches && matches.length > 0) {
      var imports = matches.join("\n");
      src = imports + "\n\n" + src.replace(regex, "");
      grunt.file.write(this.data, src);
    }
  });

  grunt.registerTask('compile_jade', 'Compile client-side jade templates', function() {
    var templates = require(root + '/templates');

    // compile into functions and convert to strings
    // inspired by clientjade (https://github.com/jgallen23/clientjade)
    var compiledFunctions = Object.keys(templates).map(function(filename) {
      return jade.compile(fs.readFileSync(root + '/' + templates[filename]), {
        filename: filename,
        client: true,
        compileDebug: false
      }).toString().replace(/function anonymous/, 'jade.templates["' + filename + '"] = function');
    });

    // init client-side templates object
    compiledFunctions.unshift('jade.templates = {};');

    // need jade runtime.js
    compiledFunctions.unshift(fs.readFileSync(root + '/node_modules/jade/runtime.js'));

    // write to file
    fs.writeFileSync(root + '/public/js/jade-templates.js', compiledFunctions.join("\n"));
  });

  // local git branch check
  grunt.registerTask('git_branch', ['shell:git_branch']);

  // return git revision
  grunt.registerTask('rev', ['shell:rev']);

  // checkout branch
  // needs --branch command line arg set to a pull request number
  // e.g. grunt checkout_branch --branch 59
  //grunt.registerTask('checkout_branch', ['shell:checkout_branch']);
  grunt.registerTask('checkout_branch', 'Checkout a branch or pull request', function() {

    // makes all the file manipulation stuff work without being fully qualified
    grunt.file.setBase(root);

    // pull latest code
    grunt.task.run('shell:checkout_branch');

    // require assets for concat and uglify
    var assets = require(root + '/assets');

    // need to prepend 'public' to each asset
    for (min_asset in assets) {
      for (var index in assets[min_asset]) {
        assets[min_asset][index] = 'public' + assets[min_asset][index];
      }
    }

    // concat files and process relative urls
    grunt.config.set('concat.css.files', { 'public/css/main.min.css': assets['/css/main.min.css'] });
    grunt.task.run('concat');

    // process @import statements
    grunt.config.set('imports.file', 'public/css/main.min.css');
    grunt.task.run('imports');

    // uglify js
    grunt.config.set('uglify.js.files', { 'public/js/main.min.js': assets['/js/main.min.js'] });
    grunt.task.run('uglify');

    // restart service
    grunt.task.run('shell:restart');

  });

  // work in progress...
  grunt.registerTask('test', ['shell:test']);

  // build
  // not complete - will be used for building and testing pull requests
  grunt.registerTask('_build', ['shell:build']);
  grunt.registerTask('build', 'Build coursefork', function() {
  });

  // ---------
  // SSH tasks

  // assumes --remote (set at command-line) points to a json file with config info
  // calls shell:pull
  grunt.registerTask('exec_deploy', ['sshexec:deploy']);
  grunt.registerTask('deploy', 'Deploy latest updates to master', function() {
    var done = this.async();
    getPassphrase(grunt, 'exec_deploy', done);
  });

  // check the status of coursefork node app
  grunt.registerTask('exec_status', ['sshexec:status']);
  grunt.registerTask('status', 'Checkout status of coursefork node app', function() {
    var done = this.async();
    getPassphrase(grunt, 'exec_status', done);
  });

  // see which branch is active
  // calls shell:git_branch
  grunt.registerTask('exec_check_branch', ['sshexec:check_branch']);
  grunt.registerTask('check_branch', 'Check which branch is active', function() {
    var done = this.async();
    getPassphrase(grunt, 'exec_check_branch', done);
  });

  // test that ssh to git works on remote server
  grunt.registerTask('exec_test_ssh', ['sshexec:test_ssh']);
  grunt.registerTask('test_ssh_git', 'Test that ssh to git works on remote server', function() {
    var done = this.async();
    getPassphrase(grunt, 'exec_test_ssh', done);
  });
}

function getPassphrase(grunt, task, done) {
  var schema = {
    properties: {
      passphrase: {
        hidden: true
      }
    }
  };

  prompt.start();

  prompt.get(schema, function(err, result) {
      grunt.config.set('passphrase', result.passphrase);
      grunt.task.run(task);
      done();
  });
}
