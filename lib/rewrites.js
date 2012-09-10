/**
 * Rewrite settings to be exported from the design doc
 */

module.exports = [
    {from: '/static/*', to: 'static/*'},
    {from: '/packages/*', to: 'packages/*'},
    {from: '/install', to: '_show/install'},
    {from: '/get', to: '_show/get'},
    {from: '/get/', to: '_show/get'},
    {from: '/', to: '_show/index'},
    {from: '/install', to: '_show/install'},
    {from: '/overview.html', to: 'overview.html'},
    {"from": "/_db/*", "to": "../../*" },
    {"from": "/_db", "to": "../.." },
    {from: '*', to: '_show/not_found'}
];