$(function() {
    attachBase();
});




function removeBase() {
    $('#jConfirm_demo').unbind();
    $('#example1').unbind();
}




function attachBase() {
    
    
    
    refreshSideNavWidth();
    $(window).resize(function() {
        refreshSideNavWidth();
    });
    
    
    
    
    $('#jConfirm_demo').click(function() {
        
        /* Get config for template variables */
        var objConfig = $.jconfirm('getConfig');

        /* Create the template */
        var html = '<div id="'+objConfig.outerWrapperId+'" class="jconfirm_wrapper">';
        html += '<div id="'+objConfig.wrapperId+'" class="jconfirm_inner">';
        html += '<a href="#" class="jconfirm_close close">&times;</a>'

        /* Title */
        html += '<h4 class="jconfirm_title">'
        html += objConfig.title;
        html += '</h4>';

        /* Message */
        html += '<div class="jconfirm_message">'
        html += objConfig.message;
        html += '</div>';

        /* Action buttons */
        html += '<div class="jconfirm_buttons btn-toolbar"><div class="btn-group">';
        html += '<a href="#" id="'+objConfig.confirmTrigger+'" class="jconfirm_success btn btn-info"><i class="icon-white icon-ok"></i> ';
        html += objConfig.confirm;
        html += '</a>';
        html += '<a href="#" id="'+objConfig.cancelTrigger+'" class="jconfirm_fail btn">';
        html += objConfig.cancel;
        html += ' <i class="icon-remove"></i></a>';
        html += '</div></div>';

        html += '</div>';
        html += '</div>';

        $.jconfirm({
            title: 'Do you think this plugin is stupendous?',
            message: 'This is an example of jConfirm. If you click "Yes" or\n\
                press &lt;Enter&gt;, you will fire the callback. Clicking "No"\n\
                or pressing &lt;Esc&gt; will close this box.<br /><br /><small>\n\
                <strong>NB.</strong> This callback only fires an alert - nothing\n\
                nasty. Promise.</small>',
            confirm: 'Yes',
            cancel: 'No',
            template: html
        }, function() {
            alert('Thanks - this is an example of a callback.');
            return false;
        });
        
        return false;
        
    });
    
    
    
    
    
    $('#example1').click(function() {
        $.jconfirm(function() {
            alert('That was example 1');
            return false;
        });
        return false;
    });
    
    
    
    
    
    $('#example2').click(function() {
        $.jconfirm({
            title: 'We can add a question here',
            message: 'If it requires some explanation, we can add further\n\
                information here',
            confirm: 'Success',
            cancel: 'Fail'
        }, function() {
            alert('That was example 2');
            return false;
        });
        return false;
    });
    
    
    
    
    
$('#example3').click(function() {
    var objConfig = $.jconfirm('getConfig');

    /* Create the template */
    var html = '<div id="'+objConfig.outerWrapperId+'" class="jconfirm_wrapper">';
    html += '<div id="'+objConfig.wrapperId+'" class="jconfirm_inner">';
    html += '<a href="#" class="jconfirm_close close">&times;</a>'

    /* Title */
    html += '<h4 class="jconfirm_title">'
    html += objConfig.title;
    html += '</h4>';

    /* Message */
    html += '<div class="jconfirm_message">'
    html += objConfig.message;
    html += '</div>';

    /* Action buttons */
    html += '<div class="jconfirm_buttons">';
    html += '<a href="#" id="'+objConfig.confirmTrigger+'" class="jconfirm_success btn btn-info">';
    html += objConfig.confirm;
    html += '</a>';
    html += '<a href="#" id="'+objConfig.cancelTrigger+'" class="jconfirm_fail btn">';
    html += objConfig.cancel;
    html += '</a>';
    html += '</div>';

    html += '</div>';
    html += '</div>';

    $.jconfirm({
        template: html
    }, function() {
        alert('That was example 3');
        return false;
    });
    return false;
});
    
    
    
    
}


function refreshSideNavWidth() {
    $('.bs-docs-sidenav.affix').each(function() {
        var width = $(this).parents('.bs-docs-sidebar').width();
        $(this).css('width', width);
    });
}