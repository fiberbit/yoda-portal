"use strict";

$(document).ajaxSend(function(e, request, settings) {
    // Append a CSRF token to all AJAX POST requests.
    if (settings.type === 'POST' && settings.data.length) {
         settings.data
             += '&' + encodeURIComponent(Yoda.csrf.tokenName)
              + '=' + encodeURIComponent(Yoda.csrf.tokenValue);
    }
});

let preservableFormatsLists = null;
let currentFolder;

$(function() {
    // Extract current location from query string (default to '').
    currentFolder = decodeURIComponent((/(?:\?|&)dir=([^&]*)/
                                        .exec(window.location.search) || [0,''])[1]);

    // Canonicalize path somewhat, for convenience.
    currentFolder = currentFolder.replace(/\/+/g, '/').replace(/\/$/, '');


    if ($('#file-browser').length) {
        startBrowsing(browsePageItems);
    }

    $('.btn-group button.metadata-form').click(function(){
        showMetadataForm($(this).attr('data-path'));
    });

    ////////////////////////////////////////////////
    // File and folder management from context menu
    ////////////////////////////////////////////////
    $('.btn-group button.folder-create').click(function(){
        // Destroy earlier alerts
        fileMgmtDialogAlert('folder-create', '');

        // Set initial values
        $('#path-folder-create').val('');
        $('#folder-create #collection').html($(this).attr('data-path')); // for user
        $('.btn-confirm-folder-create').attr('data-path', $(this).attr('data-path'));

        $('#folder-create').modal('show');
    });

    // handle addition of new folder to
    $('.btn-confirm-folder-create').click(function() {
        // er kan een dubbele naam zijn? error handling afwikkelen!
       handleFolderAdd($('#path-folder-create').val(), $(this).attr('data-path'));
    });

    // FOLDER rename
    $("body").on("click", "a.folder-rename", function() {
        fileMgmtDialogAlert('folder-rename', '');

        // set initial values for further processing and user experience
        $('#folder-rename-name').val($(this).attr('data-name'));
        $('#org-folder-rename-name').val($(this).attr('data-name'));
        $('#folder-rename #collection').html($(this).attr('data-collection'));
        $('.btn-confirm-folder-rename').attr('data-collection', $(this).attr('data-collection'));

        $('#folder-rename').modal('show');
    });
    $('.btn-confirm-folder-rename').click(function() {
        handleFolderRename($('#folder-rename-name').val(), $(this).attr('data-collection'), $('#org-folder-rename-name').val());
    });

    // FOLDER delete
    $("body").on("click", "a.folder-delete", function() {
        fileMgmtDialogAlert('folder-delete', '');

        // set initial values for further processing and user experience
        $('#folder-delete #collection').html($(this).attr('data-collection'));
        $('#folder-delete-name').html($(this).attr('data-name'));
        $('.btn-confirm-folder-delete').attr('data-collection', $(this).attr('data-collection'));
        $('.btn-confirm-folder-delete').attr('data-name', $(this).attr('data-name'));

        $('#folder-delete').modal('show');
    });

    $('.btn-confirm-folder-delete').click(function() {
        handleFolderDelete($(this).attr('data-collection'), $(this).attr('data-name'));
    });

    // Clean up temporary files.
    $("body").on("click", "a.action-cleanup", function() {
        fileMgmtDialogAlert('cleanup-collection', '');

        let folder = $(this).attr('data-folder');
        $('#cleanup-collection #collection').html($(this).attr('data-folder'));
        $('.btn-confirm-cleanup-collection').attr('data-collection', $(this).attr('data-folder'));

        $('#cleanup-files').html("");
        Yoda.call('research_list_temporary_files',
                  {coll: Yoda.basePath + folder}).then((data) => {
            let full_path = Yoda.basePath + folder;
            let length = full_path.length + 1;

            if (data.length==0){
                $('#cleanup-files').html("No files found requiring cleanup action.");
                return;
            }

            $('#cleanup-files').html(`<div class="col-md-12"><input type="checkbox" class="form-check-input ms-1 cleanup-check-all"> Select all files</div>`);
            $.each(data, function(index, file_data) {
                let file = file_data[0] + '/' + file_data[1]
                let file_relative = file.substring(length);
                addCleanupFile(file_data, file_relative, index);
            });
            $('.cleanup-check-all').click(function() {
                // "cleanup-select-file"
                $(".cleanup-select-file").prop('checked', $(this).is(":checked"));
            });
            $('.cleanup-single-file').click(function() {
                let coll_name = $(this).attr("coll-name");
                let data_name = $(this).attr("data-name");
                let row_id = $(this).attr("row-id")
                if (confirm("Are you sure you want to delete '" + coll_name + '/' + data_name + "'?") == true) {
                    handleCleanupFileDelete(coll_name, data_name);
                    // Remove deleted file from active view
                    $('#row-id-' + row_id).remove();
                    if ($('#cleanup-files').html() == '') {
                        $('#cleanup-files').html("No files found requiring cleanup action.");
                    }
                    // Synchronise browse view with deleted file
                    browse(folder);
                }
            });
        });

        $('#cleanup-collection').modal('show');
    });

    // Show checksum report
    $("body").on("click", "a.action-show-checksum-report", function() {
        let folder = $(this).attr('data-folder');
        let download_url = 'browse/download_checksum_report?path=' + encodeURIComponent(folder);

        $('#showChecksumReport .collection').text(folder);
        $('#showChecksumReport .modal-body #checksumReport').html('');
        $('#showChecksumReport .modal-footer .download-report-text').attr('href', download_url + '&format=text');
        $('#showChecksumReport .modal-footer .download-report-csv').attr('href', download_url + '&format=csv');

        Yoda.call('research_manifest',
            {coll: Yoda.basePath + folder}).then((data) => {
            let table = '<table class="table table-striped"><tbody>';

            table += '<thead><tr><th>Filename</th><th>Checksum</th></thead>';
            $.each(data, function( index, obj ) {
                table += `<tr>
                     <td>${obj.name}</td>
                     <td>${obj.checksum}</td>
                </tr>`;
            });
            table += '</tbody></table>';

            $('#showChecksumReport .modal-body #checksumReport').html(table);
            $('#showChecksumReport').modal('show');
        });
    });

    $('.btn-confirm-cleanup-collection').click(function() {
        $(".cleanup-select-file").each(function(index,item){
            if ($(item).is(":checked")) {
                let coll_name = $(this).attr("coll-name");
                let data_name = $(this).attr("data-name");
                let row_id = $(item).attr("row-id");
                handleCleanupFileDelete(coll_name, data_name);
                $('#row-id-' + row_id).remove();
                if ($('#cleanup-files').html() == '') {
                    $('#cleanup-files').html("No files found requiring cleanup action.");
                }
            }
        });
        browse($(this).attr('data-collection'));
        Yoda.set_message('success', 'Successfully cleaned up folder ' + $(this).attr('data-collection'));
        $('#cleanup-collection').modal('hide');
    });

    // FILE rename
    $("body").on("click", "a.file-rename", function() {
        // Destroy earlier alerts
        fileMgmtDialogAlert('file-rename', '');

        // set initial values for further processing and user experience
        $('#file-rename-name').val($(this).attr('data-name'));
        $('#org-file-rename-name').val($(this).attr('data-name'));
        $('#file-rename #collection').html($(this).attr('data-collection'));
        $('.btn-confirm-file-rename').attr('data-collection', $(this).attr('data-collection'));

        $('#file-rename').modal('show');
        // input text selection handling - select all text in front of last '.'
        $('#file-rename-name').focus();
        var endSelection = $(this).attr('data-name').lastIndexOf('.');
        if (endSelection == -1) {
            endSelection = $(this).attr('data-name').length
        }
        document.getElementById('file-rename-name').setSelectionRange(0, endSelection);
    });

    $('.btn-confirm-file-rename').click(function() {
        handleFileRename($('#file-rename-name').val(), $(this).attr('data-collection'), $('#org-file-rename-name').val());
    });

    // FILE delete
    $("body").on("click", "a.file-delete", function() {
        // Destroy earlier alerts
        fileMgmtDialogAlert('file-delete', '');

        // set initial values for further processing and user experience
        $('#file-delete #collection').html($(this).attr('data-collection'));
        $('#file-delete-name').html($(this).attr('data-name'));
        $('.btn-confirm-file-delete').attr('data-collection', $(this).attr('data-collection'));
        $('.btn-confirm-file-delete').attr('data-name', $(this).attr('data-name'));

        $('#file-delete').modal('show');
    });

    $('.btn-confirm-file-delete').click(function() {
        handleFileDelete($(this).attr('data-collection'), $(this).attr('data-name'));
    });

    // FILE stage
    $("body").on("click", "a.file-stage", function() {
        handleFileStage($(this).attr('data-collection'), $(this).attr('data-name'));
    });

    // Flow.js upload handler
    var r = new Flow({
        target: '/research/upload',
        chunkSize: 25 * 1024 * 1024,
        forceChunkSize: true,
        simultaneousUploads: 1,
        query: {'csrf_token': Yoda.csrf.tokenValue, filepath : ''}
    });
    // Flow.js isn't supported, fall back on a different method
    if (!r.support) {
        Yoda.set_message('error', 'No upload browser support.');
    }

    // Assign upload places for dropping/selecting files
    r.assignDrop($('.upload-drop')[0]);
    r.assignBrowse($('.upload-file')[0]);
    r.assignBrowse($('.upload-folder')[0], true);

    // When chosing to close overview of upload overview then all incomplete file uploads will be canceled.
    $('.btn-close-uploads-overview').click(function() {
        r.cancel();
        $('#files').html("");
        $('#uploads').addClass('hidden');
        // clear information present for next time dialog is presented
        $('.uploads-progress-information').html('');
        $('.uploads-total-progress-bar').css('width', '0%');
        $('.uploads-total-progress-bar-perc').html('0%');
    });

    // Flow.js handle events
    r.on('filesAdded', function(files){
        if (files.length) {
            $('#files').html("");
            // clear information present for new totals
            $('.uploads-progress-information').html('');
            $('.uploads-total-progress-bar').css('width', '0%');
            $('.uploads-total-progress-bar-perc').html('0%');

            $.each(files, function(key, file) {
                logUpload(file.uniqueIdentifier, file);

                let $self = $('#'+file.uniqueIdentifier);
                // Pause btn
                $self.find('.upload-pause').on('click', function () {
                    file.pause();
                    $self.find('.upload-pause').hide();
                    $self.find('.upload-resume').show();
                    $self.find('.msg').text('Upload paused');
                });
                // Resume btn
                $self.find('.upload-resume').on('click', function () {
                    file.resume();
                    $self.find('.upload-pause').show();
                    $self.find('.upload-resume').hide();
                    $self.find('.msg').html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i>');
                });
                // Cancel btn
                $self.find('.upload-cancel').on('click', function () {
                    file.cancel();
                    $self.remove();
                });
                // Retry btn
                $self.find('.upload-retry').on('click', function () {
                    file.retry();
                    $self.find('.upload-pause').show();
                    $self.find('.upload-retry').hide();
                    $self.find('.msg').html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i>');
                });
            });
        }
        $('#uploads').removeClass('hidden');
    });
    r.on('filesSubmitted', function() {
        let path = $('.upload').attr('data-path');
        r.opts.query.filepath = path;
        r.upload();
    });
    r.on('complete', function(){
        let path = $('.upload').attr('data-path');
        browse(path);
    });
    r.on('fileSuccess', function(file,message){
        $("#" + file.uniqueIdentifier + " .msg").html("<span class='text-success'>Upload complete</span>");
        let $self = $('#'+file.uniqueIdentifier);
        $self.find('.upload-btns').hide();
    });
    r.on('fileError', function(file, message){
        $("#" + file.uniqueIdentifier + " .msg").html("Upload failed");
        $("#" + file.uniqueIdentifier + " .progress-bar").css('width', '0%');
        let $self = $('#'+file.uniqueIdentifier);
        $self.find('.upload-pause').hide();
    });
    r.on('fileProgress', function(file){
        var percent = Math.floor(file.progress()*100);
        $("#" + file.uniqueIdentifier + " .progress-bar").css('width', percent + '%');

        // presentation of totalised datasize percentages
        var total_size = 0;
        var total_size_uploaded = 0;
        // presentation of totalised file counts
        var count_total = 0;
        var count_total_completed = 0;
        $.each(r.files, function(key, flow_file) {
            // id has to be present in frontend as r.files contains all files (including the ones already uploaded)
            if($('#'+flow_file.uniqueIdentifier).length) {
                // size totals
                total_size += flow_file.size;
                total_size_uploaded += flow_file.size*flow_file.progress();
                // count totals
                count_total++;
                if (flow_file.progress()==1) {
                    count_total_completed++;
                }
            }
        });
        $('.uploads-progress-information').html('&nbsp;-&nbsp;completed ' + count_total_completed.toString() + ' of ' + count_total.toString());
        $('.uploads-total-progress-bar').css('width', Math.floor((total_size_uploaded/total_size)*100) + '%');
        $('.uploads-total-progress-bar-perc').html(Math.floor((total_size_uploaded/total_size)*100) + '%');
    });

    $("body").on("dragbetterenter",function(event){
        $('.upload-drop').addClass('drag-upload');
        Yoda.set_message('success', 'Drop the files to the file browser.');
    });

    $("body").on("dragbetterleave",function(event){
        $('.upload-drop').removeClass('drag-upload');
        $('#messages').html('');
    });

    $("body").on("click", "a.view-video", function() {
        let path = $(this).attr('data-path');
        let viewerHtml = `<video width="640" controls autoplay><source src="browse/download?filepath=${htmlEncode(encodeURIComponent(path))}"></video>`;
        $('#viewer').html(viewerHtml);
        $('#viewMedia').modal('show');
    });

    $("body").on("click", "a.view-audio", function() {
        let path = $(this).attr('data-path');
        let viewerHtml = `<audio width="640" controls autoplay><source src="browse/download?filepath=${htmlEncode(encodeURIComponent(path))}"></audio>`;
        $('#viewer').html(viewerHtml);
        $('#viewMedia').modal('show');
    });

    $("body").on("click", "a.view-image", function() {
        let path = $(this).attr('data-path');
        let viewerHtml = `<img width="640" src="browse/download?filepath=${htmlEncode(encodeURIComponent(path))}" />`;
        $('#viewer').html(viewerHtml);
        $('#viewMedia').modal('show');
    });

    $("#viewMedia.modal").on("hidden.bs.modal", function() {
        $("#viewer").html("");
    });

    $("body").on("click", "a.action-lock", function() {
        lockFolder($(this).attr('data-folder'));
    });

    $("body").on("click", "a.action-unlock", function() {
        unlockFolder($(this).attr('data-folder'));
    });

    $("body").on("click", "a.action-submit", function() {
        submitToVault($(this).attr('data-folder'));
    });

    $("body").on("click", "a.action-check-for-unpreservable-files", function() {
        // Check for unpreservable file formats.
        // If present, show extensions to user.
        let folder = $(this).attr('data-folder');
        $("#file-formats-list").val('');

        $('#showUnpreservableFiles .help').hide();
        $('#showUnpreservableFiles .preservable').hide();
        $('#showUnpreservableFiles .advice').hide();
        $('#showUnpreservableFiles .unpreservable').hide();
        $('#showUnpreservableFiles .checking').hide();

        if (preservableFormatsLists === null) {
            // Retrieve preservable file format lists.
            Yoda.call('vault_preservable_formats_lists').then((data) => {
                preservableFormatsLists = data;

                $('#file-formats-list').html("<option value='' disabled selected>Select a file format list</option>");
                for (let list in data) {
                    if (data.hasOwnProperty(list)) {
                        $("#file-formats-list").append(new Option(data[list]['name'], list));
                    }
                }
                $('#showUnpreservableFiles').modal('show');
            });
        } else {
            $('#showUnpreservableFiles').modal('show');
        }
    });

    $("#file-formats-list").change(function() {
        let folder = $('a.action-check-for-unpreservable-files').attr('data-folder');
        let list   = $('#file-formats-list option:selected').val();
        if (!(list in preservableFormatsLists))
            return;

        $('#showUnpreservableFiles .checking').show();
        $('#showUnpreservableFiles .unpreservable').hide();
        $('#showUnpreservableFiles .preservable').hide();
        $('#showUnpreservableFiles .advice').hide();
        $('#showUnpreservableFiles .help'  ).hide();

        $('#showUnpreservableFiles .help'  ).text(preservableFormatsLists[list]["help"]);
        $('#showUnpreservableFiles .advice').text(preservableFormatsLists[list]["advice"]);

        // Retrieve unpreservable files in folder.
        Yoda.call('vault_unpreservable_files',
                  {coll: Yoda.basePath + folder, list_name: list}).then((data) => {
            $('#showUnpreservableFiles .checking').hide();
            $('#showUnpreservableFiles .help').show();
            if (data.length > 0) {
                $('#showUnpreservableFiles .list-unpreservable-formats').html('');
                for (let ext of data)
                    $('#showUnpreservableFiles .list-unpreservable-formats').append(`<li>${htmlEncode(ext)}</li>`);
                $('#showUnpreservableFiles .advice').show();
                $('#showUnpreservableFiles .unpreservable').show();
            } else {
                $('#showUnpreservableFiles .preservable').show();
            }
            $('#showUnpreservableFiles').modal('show');
        });
    });

    $("body").on("click", "a.action-unsubmit", function() {
        unsubmitToVault($(this).attr('data-folder'));
    });

    $("body").on("click", "a.action-accept", function() {
        acceptFolder($(this).attr('data-folder'));
    });

    $("body").on("click", "a.action-reject", function() {
        rejectFolder($(this).attr('data-folder'));
    });

    $("body").on("click", "i.lock-icon", function() {
        toggleLocksList($(this).attr('data-folder'));
    });

    $("body").on("click", "i.actionlog-icon", function() {
        toggleActionLogList($(this).attr('data-folder'));
    });

    $("body").on("click", "i.system-metadata-icon", function() {
        toggleSystemMetadata($(this).attr('data-folder'));
    });

    $("body").on("click", ".browse", function(e) {
        browse($(this).attr('data-path'), true);
        // Dismiss stale messages.
        $('#messages .close').click();
        e.preventDefault();
    });

    $("body").on("click", "a.action-go-to-vault", function() {
        window.location.href = '/vault/?dir=' + encodeURIComponent('/'+$(this).attr('vault-path'));
    });

    $("body").on("click", "input:checkbox[name='multiSelect[]']", function() {
        if ($("input:checkbox[name='multiSelect[]']:checked").length) {
            $('#multiSelect').removeClass('hide');
        } else {
            $('#multiSelect').addClass('hide');
        }
    });

    $("body").on("click", "input:checkbox[id='multi-select-all']", function() {
        if ($(this).is(':checked')) {
            if ($("input:checkbox[name='multiSelect[]']").length) {
                $("input:checkbox[name='multiSelect[]']").prop("checked", true);
                $('#multiSelect').removeClass('hide');
            }
        } else {
            $("input:checkbox[name='multiSelect[]']").prop("checked", false);
            $('#multiSelect').addClass('hide');
        }
    });

    dragElement(document.getElementById("uploads"));
});

// draggability of the upload overview div
function dragElement(elmnt) {
  var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  if (document.getElementById("uploads_header")) {
    document.getElementById("uploads_header").onmousedown = dragMouseDown;
  } else {
    elmnt.onmousedown = dragMouseDown;
  }

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
    elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

async function handleFolderAdd(new_folder, collection) {
    if (!new_folder.length) {
        fileMgmtDialogAlert('folder-create', 'Please add a folder name');
        return;
    }

    let result = await Yoda.call('research_folder_add',
        {   coll: Yoda.basePath +  collection,
            new_folder_name: new_folder
        },
        {'quiet': true, 'rawResult': true}
    );

    if (result.status == 'ok') {
        Yoda.set_message('success', 'Successfully added new folder: ' + new_folder + ' to ' + collection );
        browse(collection, true);
        $('#folder-create').modal('hide');
    }
    else {
        fileMgmtDialogAlert('folder-create', result.status_info);
    }
}


async function handleFolderRename(new_folder_name, collection, org_folder_name) {
    if (!new_folder_name.length) {
        fileMgmtDialogAlert('folder-rename', 'Please add a new folder name');
        return;
    }

    let result = await Yoda.call('research_folder_rename',
        {   new_folder_name: new_folder_name,
            coll: Yoda.basePath +  collection,
            org_folder_name: org_folder_name
        },
        {'quiet': true, 'rawResult': true}
    );

    if (result.status == 'ok') {
        Yoda.set_message('success', 'Successfully renamed folder to ' + new_folder_name );
        browse(collection, true);
        $('#folder-rename').modal('hide');
    }
    else {
        fileMgmtDialogAlert('folder-rename', result.status_info);
    }
}


async function handleFolderDelete(collection, folder_name) {
    let result = await Yoda.call('research_folder_delete',
        {
            coll: Yoda.basePath +  collection,
            folder_name: folder_name
        },
        {'quiet': true, 'rawResult': true}
    );

    if (result.status == 'ok') {
        Yoda.set_message('success', 'Successfully deleted folder ' + folder_name );
        browse(collection, true);
        $('#folder-delete').modal('hide');
    }
    else {
        fileMgmtDialogAlert('folder-delete', result.status_info);
    }
}


function addCleanupFile(file, file_relative, index) {
    let cfile = `<div class="col-md-12" id="${'row-id-' + index}">
                     <input type="checkbox" class="form-check-input ms-1 cleanup-select-file" data-name="${file[1]}" coll-name="${file[0]}" row-id="${index}">
                     <i class="fa-solid fa-trash-can cleanup-single-file" data-name="${file[1]}" coll-name="${file[0]}" row-id="${index}"></i> ${htmlEncode(file_relative)}
                 </div>`;
    $('#cleanup-files').append(cfile);
}


async function handleCleanupFileDelete(collection, file_name) {
    let result = await Yoda.call('research_file_delete',
        {
            coll: collection,
            file_name: file_name
        },
        {'quiet': true, 'rawResult': true}
    );

    if (result.status == 'ok') {
        fileMgmtDialogAlert('cleanup-collection', 'Successfully deleted ' + file_name);
    }
    else {
        fileMgmtDialogAlert('cleanup-collection', result.status_info);
    }
}


async function handleFileRename(new_file_name, collection, org_file_name) {
    if (!new_file_name.length) {
        fileMgmtDialogAlert('file-rename', 'Please add a new file name');
        return;
    }

    let result = await Yoda.call('research_file_rename',
        {   new_file_name: new_file_name,
            coll: Yoda.basePath +  collection,
            org_file_name: org_file_name
        },
        {'quiet': true, 'rawResult': true}
    );

    if (result.status == 'ok') {
        Yoda.set_message('success', 'Successfully renamed file to ' + new_file_name );
        browse(collection, true);
        $('#file-rename').modal('hide');
    }
    else {
        fileMgmtDialogAlert('file-rename', result.status_info);
    }
}

async function handleFileDelete(collection, file_name) {
    let result = await Yoda.call('research_file_delete',
        {
            coll: Yoda.basePath +  collection,
            file_name: file_name
        },
        {'quiet': true, 'rawResult': true}
    );

    if (result.status == 'ok') {
        Yoda.set_message('success', 'Successfully deleted file ' + file_name );
        browse(collection, true);
        $('#file-delete').modal('hide');
    }
    else {
        fileMgmtDialogAlert('file-delete', result.status_info);
    }
}


async function handleFileStage(collection, file_name) {
    let result = await Yoda.call('tape_archive_stage',
        {path: Yoda.basePath +  collection + "/" + file_name},
        {'quiet': true, 'rawResult': true}
    );

    if (result.status == 'ok') {
        Yoda.set_message('success', 'Successfully requested to bring file <' + file_name + '> online');
    }
    else {
        Yoda.set_message('error', 'Failed to request to bring file <' + file_name + '> online');
    }
}


// Alerts regarding folder/file management
function fileMgmtDialogAlert(dlgName, alert) {
    if (alert.length) {
        $('#alert-panel-' + dlgName + ' span').html(alert);
        $('#alert-panel-' + dlgName).show()
    }
    else {
        $('#alert-panel-' + dlgName).hide();
    }
}


function changeBrowserUrl(path)
{
    let url = window.location.pathname;
    if (typeof path != 'undefined') {
        url += "?dir=" + encodeURIComponent(path);
    }

    history.pushState({} , {}, url);
}

function browse(dir = '', changeHistory = false)
{
    currentFolder = dir;
    makeBreadcrumb(dir);
    if (changeHistory)
        changeBrowserUrl(dir);
    topInformation(dir, true); //only here topInformation should show its alertMessage
    buildFileBrowser(dir);
}

function makeBreadcrumb(dir)
{
    let pathParts = dir.split('/').filter(x => x.length);

    // [[Crumb text, Path]] - e.g. [...['x', '/research-a/x']]
    let crumbs = [['Research', ''],
                  ...Array.from(pathParts.entries())
                          .map(([i,x]) => [x, '/'+pathParts.slice(0, i+1).join('/')])];

    let html = '';
    for (let [i, [text, path]] of crumbs.entries()) {
        let el = $('<li class="breadcrumb-item">');
        text = htmlEncode(text).replace(/ /g, '&nbsp;');
        if (i === crumbs.length-1)
             el.addClass('active').html(text);
        else el.html(`<a class="browse" data-path="${htmlEncode(path)}"
                         href="?dir=${encodeURIComponent(path)}">${text}</a>`);

        html += el[0].outerHTML;
    }

    $('nav ol.breadcrumb').html(html);
}

function htmlEncode(value){
    //create a in-memory div, set it's inner text(which jQuery automatically encodes)
    //then grab the encoded contents back out.  The div never exists on the page.
    return $('<div/>').text(value).html().replace('"', '&quot;');
}

function buildFileBrowser(dir) {
    let fileBrowser = $('#file-browser').DataTable();
    getFolderContents.dropCache();
    fileBrowser.ajax.reload();

    return true;
}

// Fetches directory contents to populate the listing table.
let getFolderContents = (() => {
    // Close over some state variables.
    // -> we keep a multi-page cache handy, since getting only $page_length [=10]
    //    results each time is wasteful and slow.
    // A change in sort column/order or folder will invalidate the cache.

    // The amount of rows to request at once.
    // *Must* be equal to or greater than the largest datatables page length,
    // and *should* be smaller than iRODS SQL rows per batch.
    const batchSize = 200;
    // (~140 B per entry in JSON returned by iRODS,
    //  so depending on name = up to 28K to transfer for each fetch)

    let total          = false; // Total subcollections / data objects.
    let cache          = [];    // Cached result rows (may be more than shown on one page).
    let cacheStart     = null;  // Row number of the first cache entry.
    let cacheFolder    = null;  // Folder path of the cache.
    let cacheSortCol   = null;  // Cached sort column nr.
    let cacheSortOrder = null;  // Cached sort order.
    let i = 0;                  // Keep simultaneous requests from interfering.

    let get = async (args) => {
        // Check if we can use the cache.
        if (cache.length
         && currentFolder        === cacheFolder
         && args.order[0].dir    === cacheSortOrder
         && args.order[0].column === cacheSortCol
         && args.start               >= cacheStart
         && args.start + args.length <= cacheStart + batchSize) {

            return cache.slice(args.start - cacheStart, args.start - cacheStart + args.length);
        } else {
            // Nope, load new data via the API.
            let j = ++i;
            let result = await Yoda.call('browse_folder',
                                         {'coll':       Yoda.basePath + currentFolder,
                                          'offset':     args.start,
                                          'limit':      batchSize,
                                          'sort_order': args.order[0].dir,
                                          'sort_on':    ['name','size','modified'][args.order[0].column-1],
                                          'space':      'Space.RESEARCH'});

            // If another requests has come while we were waiting, simply drop this one.
            if (i !== j) return null;

            // Populate the 'size' of collections so datatables doesn't get confused.
            for (let x of result.items)
                if (x.type === 'coll')
                    x.size = 0;

            // Update cache info.
            total          = result.total;
            cacheStart     = args.start;
            cache          = result.items;
            cacheFolder    = currentFolder;
            cacheSortCol   = args.order[0].column;
            cacheSortOrder = args.order[0].dir;

            return cache.slice(args.start - cacheStart, args.length);
        }
    };

    // The actual function passed to datatables.
    // (needs a non-async wrapper cause datatables won't accept it otherwise)
    let fn = (args, cb, settings) => (async () => {

        let data = await get(args);
        if (data === null)
            return;

        cb({'data':            data,
            'recordsTotal':    total,
            'recordsFiltered': total });
    })();

    // Allow manually clearing results (needed during soft-reload after uploading a file).
    fn.dropCache = () => cache = [];
    return fn;
})();

// Functions for rendering table cells, per column.
const tableRenderer = {
    multiselect: (name, _, row) => {
        let tgt = `${currentFolder}/${name}`;
        let checkbox = '';
        if (currentFolder) {
            checkbox = `<input class="form-check-input ms-1" type="checkbox" name="multiSelect[]" value="${htmlEncode(tgt)}" data-name="${htmlEncode(name)}" data-type="${row.type}">`;
        }
        return checkbox;
    },
    name: (name, _, row) => {
        let tgt = `${currentFolder}/${name}`;
        if (row.type === 'coll')
            return `<a class="coll browse" href="?dir=${encodeURIComponent(tgt)}" data-path="${htmlEncode(tgt)}"><i class="fa-regular fa-folder"></i> ${htmlEncode(name)}</a>`;
        else return `<i class="fa-regular fa-file"></i> ${htmlEncode(name)}`;
    },
    size: (size, _, row) => {
        if (row.type === 'coll') {
            return '';
        } else {
            let szs = ['B', 'kiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'];
            let szi = 0;
            while (size >= 1024 && szi < szs.length-1) {
                size /= 1024;
                szi++;
            }
            return (Math.floor(size*10)/10+'') + '&nbsp;' + szs[szi];
        }
    },
    date: ts => {
        let date = new Date(ts*1000);
        let pad = n => n < 10 ? '0'+n : ''+n;
        let elem = $('<span>');
        elem.text(`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`
                 + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`);
        elem.attr('title', date.toString()); // (should include seconds and TZ info)
        return elem[0].outerHTML;
    },
    state: (_, __, row) => {
        let state = $('<span>');
        if (row.type === 'data' && row.state === 'OFL') {
            state = $('<span class="badge bg-secondary" title="Stored offline on tape archive">Offline</span>');
        } else if (row.type === 'data' && row.state === 'UNM') {
            state = $('<span class="badge bg-secondary" title="Migrating from tape archive to disk">Bringing online</span>');
        } else if (row.type === 'data' && row.state === 'MIG') {
            state = $('<span class="badge bg-secondary" title="Migrating from disk to tape archive">Storing offline</span>');
        }
        return state[0].outerHTML;
    },
    context: (_, __, row) => {
        let actions = $('<div class="dropdown-menu">');

        if (row.type === 'coll') {
            // no context menu for toplevel group-collections - these cannot be altered or deleted
            if (currentFolder.length==0) {
                return '';
            }
            actions.append(`<a href="#" class="dropdown-item folder-rename" data-collection="${htmlEncode(currentFolder)}" data-name="${htmlEncode(row.name)}" title="Rename this folder" >Rename</a>`);
            actions.append(`<a href="#" class="dropdown-item folder-copy" data-collection="${htmlEncode(currentFolder)}" data-name="${htmlEncode(row.name)}" title="Copy this folder">Copy</a>`);
            actions.append(`<a href="#" class="dropdown-item folder-move" data-collection="${htmlEncode(currentFolder)}" data-name="${htmlEncode(row.name)}" title="Move this folder">Move</a>`);
            actions.append(`<a href="#" class="dropdown-item folder-delete" data-collection="${htmlEncode(currentFolder)}" data-name="${htmlEncode(row.name)}" title="Delete this file">Delete</a>`);
        }
        else {
            if (row.state === 'OFL') {
                actions.append(`<a href="#" class="dropdown-item file-stage" data-collection="${htmlEncode(currentFolder)}" data-name="${htmlEncode(row.name)}" title="Bring this file online">Bring online</a>`);
            } else if (row.state === 'MIG' || row.state === 'UNM') {
                // no context menu for data objects migrating from or to tape archive
                return ''
            } else {
                // Render context menu for files.
                const viewExts = {
                    image: ['jpg', 'jpeg', 'gif', 'png', 'webp'],
                    audio: ['aac', 'flac', 'mp3', 'ogg', 'wav'],
                    video: ['mp4', 'ogg', 'webm']
                };
                let ext = row.name.replace(/.*\./, '').toLowerCase();

                actions.append(`<a class="dropdown-item" href="browse/download?filepath=${encodeURIComponent(currentFolder + '/' + row.name)}" title="Download this file">Download</a>`);

                // Generate dropdown "view" actions for different media types.
                for (let type of Object.keys(viewExts).filter(type => (viewExts[type].includes(ext)))) {
                    actions.append(`<a class="dropdown-item view-${type}" data-path="${htmlEncode(currentFolder + '/' + row.name)}" title="View this file">View</a>`);
                }

                actions.append(`<a href="#" class="dropdown-item file-rename" data-collection="${htmlEncode(currentFolder)}" data-name="${htmlEncode(row.name)}" title="Rename this file">Rename</a>`);
                actions.append(`<a href="#" class="dropdown-item file-copy" data-collection="${htmlEncode(currentFolder)}" data-name="${htmlEncode(row.name)}" title="Copy this file">Copy</a>`);
                actions.append(`<a href="#" class="dropdown-item file-move" data-collection="${htmlEncode(currentFolder)}" data-name="${htmlEncode(row.name)}" title="Move this file">Move</a>`);
                actions.append(`<a href="#" class="dropdown-item file-delete" data-collection="${htmlEncode(currentFolder)}" data-name="${htmlEncode(row.name)}" title="Delete this file">Delete</a>`);
            }
        }

        let dropdown = $(`<div class="dropdown">
                            <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-name="${htmlEncode(row.name)}" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                              <i class="fa-solid fa-ellipsis-h" aria-hidden="true"></i>
                            </button>`);
        dropdown.append(actions);

        return dropdown[0].outerHTML;
    }
};

function startBrowsing(items)
{
    $('#file-browser').DataTable({
        "bFilter": false,
        "bInfo": false,
        "bLengthChange": true,
        "language": {
            "emptyTable": "No accessible files/folders present",
            "lengthMenu": "_MENU_"
        },
        "dom": '<"top">frt<"bottom"lp><"clear">',
        'columns': [{render: tableRenderer.multiselect,    orderable: false, data: 'name'},
                    {render: tableRenderer.name,    data: 'name'},
                    // Size and date should be orderable, but limitations
                    // on how queries work prevent us from doing this
                    // correctly without significant overhead.
                    // (enabling this as is may result in duplicated results for data objects)
                    {render: tableRenderer.size,    data: 'size'},
                    {render: tableRenderer.date,    orderable: false, data: 'modify_time'},
                    {render: tableRenderer.state,   orderable: false},
                    {render: tableRenderer.context, orderable: false }],
        "ajax": getFolderContents,
        "processing": true,
        "serverSide": true,
        "iDeferLoading": 0,
        "order": [[ 1, "asc" ]],
        "pageLength": items
    });
    browse(currentFolder);
}

function toggleLocksList(folder)
{
    var isVisible = $('.lock').is(":visible");

    // toggle locks list
    if (isVisible) {
        $('.lock').hide();
    } else {
        // Get locks
        Yoda.call('folder_get_locks', {'coll':  Yoda.basePath + folder}).then((data) => {
            $('.lock').hide();

            var html = '';
            $.each(data, function (index, value) {
                html += '<a class="list-group-item list-group-item-action"><span class="browse" data-path="' + htmlEncode(value) + '">' + htmlEncode(value) + '</span></a>';
            });
            $('.lock-items').html(html);
            $('.lock').show();
        });
    }
}

function toggleActionLogList(folder)
{
    let actionList = $('.actionlog');
    let actionListItems = $('.actionlog-items');

    let isVisible = actionList.is(":visible");

    // toggle locks list
    if (isVisible) {
        actionList.hide();
    } else {
        // Get provenance information
        Yoda.call('provenance_log', {coll: Yoda.basePath + folder}).then((data) => {
            actionList.hide();
            var html = '';
            if (data.length) {
                $.each(data, function (index, value) {
                    html += '<a class="list-group-item list-group-item-action">'
                         + htmlEncode(value[2])
                         + ' - <strong>'
                         + htmlEncode(value[1])
                         + '</strong> - '
                         + htmlEncode(value[0])
                         + '</a>';
                });
            } else {
                html += '<a class="list-group-item list-group-item-action">No provenance information present</a>';
            }
            actionListItems.html(html)
            actionList.show();
        });
    }
}

function toggleSystemMetadata(folder)
{
    let systemMetadata = $('.system-metadata');
    let systemMetadataItems = $('.system-metadata-items');

    let isVisible = systemMetadata.is(":visible");

    // Toggle system metadata.
    if (isVisible) {
        systemMetadata.hide();
    } else {
        // Retrieve system metadata of folder.
        Yoda.call('research_system_metadata', {coll: Yoda.basePath + folder}).then((data) => {
            systemMetadata.hide();
            var html = '';
            if (data) {
                $.each(data, function(index, value) {
                    html += '<a class="list-group-item list-group-item-action"><strong>' +
                        htmlEncode(index) +
                        '</strong>: ' +
                        htmlEncode(value) +
                        '</a>';
                });
            } else {
                html += '<a class="list-group-item list-group-item-action">No system metadata present</a>';
            }
            systemMetadataItems.html(html);
            systemMetadata.show();
        });
    }
}

window.addEventListener('popstate', function(e) {
    // Catch forward/backward navigation and reload the view.
    let query = window.location.search.substr(1).split('&').reduce(
        function(acc, kv) {
            let xy = kv.split('=', 2);
            acc[xy[0]] = xy.length == 1 || decodeURIComponent(xy[1]);
            return acc;
        }, {});

    browse('dir' in query ? query.dir : '');
});

function topInformation(dir, showAlert)
{
    if (typeof dir != 'undefined') {
        Yoda.call('research_collection_details',
                  {path: Yoda.basePath + dir}).then((data) => {
            let statusText = "";
            var basename = data.basename;
            var status = data.status;
            var userType = data.member_type;
            var hasWriteRights = true;
            var isDatamanager = data.is_datamanager;
            var lockCount = data.lock_count;
            var vaultPath = data.vault_path;
            var actions = [];

            $('.btn-group button.metadata-form').hide();

            $('.btn-group button.upload').attr('data-path', "");
            $('.btn-group button.upload').prop("disabled", true);
            $('.btn-group button.folder-create').attr('data-path', "");
            $('.btn-group button.folder-create').prop("disabled", true);

            $('a.folder-delete').addClass("disabled");
            $('a.folder-rename').addClass("disabled");
            $('a.folder-copy').addClass("disabled");
            $('a.folder-move').addClass("disabled");

            $('a.file-delete').addClass("disabled");
            $('a.file-rename').addClass("disabled");
            $('a.file-copy').addClass("disabled");
            $('a.file-move').addClass("disabled");

            $('.top-information').hide();
            $('.top-info-buttons').hide();

            // Set folder status badge and actions.
            if (typeof status != 'undefined') {
                if (status == '') {
                    statusText = "";
                    actions['lock'] = 'Lock';
                    actions['submit'] = 'Submit';
                    actions['cleanup'] = 'Clean up temporary files';
                } else if (status == 'LOCKED') {
                    statusText = "Locked";
                    actions['unlock'] = 'Unlock';
                    actions['submit'] = 'Submit';
                } else if (status == 'SUBMITTED') {
                    statusText = "Submitted";
                    actions['unsubmit'] = 'Unsubmit';
                } else if (status == 'ACCEPTED') {
                    statusText = "Accepted";
                } else if (status == 'SECURED') {
                    statusText = "Secured";
                    actions['lock'] = 'Lock';
                    actions['submit'] = 'Submit';
                    actions['cleanup'] = 'Clean up temporary files';
                } else if (status == 'REJECTED') {
                    statusText = "Rejected";
                    actions['lock'] = 'Lock';
                    actions['submit'] = 'Submit';
                    actions['cleanup'] = 'Clean up temporary files';
                }

                // Show metadata button.
                $('.btn-group button.metadata-form').attr('data-path', dir);
                $('.btn-group button.metadata-form').show();

                $('.btn-group button.folder-status').attr('data-datamanager', isDatamanager);
            }

            if (userType == 'reader' || userType == 'none') {
                var actions = [];
                hasWriteRights = false;
            }

            if (isDatamanager) {
                // Check rights as datamanager.
                if (userType != 'manager' && userType != 'normal') {
                    var actions = [];
                    hasWriteRights = false;
                }

                if (typeof status != 'undefined') {
                    if (status == 'SUBMITTED') {
                        actions['accept'] = 'Accept';
                        actions['reject'] = 'Reject';
                    }
                }
            }

            // Check if folder is writable.
            if (hasWriteRights && (status == '' || status == 'REJECTED' || status == 'SECURED')) {
                // Enable uploads.
                $('.btn-group button.upload').attr('data-path', dir);
                $('.btn-group button.upload').prop("disabled", false);

                // Enable folder / file manipulations.
                $('.btn-group button.folder-create').attr('data-path', dir);
                $('.btn-group button.folder-create').prop("disabled", false);

                $('a.folder-delete').removeClass("disabled");
                $('a.folder-rename').removeClass("disabled");
                $('a.file-rename').removeClass("disabled");
                $('a.file-copy').removeClass("disabled");
                $('a.file-move').removeClass("disabled");
                $('a.file-delete').removeClass("disabled");
            }

            // Lock icon
            $('.lock').hide();
            var lockIcon = '';
            if (lockCount != '0' && typeof lockCount != 'undefined') {
                lockIcon = `<i class="fa-solid fa-lock lock-icon" data-folder="${htmlEncode(dir)}" data-locks="${lockCount}" title="${lockCount} lock(s) found" aria-hidden="true"></i>`;
            }

            // Provenance action log
            $('.actionlog').hide();
            let actionLogIcon = ` <i class="fa-solid fa-book actionlog-icon" data-folder="${htmlEncode(dir)}" aria-hidden="true" title="Show provenance information"></i>`;

            // System metadata.
            $('.system-metadata').hide();
            let systemMetadataIcon = ` <i class="fa-solid fa-info-circle system-metadata-icon" data-folder="${htmlEncode(dir)}" aria-hidden="true" title="Show system metadata"></i>`;

            $('.btn-group button.folder-status').attr('data-write', hasWriteRights);

            // Add unpreservable files check to actions.
            actions['check-for-unpreservable-files'] = 'Check for compliance with policy';

            // Add checksum report
            actions['show-checksum-report'] = 'Show checksum report';

            // Add go to vault to actions.
            if (typeof vaultPath != 'undefined' ) {
                actions['go-to-vault'] = 'Go to vault';
            }

            // Handle actions
            handleActionsList(actions, dir);

            // Set vault paths.
            if (typeof vaultPath != 'undefined' ) {
                $('a.action-go-to-vault').attr('vault-path', vaultPath);
            }

            let folderName = htmlEncode(basename).replace(/ /g, "&nbsp;");
            let statusBadge = '<span id="statusBadge" class="ms-2 badge rounded-pill bg-primary">' + statusText + '</span>';

            // Reset action dropdown.
            $('.btn-group button.folder-status').prop("disabled", false).next().prop("disabled", false);

            var icon = '<i class="fa-regular fa-folder-open" aria-hidden="true"></i>';
            $('.top-information h2').html(`<span class="icon">${icon}</span> ${folderName}${lockIcon}${systemMetadataIcon}${actionLogIcon}${statusBadge}`);

            // Show top information and buttons.
            if (typeof status != 'undefined') {
                $('.top-information').show();
                $('.top-info-buttons').show();
            }
        });
    } else {
        $('.btn-group button.upload').attr('data-path', "");

        // Folder/ file manipulation data
        $('.btn-group button.folder-create').attr('data-path', "");

        $('.top-information').hide();
    }
}

function handleActionsList(actions, folder)
{
    var html = '';
    var vaultHtml = '';
    var possibleActions = ['lock', 'unlock',
                           'submit', 'unsubmit',
                           'accept', 'reject'];

    var possibleVaultActions = ['cleanup',
                                'check-for-unpreservable-files',
                                'show-checksum-report',
                                'go-to-vault'];

    $.each(possibleActions, function( index, value ) {
        if (actions.hasOwnProperty(value)) {
            html += '<a class="dropdown-item action-' + value + '" data-folder="' + htmlEncode(folder) + '">' + actions[value] + '</a>';
        }
    });

    $.each(possibleVaultActions, function( index, value ) {
        if (actions.hasOwnProperty(value)) {
            vaultHtml += '<a class="dropdown-item action-' + value + '" data-folder="' + htmlEncode(folder) + '">' + actions[value] + '</a>';
        }
    });

    if (html != '' && vaultHtml != '') {
        html += '<div class="dropdown-divider"></div>' + vaultHtml;
    } else if (vaultHtml != '') {
        html += vaultHtml;
    }

    $('.action-list').html(html);
}

async function lockFolder(folder)
{
    // Get current button text
    var btnText = $('#statusBadge').html();
    $('#statusBadge').html('Lock <i class="fa-solid fa-spinner fa-spin fa-fw"></i>');
    $('.btn-group button.folder-status').prop("disabled", true).next().prop("disabled", true);

    // Change folder status call
    try {
        await Yoda.call('folder_lock', {'coll': Yoda.basePath + folder})
        $('#statusBadge').text('Locked');
    } catch (e) {
        $('#statusBadge').html(btnText);
    }
    topInformation(folder, false);
}

async function unlockFolder(folder)
{
    // Get current button text
    let btnText = $('#statusBadge').html();
    $('#statusBadge').html('Unlock <i class="fa-solid fa-spinner fa-spin fa-fw"></i>');
    $('.btn-group button.folder-status').prop("disabled", true).next().prop("disabled", true);

    try {
        await Yoda.call('folder_unlock', {'coll': Yoda.basePath + folder});
        $('#statusBadge').text('');
    } catch (e) {
        $('#statusBadge').html(btnText);
    }
    topInformation(folder, false);
}

function showMetadataForm(path)
{
    window.location.href = 'metadata/form?path=' + encodeURIComponent(path);
}

async function submitToVault(folder)
{
    if (typeof folder != 'undefined') {
        // Set spinner & disable button
        let btnText = $('#statusBadge').html();
        $('#statusBadge').html('Submit <i class="fa-solid fa-spinner fa-spin fa-fw"></i>');
        $('.btn-group button.folder-status').prop("disabled", true).next().prop("disabled", true);

        try {
            let status = await Yoda.call('folder_submit', {'coll': Yoda.basePath + folder})
            if (status === 'SUBMITTED') {
                $('#statusBadge').html('Submitted');
            } else if (status === 'ACCEPTED') {
                $('#statusBadge').html('Accepted');
            } else {
                $('#statusBadge').html(btnText);
            }
        } catch (e) {
            $('#statusBadge').html(btnText);
        }
        topInformation(folder, false);
    }
}

async function unsubmitToVault(folder) {
    if (typeof folder != 'undefined') {
        var btnText = $('#statusBadge').html();
        $('#statusBadge').html('Unsubmit <i class="fa-solid fa-spinner fa-spin fa-fw"></i>');
        $('.btn-group button.folder-status').prop("disabled", true).next().prop("disabled", true);

        try {
            let status = await Yoda.call('folder_unsubmit', {'coll': Yoda.basePath + folder})
            $('#statusBadge').html('');
        } catch(e) {
            $('#statusBadge').html(btnText);
        }
        topInformation(folder, false);
    }
}

async function acceptFolder(folder)
{
    var btnText = $('#statusBadge').html();
    $('#statusBadge').html('Accept <i class="fa-solid fa-spinner fa-spin fa-fw"></i>');
    $('.btn-group button.folder-status').prop("disabled", true).next().prop("disabled", true);

    try {
        await Yoda.call('folder_accept', {'coll': Yoda.basePath + folder})
        $('#statusBadge').html('Accepted');
    } catch (e) {
        $('#statusBadge').html(btnText);
    }
    topInformation(folder, false);
}

async function rejectFolder(folder)
{
    var btnText = $('#statusBadge').html();
    $('#statusBadge').html('Reject <i class="fa-solid fa-spinner fa-spin fa-fw"></i>');
    $('.btn-group button.folder-status').prop("disabled", true).next().prop("disabled", true);

    try {
        await Yoda.call('folder_reject', {'coll': Yoda.basePath + folder})
        $('#statusBadge').html('Rejected');
    } catch (e) {
        $('#statusBadge').html(btnText);
        Yoda.set_message('error', data.statusInfo);
    }
    topInformation(folder, false);
}

function logUpload(id, file) {
    let log = `<div class="row upload-row" id="${id}">
                  <div class="col-md-6">
                    <div class="upload-filename">${htmlEncode(file.relativePath)}</div>
                    <div class="upload-btns btn-group btn-group-sm" role="group" aria-label="Basic example">
                      <button type="button" class="btn btn-secondary upload-cancel me-1">
                        Cancel
                      </button>
                      <button type="button" class="btn btn-secondary upload-resume hide me-1">
                        Resume
                      </button>
                      <button type="button" class="btn btn-secondary upload-pause">
                        Pause
                      </button>
                      <button type="button" class="btn btn-secondary upload-retry hide">
                        Retry
                      </button>
                    </div>
                  </div>
                  <div class="col-md-3"><div class="progress mt-1"><div class="progress-bar progress-bar-striped bg-info"></div></div></div>
                  <div class="col-md-3 msg"><i class="fa-solid fa-spinner fa-spin fa-fw"></i></div>
               </div>`;
    $('#files').append(log);
}

function dragEnterHandler(ev)
{
    $(this).addClass('flow-dragover');
}

function dragEndHandler(ev)
{
    $(this).removeClass('flow-dragover');
}

function dropHandler(ev) {
    $(this).removeClass('flow-dragover');
}
