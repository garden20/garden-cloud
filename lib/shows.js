
var templates = require('duality/templates');
var userTypes = require('./userType');

exports.not_found = function (doc, req) {
    return {
        code: 404,
        title: 'Not found',
        content: templates.render('404.html', req, {})
    };
};

exports.install = function(doc, req) {
    return {
        code: 200,
        title: 'Install Application',
        content: templates.render('install.html', req, {
            app_url: req.query.app_url
        })
    };

}

exports.get = function(doc, req) {
    return {
        code: 200,
        title: 'Get A Garden',
        style_body : true,
        content: templates.render('get_garden.html', req, {

        })
    };
}


exports.index = function(doc, req) {

    if (req.query.app_url) {
        return {
            code: 200,
            title: 'Install Application',
            content: templates.render('install.html', req, {
                app_url: req.query.app_url
            })
        };
    } else {
        return {
            code: 200,
            title: 'Install Application',
            style_body : true,
            content: templates.render('frontpage.html', req, {

            })
        };
    }
}