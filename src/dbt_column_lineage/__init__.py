import warnings
from importlib.metadata import version, PackageNotFoundError

try:
    __version__ = version('dbt_column_lineage')
except PackageNotFoundError:
    warnings.warn('Failed to read version. Make sure `setuptools_scm` is installed and its setup is called.')
