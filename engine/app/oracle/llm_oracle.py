import os

from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

class WeatherForecastParser(BaseModel):
    stress_index: float = Field(description="Exogenous stress index from 0 to 1")
    reasoning: str = Field(description="Reasoning for the calculated stress index")

def _build_llm() -> ChatOpenAI:
    """Build a ChatOpenAI instance for the oracle from environment variables.

    Variable priority:
        LLM_ORACLE_MODEL  – model dedicated to the oracle (e.g. z-ai/glm-5.3-free)
        LLM_MODEL         – shared fallback used by negotiation agents
        gpt-4o-mini       – hard default when neither is set
    Also reads:
        LLM_API_KEY / OPENAI_API_KEY – credentials
        LLM_BASE_URL                 – OpenAI-compatible endpoint
    """
    api_key  = os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY")
    base_url = os.environ.get("LLM_BASE_URL")
    model    = (
        os.environ.get("LLM_ORACLE_MODEL")
        or os.environ.get("LLM_MODEL")
        or "gpt-4o-mini"
    )

    kwargs: dict = dict(temperature=0, model=model, api_key=api_key)
    if base_url:
        kwargs["base_url"] = base_url
    return ChatOpenAI(**kwargs)

def fetch_weather_and_predict_stress(temperature: float, cloud_cover: float) -> dict:
    """
    RAG-based Oracle that reads mock exogenous weather data and uses an LLM
    to determine the exogenous grid stress index.
    """
    # In a real Q1 journal, this would retrieve real PJM/NREL weather data via a Retriever
    context = f"The current temperature is {temperature}°C with a cloud cover of {cloud_cover}%."
    
    prompt = PromptTemplate(
        template="You are a smart grid operations AI.\n"
                 "Analyze the following weather data and determine the grid stress index [0.0 to 1.0].\n"
                 "High temperatures increase load (AC). High cloud cover decreases solar generation.\n"
                 "Weather Data: {context}\n"
                 "{format_instructions}\n",
        input_variables=["context"],
        partial_variables={"format_instructions": JsonOutputParser(pydantic_object=WeatherForecastParser).get_format_instructions()}
    )
    
    try:
        llm = _build_llm()
        chain = prompt | llm | JsonOutputParser(pydantic_object=WeatherForecastParser)
        result = chain.invoke({"context": context})
        return result
    except Exception as e:
        # Fallback to deterministic model if LLM fails (e.g. missing API key)
        stress = min(1.0, max(0.0, (temperature - 20) / 20.0 + cloud_cover / 200.0))
        return {"stress_index": stress, "reasoning": f"Fallback calculation: {str(e)}"}
