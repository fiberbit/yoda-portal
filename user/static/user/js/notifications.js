"use strict";

$(function() {
    $("body").on("click", "a.list-group-item > h5.dismiss-notification", function(e) {
        e.preventDefault();
        let identifier = $(this).attr('data-id');
        $(this).closest('a.list-group-item').remove();
        Yoda.call('notifications_dismiss', {identifier: identifier}).then((data) => {
            if (!$("a.list-group-item > h5.dismiss-notification").length) {
                location.reload();
            }
        });
    });

    $("body").on("click", "a#notifications_dismiss_all", function(e) {
        e.preventDefault();
        Yoda.call('notifications_dismiss_all',
                  {}).then((data) => {
            location.reload();
        });
    });
});
