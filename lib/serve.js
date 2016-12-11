// require packages
const fs = require('fs');
const bodyParser = require('body-parser');
const passwordHash = require('password-hash');
const _ = require('underscore');
const cookieParser = require('cookie-parser');
const markdown = require( "markdown" ).markdown;
const Datastore = require('nedb')
  , db = new Datastore({ filename: 'db/db.json', autoload: true })
  , settings = new Datastore({ filename: 'db/settings.json', autoload: true });

// setup database
db.loadDatabase(function (err) { });
settings.loadDatabase(function (err) { });

// create application/x-www-form-urlencoded parser
const urlencodedParser = bodyParser.urlencoded({ extended: false })

var name = '';
var install = false;

// check if layer is set up
fs.stat('db/name.txt', function(err, stat) {
  if(err == null) {
    fs.readFile('db/name.txt', (err, data) => {
      if (err) throw err;

      name = data;
    });
  } else if(err.code == 'ENOENT') {
    install = true;

    // if layer is not set up
    if (install) {
      // setup via env
      if (!_.isEmpty(process.env.LAYERUSER) && !_.isEmpty(process.env.LAYERPASSWORD) && !_.isEmpty(process.env.LAYERNAME)) {
        const hashedPassword = passwordHash.generate(process.env.LAYERPASSWORD);

        const newUser = { user: process.env.LAYERUSER, password: hashedPassword, url: process.env.LAYERUSER.replace(/\s/g, "-")  };

        settings.insert(newUser, function (err, newDoc) {
          if (err) throw err;

          fs.writeFile('db/name.txt', process.env.LAYERNAME, (err) => {
            if (err) throw err;

            name = process.env.LAYERNAME;

            console.log('Layer setup via ENV');

            install = false;
          });
        });
      }
    }

    // if layer is not set up
    if (install) {
      // setup via init.json
      fs.stat('init.json', function(err, stat) {
        if(err == null) {
          fs.readFile('init.json', (err, data) => {
            if (err) throw err;

            const init = JSON.parse(data);

            if (!_.isEmpty(init)) {
              const hashedPassword = passwordHash.generate(init.password);

              const newUser = { user: init.user, password: hashedPassword, url: init.user.replace(/\s/g, "-") };

              settings.insert(newUser, function (err, newDoc) {
                if (err) throw err;

                fs.writeFile('db/name.txt', init.name, (err) => {
                  if (err) throw err;

                  name = init.name;

                  console.log('Layer setup via init.json');

                  install = false;
                });
              });
            }
          });
        }
      });
    }
  } else {
    console.log('Error!');
  }
});

module.exports = function(app) {
  //setup cookie parsing
  app.use(cookieParser());

  app.get('/', function (req, res) {
    //check if layer is installed
    if (install) {
      res.render('install');
      console.log('Installing Layer');
    } else {
      db.find({}, function (err, posts) {
        res.render('index', {name: name, posts: posts });
      });
    }
  });

  app.post('/setup', urlencodedParser, function (req, res) {
    const hashedPassword = passwordHash.generate(req.body.password);

    const newUser = { user: req.body.username, password: hashedPassword, url: req.body.username.replace(/\s/g, "-") };

    settings.insert(newUser, function (err, newDoc) {
      if (err) throw err;

      fs.writeFile('db/name.txt', req.body.name, (err) => {
        if (err) throw err;

        name = req.body.name;

        install = false;

        res.redirect('/');
      });
    });
  });

  app.get('/dashboard', function (req, res) {
    if (_.isEmpty(req.cookies.userhash)) {
      res.redirect('/dashboard/login');
    } else {
      if (typeof(req.cookies.userhash) === 'string' && typeof(req.cookies.username) === 'string') {
        settings.findOne({ password: req.cookies.userhash, user: req.cookies.username }, function (err, user) {
          if(!_.isEmpty(user)) {
            db.find({ user: user.user }, function (err, posts) {
              res.render('dashboard', { username: user.user, name: name, posts: posts });
            });
          } else {
            res.send('Auth error');
          }
        });
      }
    }
  });

  app.get('/dashboard/login', function (req, res) {
    res.render('login', {name: name});
  });

  app.post('/dashboard/login/now', urlencodedParser, function (req, res) {
    settings.findOne({ user: req.body.username }, function (err, user) {
      if(!_.isEmpty(user)) {
        if (passwordHash.verify(req.body.password, user.password)) {
          res.cookie('userhash', user.password, { domain: req.hostname, expires: new Date(Date.now() + 4320000000)});
          res.cookie('username', user.user, { domain: req.hostname, expires: new Date(Date.now() + 4320000000)});

          res.redirect('/dashboard');
        } else {
          res.send('Wrong password');
        }
      } else {
        res.send('Wrong user');
      }
    });
  });

  app.get('/dashboard/new', function (req, res) {
    res.render('new', { name: name });
  });

  app.post('/dashboard/new/save', urlencodedParser, function (req, res) {
    settings.findOne({ user: req.cookies.username, password: req.cookies.userhash }, function (err, user) {
      if(!_.isEmpty(user)) {
        const date = new Date().toISOString().
          replace(/\T.*/, ' ')     // replace T with a space

        const post = { title: req.body.title, user: user.user, date: date, text: markdown.toHTML(req.body.text), md: req.body.text, url: req.body.title.replace(/\s/g, "-"), userurl: user.url };

        db.insert(post, function (err, newDoc) {
          res.redirect('/dashboard');
        });
      } else {
        res.send('Auth problem');
      }
    });
  });

  app.get('/dashboard/users', function (req, res) {
    settings.findOne({ user: req.cookies.username, password: req.cookies.userhash }, function (err, user) {
      if(!_.isEmpty(user)) {
        settings.find({ }, function (err, users) {
          res.render('users', { name: name, users: users });
        });
      } else {
        res.send('Auth problem');
      }
    });
  });

  app.post('/dashboard/users/save', urlencodedParser, function (req, res) {
    settings.findOne({ user: req.cookies.username, password: req.cookies.userhash }, function (err, user) {
      if(!_.isEmpty(user)) {
        const date = new Date().toISOString().
          replace(/\T.*/, ' ')     // replace T with a space

        const setid = Math.floor((Math.random() * 999999999) + 100000);

        const user = { user: req.body.username, userurl: req.body.username.replace(/\s/g, "-"), password: 'none', setid: String(setid) };

        settings.insert(user, function (err, newDoc) {
          res.redirect('/dashboard/display_user_link/' + setid);
        });
      } else {
        res.send('Auth problem');
      }
    });
  });

  app.get('/dashboard/display_user_link/:id', function (req, res) {
    res.render('display', { name: name, content: 'The new account can be activated at: http://' + req.hostname + '/dashboard/activate/' + req.params.id })
  });

  app.get('/dashboard/activate/:id', function (req, res) {
    settings.findOne({ setid: req.params.id }, function (err, user) {
      if(_.isEmpty(user)) {
        res.send('<!DOCTYPE html><html> <head> <meta charset="utf-8"> <meta name="viewport" content="width=device-width, initial-scale=1"> <meta name="theme-color" content="#000000" /> <title>404 - Not found</title> <style media="screen"> body{background: black; font-family: monospace; max-width: 450px; margin: 35vh auto 0px auto; color: white; font-size: 1.3em; padding: 10px;}</style> </head> <body> <h1>404</h1> <p>The file you are looking for<br>does not exist on this server.</p></body></html>');
      } else {
        res.render('activate', { name: name, id: req.params.id });
      }
    });
  });

  app.post('/dashboard/activate/:id/save', urlencodedParser, function (req, res) {
    const hashedPassword = passwordHash.generate(req.body.password);

    settings.findOne({ setid: req.params.id }, function (err, user) {
      settings.update({ setid: req.params.id }, { password: hashedPassword, user: user.user, userurl: user.userurl }, {}, function (err, newuser) {
        res.redirect('/dashboard');
      });
    });
  });

  app.get('/dashboard/logout', function (req, res) {
    res.cookie('userhash', ' ', { domain: req.hostname, expires: new Date(Date.now() + 10)});
    res.cookie('username', ' ', { domain: req.hostname, expires: new Date(Date.now() + 10)});

    res.redirect('/dashboard');
  });

  app.get('/dashboard/edit/:id', function (req, res) {
    settings.findOne({ user: req.cookies.username, password: req.cookies.userhash }, function (err, user) {
      if (!_.isEmpty(user)) {
        db.findOne({ url: req.params.id }, function (err, post) {
          if (!_.isEmpty(post)) {
            res.render('edit', { name: name, text: post.md, title: post.title, id: req.params.id })
          } else {
            res.send('<!DOCTYPE html><html> <head> <meta charset="utf-8"> <meta name="viewport" content="width=device-width, initial-scale=1"> <meta name="theme-color" content="#000000" /> <title>404 - Not found</title> <style media="screen"> body{background: black; font-family: monospace; max-width: 450px; margin: 35vh auto 0px auto; color: white; font-size: 1.3em; padding: 10px;}</style> </head> <body> <h1>404</h1> <p>The file you are looking for<br>does not exist on this server.</p></body></html>');
          }
        });
      } else {
        res.send('<!DOCTYPE html><html> <head> <meta charset="utf-8"> <meta name="viewport" content="width=device-width, initial-scale=1"> <meta name="theme-color" content="#000000" /> <title>404 - Not found</title> <style media="screen"> body{background: black; font-family: monospace; max-width: 450px; margin: 35vh auto 0px auto; color: white; font-size: 1.3em; padding: 10px;}</style> </head> <body> <h1>404</h1> <p>The file you are looking for<br>does not exist on this server.</p></body></html>');
      }
    });
  });

  app.post('/dashboard/edit/:id/save', urlencodedParser, function (req, res) {
    settings.findOne({ user: req.cookies.username, password: req.cookies.userhash }, function (err, user) {
      if (!_.isEmpty(user)) {
        db.findOne({ url: req.params.id, user: user.user }, function (err, post) {
          if (!_.isEmpty(post)) {
            const postedit = { title: req.body.title, user: user.user, date: post.date, text: markdown.toHTML(req.body.text), md: req.body.text, url: post.url, userurl: user.userurl };

            db.update({ url: req.params.id }, postedit, {}, function (err, newpost) {
              res.redirect('/dashboard');
            });
          } else {
            res.send('<!DOCTYPE html><html> <head> <meta charset="utf-8"> <meta name="viewport" content="width=device-width, initial-scale=1"> <meta name="theme-color" content="#000000" /> <title>404 - Not found</title> <style media="screen"> body{background: black; font-family: monospace; max-width: 450px; margin: 35vh auto 0px auto; color: white; font-size: 1.3em; padding: 10px;}</style> </head> <body> <h1>404</h1> <p>The file you are looking for<br>does not exist on this server.</p></body></html>');
          }
        });
      } else {
        res.send('<!DOCTYPE html><html> <head> <meta charset="utf-8"> <meta name="viewport" content="width=device-width, initial-scale=1"> <meta name="theme-color" content="#000000" /> <title>404 - Not found</title> <style media="screen"> body{background: black; font-family: monospace; max-width: 450px; margin: 35vh auto 0px auto; color: white; font-size: 1.3em; padding: 10px;}</style> </head> <body> <h1>404</h1> <p>The file you are looking for<br>does not exist on this server.</p></body></html>');
      }
    });
  });

  app.get('/~:id', function (req, res) {
    settings.findOne({ url: req.params.id }, function (err, user) {
      if(!_.isEmpty(user)) {
        db.find({ userurl: req.params.id }, function (err, posts) {
          if (_.isEmpty(posts)) {
            res.render('user', { username: user.user, name: name, posts: posts });
          } else {
            res.render('user', { username: user.user, name: name, posts: posts });
          }
        });
      } else {
        res.send('<!DOCTYPE html><html> <head> <meta charset="utf-8"> <meta name="viewport" content="width=device-width, initial-scale=1"> <meta name="theme-color" content="#000000" /> <title>404 - Not found</title> <style media="screen"> body{background: black; font-family: monospace; max-width: 450px; margin: 35vh auto 0px auto; color: white; font-size: 1.3em; padding: 10px;}</style> </head> <body> <h1>404</h1> <p>The file you are looking for<br>does not exist on this server.</p></body></html>');
      }
    });
  });

  app.get('/:id', function (req, res) {
    db.findOne({ url: req.params.id }, function (err, posts) {
      if (_.isEmpty(posts)) {
        res.send('<!DOCTYPE html><html> <head> <meta charset="utf-8"> <meta name="viewport" content="width=device-width, initial-scale=1"> <meta name="theme-color" content="#000000" /> <title>404 - Not found</title> <style media="screen"> body{background: black; font-family: monospace; max-width: 450px; margin: 35vh auto 0px auto; color: white; font-size: 1.3em; padding: 10px;}</style> </head> <body> <h1>404</h1> <p>The file you are looking for<br>does not exist on this server.</p></body></html>');
      } else {
        res.render('post', { name: name, post: posts });
      }
    });
  });

  app.all('*', function (req, res) {
    res.send('<!DOCTYPE html><html> <head> <meta charset="utf-8"> <meta name="viewport" content="width=device-width, initial-scale=1"> <meta name="theme-color" content="#000000" /> <title>404 - Not found</title> <style media="screen"> body{background: black; font-family: monospace; max-width: 450px; margin: 35vh auto 0px auto; color: white; font-size: 1.3em; padding: 10px;}</style> </head> <body> <h1>404</h1> <p>The file you are looking for<br>does not exist on this server.</p></body></html>');
  });
}
