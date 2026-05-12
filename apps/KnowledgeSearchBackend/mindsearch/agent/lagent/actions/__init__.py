from typing import Type

from ..actions.action_executor import ActionExecutor
from ..actions.arxiv_search import ArxivSearch
from ..actions.base_action import TOOL_REGISTRY, BaseAction, tool_api
from ..actions.bing_browser import BingBrowser
from ..actions.bing_map import BINGMap
from ..actions.google_scholar_search import GoogleScholar
from ..actions.google_search import GoogleSearch
from ..actions.ipython_interactive import IPythonInteractive
from ..actions.ipython_interpreter import IPythonInterpreter
from ..actions.ipython_manager import IPythonInteractiveManager
from ..actions.parser import BaseParser, JsonParser, TupleParser
from ..actions.ppt import PPT
from ..actions.python_interpreter import PythonInterpreter

__all__ = [
    'BaseAction', 'ActionExecutor', 'InvalidAction', 'FinishAction',
    'NoAction', 'BINGMap', 'ArxivSearch', 'FinishAction', 'GoogleSearch',
    'GoogleScholar', 'IPythonInterpreter', 'IPythonInteractive',
    'IPythonInteractiveManager', 'PythonInterpreter', 'PPT', 'BaseParser',
    'JsonParser', 'TupleParser', 'tool_api', 'list_tools', 'get_tool_cls',
    'get_tool', 'BingBrowser'
]


def list_tools(with_class: bool = False):
    """List available tools.

    Args:
        with_class (bool): whether to return the action class along
            with its name. Defaults to ``False``.

    Returns:
        list: all action names
    """
    return list(TOOL_REGISTRY.items()) if with_class else list(
        TOOL_REGISTRY.keys())


def get_tool_cls(specifier: str) -> Type[BaseAction]:
    """Get the action class.

    Args:
        specifier (:class:`str`): tool name

    Returns:
        Type[BaseAction]: action class
    """
    return TOOL_REGISTRY.get_class(specifier)


def get_tool(specifier: str, *args, **kwargs) -> BaseAction:
    """Instantiate an action.

    Args:
        specifier (str): tool name
        args: positional arguments passed to the action's ``__init__`` method
        kwargs: keyword arguments passed to the action's ``__init__`` method

    Returns:
        :class:`BaseAction`: action object
    """
    return TOOL_REGISTRY.get(specifier, *args, **kwargs)
