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
  ;

// for nodejitsu -- they require a running server
require('http').createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('database provisioner is up\n');
}).listen(1337);

var src_db_root = process.env['SRC_COUCH_ROOT'];
var src_db = src_db_root + '/garden20';
var dst_db = process.env['DST_COUCH_ROOT'] + '/hosting_public';
var hosting_root = process.env['HOSTING_ROOT'];

console.log('starting...');

follow({db: src_db, include_docs: true, filter: "garden20/newRequest", since : "now"}, function(error, change) {
    if (error || !("doc" in change)) return;
    var doc = change.doc;

    console.log(doc);

    var domain = domainPrefix(doc);
    var fullDomain = domain + '.' + hosting_root;
    var targetDoc = createTargetDoc(doc, domain);
    var start_time = new Date();

    console.log(targetDoc);

    async.waterfall([
        function(callback){
            createCouchPost(dst_db, targetDoc, callback);
        },
        function(callback){
            waitForCouch(fullDomain, callback);
        },
        function(callback){
            installDashboard(src_db_root, fullDomain, callback);
        },
        function(callback) {
            createUser(fullDomain, doc.email, doc.password_sha, doc.salt, callback)
        },
        function(callback) {
            setAdmin(fullDomain, 'dashboard', doc.email, callback);
        },
        function(callback) {
            createAdmin(fullDomain, doc.email, doc.password_sha, doc.salt, callback)
        }


    ], function(err) {
        if (err) return console.log('workflow problem:  ' + JSON.stringify(err));
    });
})


function createCouchPost(url, targetDoc, callback) {
  console.log('create couch', url);
  request({
      uri: url,
      method: "POST",
      json : targetDoc
  },
  function (err, resp, body) {
    if (err) callback('ahh!! ' + err);
    var response = body;
    console.log(response);
    if (!response) response = {"ok": true};
    if (!response.ok) callback(url + " - " + body);
    callback();
  })
  
}


function waitForCouch(fullDomain, callback) {
  console.log('wait for couch');
  var couchNotUp = true;
  var start = new Date().getTime();
  async.whilst(
        function () {return couchNotUp;},
        function (callback) {
            checkExistenceOf('http://' + fullDomain, function(status){
                var now = new Date().getTime();
                var elapsed = now - start;
                if (elapsed > 10000) callback('Timeout, waiting for couch');
                console.log(status);
                if (status && status !== 404 ) couchNotUp = false;
                // prob should be kind and do a settimeout
                callback();
            });
        },
        function (err) {
            callback(err);
        }
   );
}


function installDashboard(src_db_root, fullDomain, callback) {
   console.log('install dashboard');
   replicate(src_db_root, 'garden20', 'http://' + fullDomain + '/dashboard', '_design/dashboard', function(err){
       console.log('replicate cmmd fin');
       console.log(err);
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


    var url = 'https://' + fullDomain + '/_users/'  + doc._id;
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
    var url = 'https://' + fullDomain + '/_config/admins/' + username;
    var pwd = JSON.stringify('-hashed-' + password_sha + ',' + password_salt);
    request({uri: url, method: "PUT", body: pwd}, function (err, resp, body) {
        if (err) callback('ahh!! ' + err);
        callback();
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
  console.log('check existance', url);
  request({uri: url, method: "HEAD", json: false}, function(err, resp, body) {
     callback(resp.statusCode);
  })
}



function addVhost(url, couchapp) {
  var dfd = deferred();
  request({uri: couch + "/_config/vhosts/" + encodeURIComponent(url), method: "PUT", body: JSON.stringify(couchapp), json: false}, function (err, resp, body) {
    console.log(body)
    if (err) throw new Error('ahh!! ' + err);
    dfd.resolve(body);
  })
  return dfd.promise();
}

