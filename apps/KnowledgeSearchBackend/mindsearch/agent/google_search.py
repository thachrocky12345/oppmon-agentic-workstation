from .lagent.actions import (
    ActionExecutor,  BaseParser, JsonParser, tool_api)
from .lagent.actions.bing_browser import BingSearch, ContentFetcher, BingBrowser, DuckDuckGoSearch
from typing import List, Optional, Tuple, Type, Union
import random
import requests
import json
import logging
import warnings
import time
from cachetools import TTLCache, cached
from concurrent.futures import ThreadPoolExecutor, as_completed


class GoogleSearch:
    """
    A class to interact with the Google Custom Search JSON API.
    Integrates with MindSearch's search interface.
    """

    def __init__(self,
                 api_key: str = "",
                 search_engine_id: str = "",
                 region: str = 'en-US',
                 topk: int = 3,
                 black_list: Optional[List[str]] = None,
                 **kwargs):
        """
        Initialize GoogleSearch with necessary credentials.
        
        Args:
            api_key: Your Google Cloud API key
            search_engine_id: Your Programmable Search Engine ID
            region: Region setting (kept for compatibility)
            topk: Number of top results to return
            black_list: List of domains to filter out from results
        """
        self.api_key = api_key
        self.search_engine_id = search_engine_id
        self.base_url = "https://www.googleapis.com/customsearch/v1"
        self.topk = topk
        self.black_list = black_list or [
            'youtube.com',
            'bilibili.com',
            'researchgate.net'
        ]
        self.timeout = kwargs.get('timeout', 5)

    def _filter_results(self, results: List[tuple]) -> dict:
        """Filter search results based on black list."""
        filtered_results = {}
        count = 0
        for url, snippet, title in results:
            if all(domain not in url for domain in self.black_list) and not url.endswith('.pdf'):
                filtered_results[count] = {
                    'url': url,
                    'summ': json.dumps(snippet, ensure_ascii=False)[1:-1] if snippet else "",
                    'title': title
                }
                count += 1
                if count >= self.topk:
                    break
        return filtered_results

    @cached(cache=TTLCache(maxsize=100, ttl=600))
    def search(self, query: str, max_retry: int = 3) -> dict:
        """
        Perform a search query and return results in MindSearch format.
        
        Args:
            query: The search term
            max_retry: Maximum number of retries on failure
            
        Returns:
            Dictionary of search results in MindSearch format
        """
        for attempt in range(max_retry):
            try:
                # Construct the request parameters
                params = {
                    'key': self.api_key,
                    'cx': self.search_engine_id,
                    'q': query.strip("'"),
                    'num': min(6, self.topk * 2)  # Get more results to filter
                }

                # Make the GET request to the API
                response = requests.get(self.base_url, params=params, timeout=self.timeout)
                response.raise_for_status()

                # Parse the JSON response
                search_results = response.json()
                
                # Extract and format results
                raw_results = []
                for item in search_results.get('items', []):
                    url = item.get('link', '')
                    title = item.get('title', '')
                    snippet = item.get('snippet', '')
                    raw_results.append((url, snippet, title))
                
                return self._filter_results(raw_results)

            except requests.exceptions.RequestException as e:
                logging.error(f'Google Search API error (attempt {attempt + 1}/{max_retry}): {e}')
                time.sleep(random.randint(2, 5))
        
        raise Exception('Failed to get search results from Google after retries.')

class CustomGoogleBrowser(BingBrowser):
    """Wrapper around the Web Browser Tool - now only uses GoogleSearch."""

    def __init__(self,
                 searcher_type: str = 'GoogleSearch',
                 api_key: str = "",
                 region: str = 'en-US',
                 timeout: int = 5,
                 black_list: Optional[List[str]] = [
                     'youtube.com',
                     'bilibili.com',
                     'researchgate.net',
                 ],
                 topk: int = 3,
                 description: Optional[dict] = None,
                 parser: Type[BaseParser] = JsonParser,
                 enable: bool = True,
                 search_engine_id: str = "",
                 **kwargs):
        """Initialize BingBrowser with GoogleSearch only."""
        
        # Always use GoogleSearch regardless of searcher_type parameter
        self.searcher = GoogleSearch(
            api_key=api_key,
            search_engine_id=search_engine_id,
            region=region,
            black_list=black_list,
            topk=topk,
            **kwargs
        )
        
        self.fetcher = ContentFetcher(timeout=timeout)
        self.search_results = None
        
        # Initialize base action directly to avoid eval() issue with GoogleSearch
        from .lagent.actions import BaseAction
        BaseAction.__init__(self, description, parser, enable)
    
    def run(self, query: str) -> dict:
        """Alias for search method to fix API error."""
        return self.search(query)
    
    @tool_api
    def search(self, query: Union[str, List[str]]) -> dict:
        """Google search API using GoogleSearch class."""
        queries = query if isinstance(query, list) else [query]
        search_results = {}

        with ThreadPoolExecutor() as executor:
            future_to_query = {
                executor.submit(self.searcher.search, q): q
                for q in queries
            }

            for future in as_completed(future_to_query):
                query = future_to_query[future]
                try:
                    results = future.result()
                except Exception as exc:
                    warnings.warn(f'{query} generated an exception: {exc}')
                else:
                    for result in results.values():
                        if result['url'] not in search_results:
                            search_results[result['url']] = result
                        else:
                            search_results[result['url']]['summ'] += f"\n{result['summ']}"

        self.search_results = search_results
        return search_results



class CustomGoogleSearch(BingSearch):
    """Wrapper around the Web Browser Tool - now only uses GoogleSearch."""

    def __init__(self,
                 searcher_type: str = 'GoogleSearch',
                 api_key: str = "",
                 region: str = 'en-US',
                 timeout: int = 5,
                 black_list: Optional[List[str]] = [
                     'youtube.com',
                     'bilibili.com',
                     'researchgate.net',
                 ],
                 topk: int = 3,
                 description: Optional[dict] = None,
                 parser: Type[BaseParser] = JsonParser,
                 enable: bool = True,
                 search_engine_id: str = "",
                 **kwargs):
        """Initialize with GoogleSearch only."""
        # Always use GoogleSearch regardless of searcher_type parameter
        self.searcher = GoogleSearch(
            api_key=api_key,
            search_engine_id=search_engine_id,
            region=region,
            black_list=black_list,
            topk=topk,
            **kwargs
        )
        self.fetcher = ContentFetcher(timeout=timeout)
        self.search_results = None
        
        # Initialize base action directly to avoid eval() issue with GoogleSearch
        from .lagent.actions import BaseAction
        BaseAction.__init__(self, description, parser, enable)
    
    def run(self, query: str) -> dict:
        """Alias for search method to fix API error."""
        return self.search(query)
    
    @tool_api
    def search(self, query: Union[str, List[str]]) -> dict:
        """Google search API using GoogleSearch class."""
        queries = query if isinstance(query, list) else [query]
        search_results = {}

        with ThreadPoolExecutor() as executor:
            future_to_query = {
                executor.submit(self.searcher.search, q): q
                for q in queries
            }

            for future in as_completed(future_to_query):
                query = future_to_query[future]
                try:
                    results = future.result()
                except Exception as exc:
                    warnings.warn(f'{query} generated an exception: {exc}')
                else:
                    for result in results.values():
                        if result['url'] not in search_results:
                            search_results[result['url']] = result
                        else:
                            search_results[result['url']]['summ'] += f"\n{result['summ']}"

        self.search_results = search_results
        return search_results