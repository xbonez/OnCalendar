import logging
from oc_config import config

logger = logging.getLogger('oncalendar')
default_log_handler = logging.FileHandler(config.logging['APP_LOG_FILE'])
default_log_formatter = logging.Formatter(config.logging['LOG_FORMAT'])
default_log_handler.setFormatter(default_log_formatter)
logger.setLevel(getattr(logging, config.logging['LOG_LEVEL']))
logger.addHandler(default_log_handler)
