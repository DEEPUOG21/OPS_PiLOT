"""A measured LangGraph workflow. Instrumentation is injected, never a gateway."""
import json
import re
import time
from typing import TypedDict
import httpx
from langgraph.graph import StateGraph, START, END
from opentelemetry.trace import format_trace_id
from backend.app.core.config import settings
from sample_ai_app.rag.knowledge import retrieve

SCENARIOS = ['successful', 'slow_retrieval', 'failed_tool', 'high_tokens', 'repeated_tool', 'low_quality', 'rag_success']


class State(TypedDict, total=False):
    question: str
    scenario: str
    intent: str
    documents: list[dict]
    context: str
    answer: str
    reference: str
    validation: str


def run_support(sdk, question, scenario='successful', prompt='Answer using only the provided context. If unsupported, say you do not know.', retrieval_k=2, reference='', use_provider=False):
    cfg = settings()

    def classify(state):
        with sdk.span('Intent Classification Agent') as span:
            intent = 'billing' if any(w in state['question'].lower() for w in ('refund', 'plan', 'payment')) else 'technical support'
            span.set_attribute('opspilot.output', intent)
            return {'intent': intent}

    def search(state):
        with sdk.span('Knowledge Retrieval Agent'):
            if scenario == 'slow_retrieval':
                # Actual injected delay, visible as scenario telemetry, never a fabricated duration.
                with sdk.span('Knowledge base search', 'retrieval', **{'opspilot.scenario_delay': True}):
                    time.sleep(.3)
            docs = []
            for _ in range(3 if scenario == 'repeated_tool' else 1):
                with sdk.span('knowledge_base.search', 'tool', **{'opspilot.input': json.dumps({'question': question, 'k': retrieval_k}, sort_keys=True)}) as tool:
                    if scenario == 'failed_tool':
                        raise RuntimeError('Demo fault injection: knowledge base unavailable')
                    with sdk.span('Vector-free lexical search', 'retrieval') as span:
                        docs = retrieve(question, retrieval_k)
                        span.set_attribute('retrieval.document_ids', [d['id'] for d in docs])
                        span.set_attribute('opspilot.output', json.dumps(docs))
                    tool.set_attribute('opspilot.output', json.dumps([d['id'] for d in docs]))
            context = '\n\n'.join(d['text'] for d in docs)
            if scenario == 'high_tokens':
                context = '\n\n'.join([context] * 24)
            return {'documents': docs, 'context': context}

    def generate(state):
        with sdk.span('Response Generation Agent'):
            model = cfg.openai_model if use_provider else 'mock-support-v1'
            messages = [{'role': 'system', 'content': prompt}, {'role': 'user', 'content': f"Context:\n{state['context']}\n\nQuestion: {question}"}]
            with sdk.span('Generate grounded response', 'llm', **{'gen_ai.request.model': model, 'gen_ai.provider.name': 'openai' if use_provider else 'deterministic-mock',
                          'gen_ai.input.messages': json.dumps(messages), 'opspilot.question': question,
                          'opspilot.context': state['context'], 'opspilot.reference': reference}) as span:
                if use_provider:
                    response = httpx.post(cfg.openai_base_url.rstrip('/') + '/chat/completions',
                                          headers={'Authorization': f'Bearer {cfg.openai_api_key}'},
                                          json={'model': model, 'messages': messages}, timeout=60)
                    response.raise_for_status()
                    data = response.json()
                    answer = data['choices'][0]['message']['content']
                    usage = data.get('usage', {})
                    for provider_key, attr in [('prompt_tokens', 'input'), ('completion_tokens', 'output')]:
                        if usage.get(provider_key) is not None:
                            span.set_attribute(f'gen_ai.usage.{attr}_tokens', usage[provider_key])
                    span.set_attribute('gen_ai.response.model', data.get('model', model))
                else:
                    answer = state['documents'][0]['text'] if state['documents'] else 'I do not know based on the available knowledge base.'
                    if scenario == 'low_quality':
                        answer = 'Our lunar office offers unlimited cryptocurrency rewards and perpetual free flights.'
                    # Simulated usage is explicitly labeled; these are regex units, not provider tokens.
                    span.set_attribute('gen_ai.usage.input_tokens', len(re.findall(r'\w+|[^\w\s]', json.dumps(messages))))
                    span.set_attribute('gen_ai.usage.output_tokens', len(re.findall(r'\w+|[^\w\s]', answer)))
                    span.set_attribute('opspilot.token_source', 'mock-regex-tokenizer')
                span.set_attribute('gen_ai.output.messages', answer)
                return {'answer': answer}

    def validate(state):
        with sdk.span('Response Validation Agent') as span:
            from backend.app.evaluations.engine import heuristic
            scores, _ = heuristic(question, state['answer'], state['context'], reference)
            status = 'review' if (scores.get('faithfulness') or 0) < .5 else 'grounded lexical overlap'
            span.set_attribute('opspilot.validation', status)
            span.set_attribute('opspilot.output', json.dumps(scores))
            return {'validation': status}

    graph = StateGraph(State)
    for name, fn in [('classify', classify), ('retrieve', search), ('generate', generate), ('validate', validate)]:
        graph.add_node(name, fn)
    graph.add_edge(START, 'classify')
    graph.add_edge('classify', 'retrieve')
    graph.add_edge('retrieve', 'generate')
    graph.add_edge('generate', 'validate')
    graph.add_edge('validate', END)
    error, result = None, {}
    trace_id = ''
    try:
        with sdk.span('Customer Support · Supervisor Agent', 'agent', **{'opspilot.question': question, 'opspilot.scenario': scenario}) as span:
            trace_id = format_trace_id(span.get_span_context().trace_id)
            result = graph.compile().invoke({'question': question, 'scenario': scenario, 'reference': reference})
            span.set_attribute('opspilot.output', result.get('answer', ''))
    except Exception as exc:
        error = str(exc)
    sdk.flush()
    return {'trace_id': trace_id, 'answer': result.get('answer'), 'error': error, 'mode': 'provider' if use_provider else 'mock'}
