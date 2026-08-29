"""
engine/app/agents/secret_field.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Custom Pydantic field type that structurally guarantees hidden fields
cannot leak through serialization.
"""

from typing import Any

from pydantic_core import core_schema
from pydantic import GetCoreSchemaHandler


class SecretFloat:
    """A custom secret type for floats that raises if serialized.

    Attempting to naively serialize a Pydantic model containing this field
    (e.g., via model_dump() or in a FastAPI response) will raise an exception
    unless specifically handled, guaranteeing no silent leakage of private data.
    """

    def __init__(self, value: float | int | str):
        self._secret_value = float(value)

    def get_secret_value(self) -> float:
        """Explicitly retrieve the hidden float value."""
        return self._secret_value

    def __str__(self) -> str:
        return "**********"

    def __repr__(self) -> str:
        return "SecretFloat('**********')"

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, SecretFloat):
            return self.get_secret_value() == other.get_secret_value()
        return False

    def __hash__(self) -> int:
        return hash(self.get_secret_value())

    @classmethod
    def __get_pydantic_core_schema__(
        cls, source_type: Any, handler: GetCoreSchemaHandler
    ) -> core_schema.CoreSchema:
        
        def validate(value: Any, info: core_schema.ValidationInfo) -> "SecretFloat":
            if isinstance(value, SecretFloat):
                return value
            return SecretFloat(value)

        def raise_on_serialize(value: "SecretFloat") -> float:
            raise ValueError("SecretFloat cannot be serialized into API responses")

        return core_schema.with_info_plain_validator_function(
            validate,
            serialization=core_schema.plain_serializer_function_ser_schema(
                raise_on_serialize,
                info_arg=False,
                return_schema=core_schema.float_schema(),
            ),
        )
