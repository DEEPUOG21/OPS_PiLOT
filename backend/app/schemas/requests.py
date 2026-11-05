from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, model_validator

Source = Literal['demo', 'collected']


class DemoRequest(BaseModel):
    question: str = Field(default='How do I request a refund?', min_length=3, max_length=4000)
    scenario: Literal['successful', 'slow_retrieval', 'failed_tool', 'high_tokens', 'repeated_tool', 'low_quality', 'rag_success'] = 'successful'
    provider: bool = False


class EvaluationRequest(BaseModel):
    trace_id: str = Field(pattern=r'^[a-fA-F0-9]{32}$')
    method: Literal['heuristic', 'llm_judge'] = 'heuristic'
    criteria: str = Field(default='', max_length=2000)
    reference: str | None = Field(default=None, max_length=10000)


class PromptRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default='', max_length=1000)


class VersionRequest(BaseModel):
    content: str = Field(min_length=5, max_length=20000)
    retrieval_k: int = Field(default=2, ge=1, le=5)


class ExperimentRequest(BaseModel):
    name: str = Field(default='Support workflow comparison', min_length=1, max_length=120)
    dataset_id: int
    version_ids: list[int] = Field(min_length=2, max_length=4)
    provider: bool = False


class DatasetRecordRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    question: str = Field(min_length=3, max_length=4000)
    reference: str = Field(default='', max_length=10000)


class DatasetRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    name: str = Field(min_length=1, max_length=120)
    records: list[DatasetRecordRequest] = Field(min_length=1, max_length=25)

    @model_validator(mode='after')
    def distinct_questions(self):
        questions = [' '.join(record.question.casefold().split()) for record in self.records]
        if len(set(questions)) != len(questions):
            raise ValueError('Each dataset question must be distinct')
        return self


class PricingRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    model_id: str = Field(min_length=1, max_length=120)
    provider: str = Field(default='openai', min_length=1, max_length=80)
    input_per_million: float = Field(ge=0, le=100000)
    output_per_million: float = Field(ge=0, le=100000)


class InsightStatus(BaseModel):
    status: Literal['open', 'under_review', 'resolved', 'dismissed'] = 'resolved'
