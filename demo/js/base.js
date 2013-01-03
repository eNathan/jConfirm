$(function() {
    attachBase();
});




function removeBase() {
    $('#jConfirm_demo').unbind();
}




function attachBase() {
    
    
    
    
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
            message: 'This is an example of jConfirm. If you click "Yes" or press <Enter>, you will fire the callback. Clicking "No" or pressing <Esc> will close this box.',
            confirm: 'Yes',
            cancel: 'No',
            template: html
        }, function() {
            alert('Thanks - this is an example of a callback.');
            return false;
        });
        
        return false;
        
    });
    
    
    
    
}