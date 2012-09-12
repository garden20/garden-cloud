$(function(){
    if ($('#dashboard-topbar').data('ready')) {
        decorate();
    } else {
        $('#dashboard-topbar').live('ready', decorate);
    }

    function decorate() {
        var userCtx = JSON.parse(decodeURI($('#dashboard-topbar-session').data('userctx')));
        if (userCtx.name) {
            $.getJSON('/_users/org.couchdb.user:' + userCtx.name , function(data){
                if (data.space) {
                    var link = 'http://' + data.space + '.' + window.location.host;

                    var m_right = $('#dashboard-topbar-session').width() + 20;

                    var $btn = $('<a class="btn" href="'+ link +'">Go to your garden</a>');
                    $btn.css({
                        position: 'absolute',
                        top: '3px',
                        right: '0',
                        'margin-right': m_right + 'px',
                        padding: '1px 4px',
                        'font-size': '11px',
                        'line-height': '15px'
                    });
                    $('#dashboard-topbar').append($btn);
                }
            })
        }
    }


})