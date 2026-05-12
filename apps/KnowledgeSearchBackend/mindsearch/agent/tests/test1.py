import json
from lagent.schema import AgentStatusCode
import asyncio
from app import app  # Replace 'app' with your module name
from app import run, GenerationParams


def streaming(raw_response):
    for chunk in raw_response.iter_lines(chunk_size=8192,
                                         decode_unicode=False,
                                         delimiter=b'\n'):
        if chunk:
            decoded = chunk.decode('utf-8')
            if decoded == '\r':
                continue
            if decoded[:6] == 'data: ':
                decoded = decoded[6:]
            elif decoded.startswith(': ping - '):
                continue
            response = json.loads(decoded)
            print(response)
            yield (response['response'], response['current_node'])
async def test_solve_success():
    input = {
                    "inputs": [{
                        "role": "user",
                        "content": "Project stock NIO outlooks in 2025"
                    }],
                    "agent_cfg": {}
                }
    test = GenerationParams(**input)
    result = await run(test)
    output = streaming(result)
    print(output)
        # Send POST request

if __name__ == '__main__':
    asyncio.run(test_solve_success())