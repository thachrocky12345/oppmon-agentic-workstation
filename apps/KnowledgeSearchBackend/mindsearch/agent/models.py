import os

from .lagent.llms import GPTAPI

# Only GPT-4 configuration for ChatGPT usage
gpt4 = dict(type=GPTAPI,
            model_type='gpt-4o-mini',
            # model_type='gpt-4o-2024-08-06',
            key=os.environ.get('OPENAI_API_KEY', ""),
            openai_api_base=os.environ.get('OPENAI_API_BASE', 'https://api.openai.com/v1/chat/completions'),
            max_new_tokens=4096,  # Set reasonable token limit
            temperature=0.1,      # Lower temperature for more focused responses
            top_p=0.9,           # Add top_p for OpenAI (no top_k for GPT models)
            )
