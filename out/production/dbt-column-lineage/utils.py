import logging
import sys
from datetime import datetime
from pytz import timezone

from flask import request

from constants import DEBUG_MODE


def get_redirect_url():
    host_url = request.host_url
    if request.scheme == 'http' and 'localhost' not in host_url:
        host_url = host_url.replace('http://', 'https://')
    return host_url + 'callback'


def get_logger(app, logger_name):
    logger = logging.getLogger(logger_name)
    handler = logging.StreamHandler(sys.stdout)

    if app.debug or DEBUG_MODE:
        logger.setLevel(logging.DEBUG)
        handler.setLevel(logging.DEBUG)
    else:
        logger.setLevel(logging.INFO)
        handler.setLevel(logging.INFO)

    # apprunner では不要説
    formatter = logging.Formatter('%(name)s [%(asctime)s] [%(levelname)s] %(pathname)s:%(lineno)d %(message)s')
    formatter.converter = custom_timezone_jst
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    return logger


def custom_timezone_jst(*args):
    return datetime.now(timezone('Asia/Tokyo')).timetuple()
