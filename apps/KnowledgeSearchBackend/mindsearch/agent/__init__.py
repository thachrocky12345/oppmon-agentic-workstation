import os
from datetime import datetime

from .google_search import CustomGoogleBrowser, ActionExecutor, CustomGoogleSearch

from . import models as llm_factory
from .mindsearch_agent import (MindSearchAgent,
                                               MindSearchProtocol)
from .mindsearch_prompt import (
    FINAL_RESPONSE_CN, FINAL_RESPONSE_EN, GRAPH_PROMPT_CN, GRAPH_PROMPT_EN,
    fewshot_example_cn, fewshot_example_en, graph_fewshot_example_cn,
    graph_fewshot_example_en, searcher_context_template_cn,
    searcher_context_template_en, searcher_input_template_cn,
    searcher_input_template_en, searcher_system_prompt_cn,
    searcher_system_prompt_en)

LLM = {}


def init_agent(lang='cn', model_format='internlm_server',search_engine='DuckDuckGoSearch'):
    llm = LLM.get(model_format, None)
    if llm is None:
        llm_cfg = getattr(llm_factory, model_format)
        if llm_cfg is None:
            raise NotImplementedError
        llm_cfg = llm_cfg.copy()
        llm = llm_cfg.pop('type')(**llm_cfg)
        LLM[model_format] = llm

    interpreter_prompt = GRAPH_PROMPT_CN if lang == 'cn' else GRAPH_PROMPT_EN
    plugin_prompt = searcher_system_prompt_cn if lang == 'cn' else searcher_system_prompt_en
    if not model_format.lower().startswith('internlm'):
        interpreter_prompt += graph_fewshot_example_cn if lang == 'cn' else graph_fewshot_example_en
        plugin_prompt += fewshot_example_cn if lang == 'cn' else fewshot_example_en

    # Always use GoogleSearch regardless of search_engine parameter.
    # Credentials must come from env (GOOGLE_SEARCH_API_KEY,
    # GOOGLE_SEARCH_ENGINE_ID) — never hardcoded.
    plugin_executor = ActionExecutor(
        CustomGoogleBrowser(
            api_key=os.environ.get('GOOGLE_SEARCH_API_KEY', ''),
            search_engine_id=os.environ.get('GOOGLE_SEARCH_ENGINE_ID', ''),
            searcher_type='GoogleSearch',
            topk=3
        )
    )

    agent = MindSearchAgent(
        llm=llm,
        protocol=MindSearchProtocol(meta_prompt=datetime.now().strftime(
            'The current date is %Y-%m-%d.'),
                                    interpreter_prompt=interpreter_prompt,
                                    response_prompt=FINAL_RESPONSE_EN),
        searcher_cfg=dict(
            llm=llm,
            plugin_executor=plugin_executor,
            protocol=MindSearchProtocol(
                meta_prompt=datetime.now().strftime(
                    'The current date is %Y-%m-%d.'),
                plugin_prompt=plugin_prompt,
            ),
            template=dict(input=searcher_input_template_en,
                          context=searcher_context_template_en)),
        max_turn=15)
    return agent
