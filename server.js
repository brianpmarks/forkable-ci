
var connection     = require("ssh2")
  , express        = require("express")
  , request        = require("request")
  , app            = express()
  , mongoose       = require("mongoose")
  , passport       = require("passport")
  , GitHubStrategy = require("passport-github").Strategy
  , RedisStore     = require("connect-redis")(express)
  , url            = require("url");

// TODO: schema for currently deployed branch (rather than real-time check?)
// schema for past test results?
mongoose.connect( process.env.MONGOLAB_URI || "mongodb://localhost/forkable-ci" );

// models
var models = require("./models");

app.use(express.logger());

app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.static(__dirname + '/public'));

app.use(express.cookieParser()); // config.sessions.key
app.use(express.bodyParser());
app.use(express.methodOverride())
app.use(express.errorHandler());

var sessionStore;
if (process.env.REDISTOGO_URL) {
  var rtg = url.parse( process.env.REDISTOGO_URL );
  var auth = rtg.auth.split(':')[1];
  sessionStore = new RedisStore({
    host: rtg.hostname,
    port: rtg.port,
    pass: auth
  });
}
else {
  sessionStore = new RedisStore();
}

app.use(express.session({
    secret: "github for all the things"
  , store: sessionStore
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
  console.log("serializeUser? " + JSON.stringify(user));
  done(null, user._id);
});
passport.deserializeUser(function(user_id, done) {
  models.User.findOne({ _id: user_id }, function(err, user) {
    done(null, user);
  });
});

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET
  }, function(accessToken, refreshToken, profile, done) {
    // create / update user
    models.User.findOne({ username : profile.username }, function(err, user) {
      // may want to update some user fields...?
      if (user) return done(null, user);

      var cf_user = new models.User();
      cf_user.username = profile.username;
      cf_user.accessToken = accessToken;
      cf_user.profileUrl = profile.profileUrl,
      cf_user.github_id = profile.id;

      cf_user.save(function(err, cf_user) {
        return done(null, cf_user);
      });
    });
  }
));

function requireLogin(req, res, next) {
  if (req.isAuthenticated()) { return next() }
  res.status(401).render('login');
}

// github webhooks
// on pull request do ???
// auto run tests on staging server and push results back as a comment to pull request?
app.post('/github_webhook', function(req, res) {
    console.log("req.body = " + JSON.stringify(req.body));

    res.send("OK");
});

app.get('/auth/github', passport.authenticate('github'));

app.get('/auth/github/callback', passport.authenticate('github'), function(req, res) {
  res.redirect('/');
});

var github_token = process.env.GITHUB_TOKEN;

app.get('/', requireLogin, function(req, res) {
    // GET /repos/:owner/:repo/pulls
    request({
      method: 'GET',
      uri: 'https://api.github.com/repos/coursefork/forkshop/pulls',
      encoding: 'utf-8',
      followRedirect: false,
      headers: {
        'Authorization': 'token ' + github_token,
        'User-Agent': 'forkable ci'
      }
    }, function(err, response, body) {
      // need to know which branch is active on staging
      var pull_requests = JSON.parse(body);
      console.log('pull_requests = ' + JSON.stringify(pull_requests));

      models.PullRequest.find().exec(function(err, pr_list) {
        // prs should be unique by number
        // map to hash rather than array
        var prs = {};
        for (var i = 0; i < pr_list.length; i++) {
          prs[ pr_list[i].branch ] = pr_list[i];
        }

        console.log('prs = ' + JSON.stringify(prs));

        // display all pull requests and their state
        res.render('index', {
          title : "Coursefork Pull Requests",
          prs : prs,
          pull_requests : pull_requests
        });
      });
    });
});

app.post('/checkout_branch', function(req, res) {
  var pr = req.body.pr;
  // ssh to staging
  // exec grunt checkout_branch --branch req.params.pr

  if (pr !== "master") pr = "pr/" + pr;
  console.log('pr = ' + pr);

  var c = new connection();

  c.on('ready', function() {
    c.exec("cd /usr/local/node/forkable-ci && grunt checkout_branch --branch " + pr, function(err, stream) {
      if (err) throw err;

      stream.on('data', function(data, extended) {
        console.log((extended === 'stderr' ? 'STDERR: ' : 'STDOUT: ') + data);
        // what to do with output?
      });
      stream.on('exit', function(code, signal) {
        c.end();
      });
    });
  });

  c.on('close', function() {
    // update any other pull requests "on_staging"
    models.PullRequest.update({ on_staging : true }, { $set : { on_staging : false } }, function(err) {
      console.log('on_staging = false update err? ' + err);

      // if everything went ok, update mongodb
      // $push : { deploys : { user : req.user } } - maybe this has to happen after on_staging update? at least for a new doc?
      models.PullRequest.update({ branch : pr }, { $set : { branch : pr, on_staging : true } }, { upsert : true }, function(err) {
        console.log('on_staging = true update err? ' + err);
        // render new page?
        res.json({
          status: "ok"
        });
      });

    });
  });

  c.connect({
    host       : process.env.REMOTE_HOST,
    username   : process.env.REMOTE_USER,
    privateKey : process.env.SSH_PRIVATE_KEY,
    passphrase : process.env.SSH_PASSPHRASE
  });
});

app.get('/check_branch', function(req, res) {
  var branch_r = "";
  var c = new connection();

  c.on('ready', function() {
    c.exec("cd /usr/local/node/forkshop && git branch", function(err, stream) {
      if (err) throw err;

      stream.on('data', function(data, extended) {
        console.log((extended === 'stderr' ? 'STDERR: ' : 'STDOUT: ') + data);
        branch_r += data;
      });
      stream.on('exit', function(code, signal) {
        c.end();
      });
    });
  });

  c.on('close', function() {
    res.send(branch_r);
  });

  c.connect({
    host       : process.env.REMOTE_HOST,
    username   : process.env.REMOTE_USER,
    privateKey : process.env.SSH_PRIVATE_KEY,
    passphrase : process.env.SSH_PASSPHRASE
  });
});

// testing ssh stuff
app.get('/uptime', function(request, response) {

  var uptime_r = "";
  var c = new connection();

  c.on('connect', function() {
    console.log("connect");
  });

  c.on('ready', function() {
    console.log('ready');
    c.exec("uptime", function(err, stream) {
      if (err) throw err;
      stream.on('data', function(data, extended) {
        console.log((extended === 'stderr' ? 'STDERR: ' : 'STDOUT: ') + data);
        uptime_r += data;
      });
      stream.on('end', function() {
        console.log("stream eof");
      });
      stream.on('close', function() {
        console.log("stream close");
      });
      stream.on('exit', function(code, signal) {
        console.log("stream exit code = " + code + " signal = " + signal);
        c.end();
      });
    });
  });

  c.on('error', function(err) {
    console.log("error " + err);
  });
  c.on('end', function() {
    console.log("end");
  });
  c.on('close', function() {
    console.log("close");
    response.send(uptime_r);
  });

  c.connect({
    host       : process.env.REMOTE_HOST,
    username   : process.env.REMOTE_USER,
    privateKey : process.env.SSH_PRIVATE_KEY,
    passphrase : process.env.SSH_PASSPHRASE
  });
});

var port = process.env.PORT || 8080;
app.listen(port, function() {
  console.log("Listening on " + port);
});

