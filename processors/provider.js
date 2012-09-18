/**  Creates databases with a dashboard for users
  *  Setup environment variables (see datacouch readme for more info):
  *    export SRC_COUCH_ROOT="http://admin:admin@localhost:5984"
  *    export DST_COUCH_ROOT="http://garden.apps:pass@hosting.iriscouch.com"
  *    export HOSTING_ROOT="garden20.com"
  *    export HOSTING_ROOT="iriscouch.com"
  *  then "node provision_databases.js"
  *  Author: Ryan Ramage (@eckoit)
  *  Author: Max Ogden (@maxogden)
 **/

if(!process.env['SRC_COUCH_ROOT']) throw ("OMGZ YOU HAVE TO SET SRC_COUCH_ROOT");
if(!process.env['DST_COUCH_ROOT']) throw ("OMGZ YOU HAVE TO SET DST_COUCH_ROOT");
if(!process.env['HOSTING_ROOT'])   throw ("OMGZ YOU HAVE TO SET HOSTING_ROOT");

var follow = require('follow')
  , request = require('request').defaults({json: true})
  , async = require('async')
  , http = require('http')
  , path = require('path')
  , url = require('url')
  , _ = require('underscore')
  ,  fs = require('fs')
  , Log = require('log')
  , log = new Log('debug', fs.createWriteStream('g20.log'))


// for nodejitsu -- they require a running server
require('http').createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('database provisioner is up\n');
}).listen(1337);

var src_db_root = process.env['SRC_COUCH_ROOT'];
var src_user_db = src_db_root + '/_users';
var src_db = src_db_root + '/garden20';

var dst_db = process.env['DST_COUCH_ROOT'] + '/hosting_public';
var hosting_root = process.env['HOSTING_ROOT'];

log.debug('starting...');

follow({db: src_user_db, include_docs: true,  since : "now"}, function(error, change) {
    if (error || !("doc" in change)) return;
    var user_doc = change.doc;

    if (!user_doc.subtype === 'request') return;


    log.debug('got a doc change');



    var domain = domainPrefix(user_doc);
    var fullDomain = domain + '.' + hosting_root;
    log.debug('requested domain: ' + fullDomain);
    var targetDoc = createTargetDoc(user_doc, domain);
    var start_time = new Date().getTime();

    user_doc.start_time = start_time;

    var doc = null;

    async.waterfall([

        function(callback) {
            get_status_doc(src_db, user_doc.gravitar_hash, function(err, resp){
                if (err) return callback(err);
                doc = resp;
                log.debug(JSON.stringify(doc));
                if (doc.state || doc.in_progress) return callback('already processed');
                if (doc.error) return callback("Something bad happened");
                updateProgress(src_db, doc, 'Starting Progress...', 10, false, function(err2, doc2) {
                    doc = doc2;
                    callback(null);
                });

            });
        },
        function(callback){
            createCouchPost(dst_db, targetDoc, function(err){
                updateProgress(src_db, doc, 'Creating space...', 15, false, function(err2, doc2) {
                    doc = doc2;
                    callback(err);
                });
            });
        },
        function(callback){
            waitForCouch(fullDomain, function(err){
                updateProgress(src_db, doc, 'Installing dashboard...', 40, false, function(err2, doc2) {
                    doc = doc2;
                    callback(err);
                });
            });
        },
        function(callback){
            installDashboard(src_db_root, fullDomain, function(err){
                updateProgress(src_db, doc, 'Adjusting settings...', 65, false, function(err2, doc2) {
                    doc = doc2;
                    callback(err);
                });
            });
        },
        function(callback){
            adjust_dashboard_settings(fullDomain, function(err){
                updateProgress(src_db, doc, 'Creating User...', 70, false, function(err2, doc2) {
                    doc = doc2;
                    callback(err);
                });
            });
        },
        function(callback) {
            createUser(fullDomain, user_doc.email, user_doc.password_sha, user_doc.salt, function(err){
                updateProgress(src_db, doc, 'Admin config...', 80, false, function(err2, doc2) {
                    doc = doc2;
                    callback(err);
                });
            })
        },

        function(callback) {
            setAdmin(fullDomain, 'dashboard', user_doc.email, function(err){
                updateProgress(src_db, doc, 'Adjust routing', 85, false, function(err2, doc2) {
                    doc = doc2;
                    callback(err);
                });
            });
        },
        function(callback) {
            turnOffSecureRewrites(fullDomain, function(err) {
                addVhosts(fullDomain, function(err) {
                    updateProgress(src_db, doc, 'Admin config (cont)...', 90, false, function(err2, doc2) {
                        doc = doc2;
                        callback(err);
                    });
                });
            })


        },
        function(callback) {
            createAdmin(fullDomain, user_doc.email, user_doc.password_sha, user_doc.salt, function(err){
                updateProgress(src_db, doc, 'Finishing', 95, false, function(err2, doc2) {
                    doc = doc2;
                    callback(err);
                });
            });
        },
        function(callback) {
            updateProgress(src_db, doc, 'Complete!', 100, true, callback);
        }


    ], function(err) {
        if (err) return log.error('workflow problem:  ' + JSON.stringify(err));
    });
})



function updateProgress(src_db, doc, state, percent, finished, callback) {
    doc.state = state;
    doc.percent = percent;
    if (finished) {
        delete doc.in_progress
        doc.complete = true;
        doc.finish_time = new Date().getTime();
    } else {
        doc.in_progress = true;

    }
    request({
      uri: src_db + '/' + doc._id,
      method: "PUT",
      json : doc
    },
    function (err, resp, body) {
        if (err) callback('ahh!! ' + err);
        var response = body;
        if (!response) response = {"ok": true};
        if (!response.ok) callback(url + " - " + body);

        doc._rev = response.rev;
        callback(null, doc);
    })
}


function createCouchPost(url, targetDoc, callback) {
  log.debug('create couch', url);
  request({
      uri: url,
      method: "POST",
      json : targetDoc
  },
  function (err, resp, body) {
    if (err) return callback('ahh!! ' + err);
    var response = body;
    if (!response) response = {"ok": true};
    if (!response.ok) callback(url + " - " + body);
    callback();
  })
  
}


function waitForCouch(fullDomain, callback) {
  log.debug('wait for couch');
  var couchNotUp = true;
  var start = new Date().getTime();
  async.whilst(
        function () {return couchNotUp;},
        function (callback) {
            setTimeout(function(){
                checkExistenceOf('http://' + fullDomain, function(err, resp){
                    var now = new Date().getTime();
                    var elapsed = now - start;
                    if (elapsed > 20000) return callback('Timeout, waiting for couch');
                    if (resp && resp.statusCode === 200 ) couchNotUp = false;
                    // prob should be kind and do a settimeout
                    callback();
                });
            }, 300);
        },
        function (err) {
            callback(err);
        }
   );
}


function get_status_doc(src_db, _id, callback) {
    var uri = src_db + '/' + _id;
    log.debug(uri);
    request({
      uri: uri,
      method: "GET"
    },
    function (err, resp, body) {
        if (err) return callback('ahh!! ' + err);
        callback(null, body);
    })
}

function installDashboard(src_db_root, fullDomain, callback) {
   log.debug('install dashboard into ' + fullDomain);
   replicate(src_db_root, 'dashboard_seed', 'http://' + fullDomain + '/dashboard', '_design/dashboard', function(err){
       log.debug('replicate cmmd finished');
       if (err) log.error(err);
       callback(err)
   });
}



function createTargetDoc(doc, domainPrefix) {
    var targetDoc = {
        "_id":"Server/" + domainPrefix,
        "partner": "garden.apps",   // prob should make customizable
        "creation": {
            "first_name": doc.first_name,
            "last_name": doc.last_name,
            "email": doc.email,
            "subdomain": domainPrefix
         }
   };
   // optional stuff
   if (doc.first_name) targetDoc.creation.first_name = doc.first_name;
   if (doc.last_name)  targetDoc.creation.last_name = doc.last_name;

   return targetDoc;
}



function createUser(fullDomain, username, password_sha, password_salt, callback) {
    var doc = {};
    doc._id = 'org.couchdb.user:' + username;
    doc.name = username;
    doc.type = 'user';

    doc.roles = [];


    doc.salt = password_salt;
    doc.password_sha = password_sha;

    var encoded_id = encodeURIComponent(doc._id);
    var url = 'https://' + fullDomain + '/_users/'  + encoded_id;
    request({uri: url, method: "PUT", body: doc}, function (err, resp, body) {
        if (err) callback('ahh!! ' + err);        
        if (!body.ok) callback('error creating user: ' + body);
        callback();
    })


}

function setAdmin(fullDomain, dbName, username, callback) {
  var url = 'https://' + fullDomain + '/' + dbName + "/_security";
  var data = {"admins":{"names":[username],"roles":[]},"members":{"names":[],"roles":[]}};

  request({uri: url, method: "PUT", body: data}, function (err, resp, body) {
    if (err) callback('ahh!! ' + err);
    if (!body.ok) callback('error setting admin: ' + body);
    callback();
  })
}

function createAdmin(fullDomain, username, password_sha, password_salt, callback) {
    var url = 'https://' + fullDomain + '/_couch/_config/admins/' + username;
    var pwd = JSON.stringify('-hashed-' + password_sha + ',' + password_salt);
    request({uri: url, method: "PUT", body: pwd}, function (err, resp, body) {
        if (err) callback('ahh!! ' + err);
        callback();
    })
}

function turnOffSecureRewrites(fullDomain, callback) {
    var url  = 'https://' + fullDomain + '/_config/httpd/secure_rewrites';
    var path = JSON.stringify("false");
    request({uri: url, method: "PUT", body: path}, function (err, resp, body) {
        if (err) callback('ahh!! ' + err);
        callback();
    })
}


function addVhosts(fullDomain, callback) {
    var url  = 'https://' + fullDomain + '/_config/vhosts/' + fullDomain;
    var path = JSON.stringify("/dashboard/_design/dashboard/_rewrite/");
    request({uri: url, method: "PUT", body: path}, function (err, resp, body) {
        if (err) callback('ahh!! ' + err);

        // make sure the dashboard can be reached directly
        url = url + '%2Fdashboard';
        path = JSON.stringify('/dashboard');
        log.debug('adding vhosts to ' + url);
        log.debug(path);
        request({uri: url, method: "PUT", body: path}, function (err, resp, body) {
           if (err) callback('ahh!! ' + err);
           callback();
       });
    })    
}




function domainPrefix(doc) {
    return doc.space;
}







function registerApp(appURL, doc, db, callback) {
  // addVhost(appURL, "/" + doc.dataset + "/_design/" + doc.ddoc + "/_rewrite").then(function() {
    request.post({url: db, body: _.extend({}, doc, {url: appURL})}, function(e,r,b) {
      if (callback) callback(b)
    })
  // });
}

function absolutePath(pathname) {
  if (pathname[0] === '/') return pathname
  return path.join(process.env.PWD, path.normalize(pathname));
}



function replicate(couch, source, target, ddoc, callback) {
  var reqData = {"source": source,"target": target, "create_target": true};
  if (ddoc) reqData["doc_ids"] = [ddoc];
  request({uri: couch + "/_replicate", method: "POST", body: reqData}, function (err, resp, body) {
    if (err) callback(err)
    if (body.doc_write_failures > 0) callback('error creating: ' + body);
    callback();
  })

}

function checkExistenceOf(url, callback) {
  log.debug('check existance of' +  url);
  try {
       http.get(url, function(resp) {
          callback(null, resp);
       }).on('error', callback);
  } catch(e) { callback(e) }
}



function adjust_dashboard_settings(fullDomain, callback){
    var dashboard_db = require('nano')('http://' + fullDomain + '/dashboard');

    dashboard_db.attachment.get('_design/dashboard', 'rabbit.png', function(err, body) {
      if (!err) {
        fs.writeFile('rabbit.png', body);
      }
    });


    // this sucks, should not have to duplicate this.
    var settings = {
        _id: 'settings',
        frontpage : {
            use_markdown : true,
            use_html : false,
            show_activity_feed : false,
            markdown : "## Welcome to your Garden\n\nHere are some things you might want to do:\n\n- [Configure](./settings#/frontpage) this front page.\n- [Install](./install) some apps.\n\n"
        },
        host_options : {
            short_urls : true,
            hostnames : 'http://localhost:5984,http://' + fullDomain,
            short_app_urls : true,
            rootDashboard : true,
            hosted : true,
            login_type : 'local'
        },
        top_nav_bar : {
            bg_color : '#1D1D1D',
            link_color : '#BFBFBF',
            active_link_color : '#FFFFFF',
            active_link_bg_color : '#000000',
            active_bar_color : '#bd0000',
            show_brand: true,
            icon_name: "garden-24.png",
            brand_link: "http://garden20.com",
            show_gravatar : true,
            show_username : true,
            notification_theme: 'libnotify',
            admin_show_futon : false
        },
        sessions : {
            type : 'internal',
            internal : {
                login_type: 'local',
                redirect_frontpage_on_anon : false
            },
            other : {
                login_url : '/users/_design/users-default/_rewrite/#/login',
                login_url_next : '/users/_design/users-default/_rewrite/#/login/{next}',
                signup_url : '/users/_design/users-default/_rewrite/#/signup',
                profile_url : '/users/_design/users-default/_rewrite/#/profile/{username}'
            }
        }
    }

    dashboard_db.insert(settings, function(err, body){
        if (err) return callback(err);
        fs.createReadStream('garden-24.png').pipe(
            dashboard_db.attachment.insert('settings', 'garden-24.png', null, 'image/png', {rev : body.rev}, function(err){
                callback(null);
            })
        );
    });
}


