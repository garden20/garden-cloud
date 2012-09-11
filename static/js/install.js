var dashboard_core = require('lib/dashboard_core');
var datelib = require('datelib');
var handlebars = require('handlebars');

$(function(){
    var app_url = $('#details_sidebar').data('appurl');
    console.log(app_url);
    dashboard_core.getGardenAppDetails(app_url, function(err, results) {
        if (err) return console.log('error', err);

        $('#details_sidebar').html(handlebars.templates['second_bar.html']({meta : results, hosted: true}));
        //$('.loading').html(handlebars.templates['install_app_info.html'](remote_app_details, {}));
    })
});