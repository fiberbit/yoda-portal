#!/usr/bin/env python3

__copyright__ = 'Copyright (c) 2021-2022, Utrecht University'
__license__   = 'GPLv3, see LICENSE'

from flask import Blueprint, render_template, request, Response

search_bp = Blueprint('search_bp', __name__,
                      template_folder='templates',
                      static_folder='static/search',
                      static_url_path='/assets')


@search_bp.route('/')
def index() -> Response:
    searchTerm = request.args.get('q', None)

    if searchTerm is None:
        searchTerm = ''

    return render_template('search/search.html',
                           searchTerm=searchTerm)
