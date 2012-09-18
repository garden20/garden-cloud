var _ = require('underscore')._;
var handlebars = require('handlebars');
var garden_urls = require('lib/garden_urls');
var userType = require('lib/userType');
var couch = require('db');
var current_db = couch.use('./_db');
var session = require('session');
var sha1 = require('sha1');
var gravatar = require('gravatar');
var users = require('users');
var session = require('session');


$(function() {



    //$('.spy-on-me').scrollspy();



  var email = amplify.store('email');
  if (email) {
      $('form.login input[name="name"]').val(email);
  }

  var availablity = $('.availablity');
  var go_button   = $('.go-button');


  var available = function(isAvailable) {
      if (isAvailable) {
        availablity.text('Yes, available.');
        go_button.removeClass('disabled');
        go_button.removeAttr('disabled');
      } else {
        availablity.text('Sorry, not available.');

        go_button.attr('disabled', 'disabled');
        go_button.addClass('disabled');
      }
  }

  // localhost hack
  if (window.location.hostname === 'localhost' || window.location.port == 5984) {
      var random = Math.round((Math.random() * 100000));
      $('form.main input[name="space"]').val('test-garden20-' + random);
  }



  $('form.login').live('submit', function() {
        var action = $(this).attr('action');
        if (action !== 'UNSET') {
            return true;
        }
        if (action === 'UNSET') {
            var me = $(this);
            try {
                var username = $('form.login input[name="name"]').val();
                var pw = $('form.login input[name="password"]').val();
                session.login(username, pw, function (err, response) {
                    if (err) return alert('invalid user/password');
                    // get the current user doc
                    users.get(username, function (err, doc) {
                        if (err) return alert(err);
                        var url = generateGardenLink();
                        var session_url = 'http://' + doc.space + '.garden20.com/_session?next=' + url;
                        me.attr('action', session_url);
                        me.submit();

                        return false;
                    });
                });

            } catch (e) {
                console.log(e);
                return false;
            }


        } 
        return false;
  });



  $('form.main input[name="space"]').live('change', function() {
      var space = $(this).val();

      if (space) {
          availablity.text('Checking availablity...');

          var url = 'https://hosting.iriscouch.com/hosting_public/Server%2f' + space + "?callback=?"
            $.ajax({
                url : url,
                dataType : 'jsonp',
                json : true,
                timeout: 3500,
                success : function(data) {
                    //console.log(data)
                },
                error : function() {
                    //console.log('available')
                },
                complete: function(xhr, data) {
                    if (xhr.status == 0) {
                        available(true);
                        $('.space_name').text(space);
                    }

                    else
                        available(false)
                }
            });
      }
  });


  
  function showSignupErrors(errors) {
      $('form .error').show();
      var ul = $('form .error ul');
      ul.empty();

      if (_.isArray(errors)) {
          $.each(errors, function(i, error) {
              ul.append('<li>' + error + '</li>');
          });
      }
      if (_.isString(errors)) {
          ul.append('<li>' + errors + '</li>');
      }


  }

  function validate(details, password, confirm_password) {
      var errors = [];
      if (!_.isString(details.email) || details.email === "") errors.push("Please enter an email.");
      if (!_.isString(details.space) || details.space === "") errors.push("Please enter a space.");
      if (!_.isString(password) || password === "") errors.push("Please enter a password.");
      if (!_.isString(confirm_password) || confirm_password === "") errors.push("Please confirm your password.");
      if (password !== confirm_password) errors.push("Passwords dont match");
      return errors;
  }


  function showProgress(progress, details) {
      if (progress.percent < 0) {
          showSignupErrors(progess.state);
          $('.install-info .bar').css('width', '100%');
          $('.install-info .progress').addClass('bar-danger').removeClass('active');
            return;
      }
      $('.install-info h4').text(progress.state);
      $('.install-info .bar').css('width', progress.percent + '%');

      if (progress.complete) {
        $('.install-info .bar').css('width', '100%');
        $('.install-info .progress').removeClass('active');

        $('.install-complete').show();
        $('html, body').animate({ scrollTop: $(".install-complete").offset().top }, 500);

        var url = generateGardenLink();
        var session_url = 'http://' + $('input[name="space"]').val() + '.garden20.com/_session?next=' + url;
        $('form.second').attr('action', session_url);
        $('form.second input[name="name"]').val( $('form.main input[name="email"]').val() );
        $('form.second input[name="password"]').val( $('form.main input[name="password"]').val() );


        // store the users email, for convience
        amplify.store('email', details.email);

      } 
  }

  function generateGardenLink() {
      var base = '/';
      var app_url = $('#details_sidebar').data('appurl');
      if (app_url) {
          base += 'install?app_url=' + app_url;
      }
      return base;
      
  }



  $('form.main').live('submit', function() {
      var app_url = $('#details_sidebar').data('appurl');

      var pw = $('form.main input[name="password"]').val();
      var cpw = $('form.main input[name="confirm_password"]').val();
      var email = $('form.main input[name="email"]').val();

      var details = {
          space: $('form.main input[name="space"]').val(),
          first_name: $('form.main input[name="first_name"]').val(),
          last_name: $('form.main input[name="last_name"]').val(),
          email: email
      }
      details.subtype = 'request';
      details.start = new Date().getTime();
      if (app_url) {
          details.app_url = app_url;
      }

      details.gravitar_hash = gravatar.hash(details.email);



      var errors = validate(details, pw, cpw);
      if (errors.length > 0) {
          showSignupErrors(errors);
          return false;
      }

      var monitor_doc = {
          _id : details.gravitar_hash,
          type : 'request',
          start : new Date().getTime()
      }
      if (app_url) {
          monitor_doc.app_url = app_url;
      }


      current_db.saveDoc(monitor_doc, function(err, resp) {
         if(err) {
             //console.log(err);
             // might want to check err.error == 'conflict';
             return showSignupErrors('This email address has been used');
         }
         users.create(email, pw, details, function(err){
              //console.log(err);
              // might want to check err.error == 'conflict';
               if (err) return showSignupErrors('This email address has been used');
               $('.start-install').hide();
               $('.install-info').show();
               current_db.changes({
                   filter : 'garden20/signupProgress',
                   include_docs : true,
                   id : monitor_doc._id
               }, function(err, resp) {

                   if (err) return console.log('error in changes: ' + err);

                   var progress = resp.results[0].doc;
                   showProgress(progress, details);
               });
               // also login this user!
              session.login(email, pw, function (err, response) {
                  // reload the topbar?
                  // .. must invalidate the cookie
                  createCookie('last-dashboard-cache', "", -1);
              });

         });
      });
      return false;
  })

    function createCookie(name, value, days) {
        if (days) {
            var date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            var expires = "; expires=" + date.toGMTString();
        }
        else var expires = "";
        document.cookie = name + "=" + value + expires + "; path=/";
    }

   // $('.tt').tooltip();

});



